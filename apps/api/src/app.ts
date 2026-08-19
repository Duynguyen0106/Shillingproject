import { createHash } from "crypto";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { nanoid } from "nanoid";
import { Prisma, PrismaClient, ActionType, FeedPostKind, MissionStatus, Priority, SignalType } from "@prisma/client";
import { computeScore, scoreAttributedClick } from "@shillops/scoring-engine";
import { getAddress, isAddress, verifyMessage } from "viem";
import type { Address, Hex } from "viem";
import { evaluateLeadSeat, sameWallet, type LeadMember, type LeadSeat } from "./lead";
import { parseXCommunityUrl, proofMatchesXCommunity, xCommunityIdFromTask } from "./xcommunity";
import {
  dealPlays,
  extractSignalTarget,
  httpUrl,
  nextUnsubmittedTask,
  serializeNextPlay,
  utcPulseKey,
  type NextPlay
} from "./playbook";
import { z } from "zod";
import {
  fetchDexOrders,
  lookupDexToken,
  normalizeContract,
  parseTokenQuery,
  tokenProofFromOrders,
  tokenTrustSignals,
  type CanonicalToken
} from "./dexscreener";
import { ingestNormalizedPost, kolProfileData, parseWatchHandle, refreshAllCommunityFeeds, refreshCommunityFeed } from "./feed";
import { liveListenerCount, postsCreatedSince, publishLiveFocus, publishLiveProof, publishLiveRaid, snapshotKol, subscribeLiveFeed } from "./livefeed";
import { attachShillState, serializeShillHistory } from "./shill";
import { attachProofState, buildShillCopy, buildShillKit, liveRaiderIds, pickRaidReplyTask, proofIsReplyToRaidTarget, raidReplyAlreadyScored } from "./shillkit";
import { isFocusLive, serializeFocus, focusChangeAllowed, shillAllowedDuringFocus } from "./focus";
import { applyFeedFilters, applyKolFilters, attachKolStats, configuredFeedProvider, fetchReplyByHandle, fetchUserProfile, mentionMatches, parseXHandle, parseXStatusUrl, postHeat } from "./xfeed";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const sessions = new Map<string, { wallet: string }>();
const siweNonces = new Map<string, { address: string; expiresAt: number }>();

const actionBasePoints: Record<ActionType, number> = {
  REPLY: 10,
  SHARE: 6,
  BOOST: 4,
  INVITE: 8
};

const siweStartSchema = z.object({
  wallet: z.string().min(3)
});

const siweVerifySchema = z.object({
  message: z.string().min(20),
  signature: z.string().min(10),
  displayName: z.string().optional()
});

const createCommunitySchema = z.object({
  name: z.string().min(2),
  ticker: z.string().min(2).max(12),
  description: z.string().optional(),
  chainId: z.string().min(2).optional(),
  contractAddress: z.string().min(3).optional(),
  dexUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional()
});

const joinCommunitySchema = z.object({
  wallet: z.string().min(3),
  displayName: z.string().optional()
});

const ingestSignalSchema = z.object({
  communityId: z.string().min(3).optional(),
  chainId: z.string().min(2).optional(),
  contractAddress: z.string().min(3).optional(),
  q: z.string().min(2).optional(),
  type: z.nativeEnum(SignalType),
  severity: z.number().int().min(0).max(100).default(50),
  sourceRef: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).superRefine((data, ctx) => {
  if (!data.communityId && !data.q && !data.contractAddress) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide communityId or a DexScreener contract" });
  }
});

const submissionSchema = z.object({
  wallet: z.string().min(3).optional(),
  proofUrl: z.string().url(),
  proofText: z.string().optional(),
  engagementValue: z.number().int().min(0).max(100).default(0)
});

const createLinkSchema = z.object({
  communityId: z.string().min(3),
  missionId: z.string().optional(),
  targetUrl: z.string().url()
});

const claimSchema = z.object({
  wallet: z.string().min(3).optional()
});

const shillPostSchema = z.object({
  wallet: z.string().min(3).optional(),
  reshill: z.boolean().optional()
});

const feedProofSchema = z.object({
  wallet: z.string().min(3).optional(),
  proofUrl: z.string().trim().url(),
  proofText: z.string().optional()
});

const pinSchema = z.object({
  wallet: z.string().min(3).optional(),
  body: z.string().trim().min(1).max(280)
});

const xCommunitySchema = z.object({
  wallet: z.string().min(3).optional(),
  url: z.string().min(8)
});

const kolWatchSchema = z.object({
  wallet: z.string().min(3).optional(),
  handle: z.string().min(1)
});

const feedQuerySchema = z.object({
  handle: z.string().optional(),
  q: z.string().optional(),
  kind: z.enum(["KOL_POST", "MENTION"]).optional(),
  minFollowers: z.coerce.number().int().min(0).optional(),
  minEngagement: z.coerce.number().int().min(0).optional(),
  sort: z.enum(["new", "hot"]).optional(),
  since: z.string().optional()
});

const feedPostSchema = z.object({
  wallet: z.string().min(3).optional(),
  url: z.string().url(),
  authorHandle: z.string().optional(),
  text: z.string().min(1).max(2000),
  postedAt: z.string().optional(),
  kind: z.nativeEnum(FeedPostKind).optional()
});

const tokenLookupSchema = z.object({
  q: z.string().min(2).optional(),
  chain: z.string().min(2).optional(),
  address: z.string().min(3).optional(),
  wallet: z.string().min(3).optional()
});

const fromTokenSchema = z.object({
  chainId: z.string().min(2).optional(),
  contractAddress: z.string().min(3).optional(),
  q: z.string().min(2).optional(),
  wallet: z.string().min(3).optional()
});

function siweDomain(uri: string): string {
  try {
    return new URL(uri).host || "localhost";
  } catch {
    return "localhost";
  }
}

export function buildSiweMessage(input: { address: string; nonce: string; uri?: string; issuedAt?: string }): string {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const checksum = getAddress(input.address);
  const uri = input.uri ?? appUrl;
  return [
    `${siweDomain(uri)} wants you to sign in with your Ethereum account:`,
    checksum,
    "",
    "Sign in to Shill Ops.",
    "",
    `URI: ${uri}`,
    "Version: 1",
    "Chain ID: 1",
    `Nonce: ${input.nonce}`,
    `Issued At: ${issuedAt}`
  ].join("\n");
}

function parseSiweNonce(message: string): string | null {
  const match = message.match(/^Nonce: (\S+)$/m);
  return match?.[1] ?? null;
}

function parseSiweAddress(message: string): Address | null {
  const lines = message.split("\n");
  const address = lines[1]?.trim();
  if (!address || !isAddress(address)) return null;
  return getAddress(address);
}

function priorityFromSeverity(severity: number): Priority {
  if (severity >= 80) return Priority.HIGH;
  if (severity >= 50) return Priority.MEDIUM;
  return Priority.LOW;
}

export function scoreSubmission(input: { actionType: ActionType; priority: Priority; isEarly: boolean; duplicatePenalty: boolean; engagementValue: number }): number {
  return computeScore({
    basePoints: actionBasePoints[input.actionType] ?? 5,
    isEarly: input.isEarly,
    engagementValue: input.engagementValue,
    highPriority: input.priority === Priority.HIGH,
    duplicatePenalty: input.duplicatePenalty
  });
}

export function missionTtlMs(priority: Priority): number {
  if (priority === Priority.HIGH) return 2 * 60 * 60 * 1000;
  if (priority === Priority.MEDIUM) return 6 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function missionExpiresAt(createdAt: Date, priority: Priority): Date {
  return new Date(createdAt.getTime() + missionTtlMs(priority));
}

function isMissionStale(mission: { status?: string; createdAt?: Date; priority?: Priority }): boolean {
  if (mission.status === MissionStatus.EXPIRED || mission.status === MissionStatus.COMPLETED) return true;
  if (!mission.createdAt || !mission.priority) return false;
  return Date.now() > missionExpiresAt(mission.createdAt, mission.priority).getTime();
}

export function missionClosedReason(mission: { status?: string; createdAt?: Date; priority?: Priority }): string | null {
  if (mission.status === MissionStatus.COMPLETED) return "Mission is completed";
  if (mission.status === MissionStatus.EXPIRED || isMissionStale(mission)) return "Mission has expired";
  return null;
}

function withExpiryFields(mission: { createdAt?: Date; priority?: Priority; status?: MissionStatus }) {
  if (!mission.createdAt || !mission.priority) {
    return { expiresAt: null as string | null, remainingMs: null as number | null };
  }
  const expiresAt = missionExpiresAt(mission.createdAt, mission.priority);
  const remainingMs = mission.status === MissionStatus.ACTIVE
    ? Math.max(0, expiresAt.getTime() - Date.now())
    : 0;
  return {
    expiresAt: expiresAt.toISOString(),
    remainingMs
  };
}

const CLICK_POINTS_CAP_PER_LINK_PER_DAY = 25;

export function hashClickFingerprint(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex").slice(0, 32);
}

export function buildShareCopy(input: {
  title: string;
  signalType?: SignalType | string;
  metadata?: Record<string, unknown>;
  ctaUrl: string;
}): { x: string; telegram: string; discord: string } {
  const ticker = String(input.metadata?.ticker ?? input.metadata?.token ?? "the ticker");
  const headline =
    input.signalType === SignalType.WHALE_BUY || input.signalType === "WHALE_BUY"
      ? `Whale buy on ${ticker}. Push the narrative.`
      : input.signalType === SignalType.MENTION_SPIKE || input.signalType === "MENTION_SPIKE"
        ? `${ticker} mentions are spiking. Boost now.`
        : `Mission live: ${input.title}`;
  return {
    x: `${headline}\n${input.ctaUrl}`,
    telegram: `${headline}\nCTA: ${input.ctaUrl}`,
    discord: `**${headline}**\n${input.ctaUrl}`
  };
}

async function sendWebhookMessage(url: string | undefined, message: string): Promise<boolean> {
  if (!url) return false;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message, content: message })
    });
    return true;
  } catch {
    return false;
  }
}

type NotificationEntry = {
  id: string;
  channel: "TELEGRAM" | "DISCORD";
  message: string;
  delivered: boolean;
  createdAt: string;
};

const notificationLog: NotificationEntry[] = [];

function recordNotification(channel: NotificationEntry["channel"], message: string, delivered: boolean) {
  notificationLog.unshift({
    id: nanoid(8),
    channel,
    message,
    delivered,
    createdAt: new Date().toISOString()
  });
  notificationLog.splice(50);
}

async function dispatchAlert(message: string) {
  const [telegramDelivered, discordDelivered] = await Promise.all([
    sendWebhookMessage(process.env.TELEGRAM_WEBHOOK_URL, message),
    sendWebhookMessage(process.env.DISCORD_WEBHOOK_URL, message)
  ]);
  recordNotification("TELEGRAM", message, telegramDelivered);
  recordNotification("DISCORD", message, discordDelivered);
}

export function buildMissionAlertMessage(input: {
  missionId: string;
  title: string;
  signalType: SignalType | "DAILY_PULSE";
  priority: Priority;
  metadata?: Prisma.JsonValue;
}): string {
  const ctaUrl = `${appUrl}/app/missions/${input.missionId}`;
  const metadata = (input.metadata ?? {}) as Record<string, unknown>;
  const mintLine = mintVerifyLine(metadata);
  if (input.signalType === "DAILY_PULSE") {
    const ticker = String(metadata.ticker ?? "the ticker");
    return `☀️ Daily pulse for ${ticker}\nStanding plays are live. No spike required.\nCTA: Open Mission ${ctaUrl}${mintLine}`;
  }
  if (input.signalType === SignalType.WHALE_BUY) {
    const token = String(metadata.token ?? metadata.ticker ?? "token");
    return `🐋 Whale buy detected for ${token}\nMission auto-created. Push now.\nCTA: Join Mission ${ctaUrl}${mintLine}`;
  }
  if (input.signalType === SignalType.MENTION_SPIKE) {
    const ticker = String(metadata.ticker ?? "ticker");
    const upPct = String(metadata.spikePct ?? "0");
    return `📈 Mention spike: ${ticker} up ${upPct}%\nCommunity action requested.\nCTA: Boost Narrative ${ctaUrl}${mintLine}`;
  }
  return `🔥 New mission live: ${input.title}\nSignal: ${input.signalType} | Priority: ${input.priority}\nCTA: Open Mission ${ctaUrl}${mintLine}`;
}

function mintVerifyLine(metadata: Record<string, unknown>): string {
  const chainId = typeof metadata.chainId === "string" ? metadata.chainId : null;
  const contractAddress = typeof metadata.contractAddress === "string" ? metadata.contractAddress : null;
  if (!chainId || !contractAddress) return "";
  return `\nMint: ${chainId}:${contractAddress}\nVerify: ${appUrl}/c/${chainId}/${contractAddress}`;
}

async function notifyMissionCreated(
  missionId: string,
  title: string,
  signalType: SignalType | "DAILY_PULSE",
  priority: Priority,
  metadata?: Prisma.JsonValue
) {
  const baseMsg = buildMissionAlertMessage({ missionId, title, signalType, priority, metadata });
  await dispatchAlert(baseMsg);
}

async function persistExpiredMissions(prisma: PrismaClient, communityId: string) {
  const active = await prisma.mission.findMany({
    where: { communityId, status: MissionStatus.ACTIVE },
    select: { id: true, createdAt: true, priority: true, status: true }
  });
  const ids = active.filter((mission) => isMissionStale(mission)).map((mission) => mission.id);
  if (ids.length === 0) return ids;
  await prisma.mission.updateMany({ where: { id: { in: ids } }, data: { status: MissionStatus.EXPIRED } });
  return ids;
}

async function createTrackedLink(prisma: PrismaClient, communityId: string, missionId: string, userId?: string) {
  return prisma.shortLink.create({
    data: {
      communityId,
      missionId,
      userId,
      targetUrl: `${appUrl}/app/missions/${missionId}`,
      code: nanoid(8)
    }
  });
}

async function ensureContributorLink(
  prisma: PrismaClient,
  mission: { id: string; communityId: string },
  userId: string
) {
  const existing = await prisma.shortLink.findFirst({
    where: { missionId: mission.id, userId },
    include: { _count: { select: { clicks: true } } }
  });
  if (existing) {
    return {
      id: existing.id,
      code: existing.code,
      targetUrl: existing.targetUrl,
      missionId: existing.missionId,
      clicks: existing._count.clicks
    };
  }
  const created = await createTrackedLink(prisma, mission.communityId, mission.id, userId);
  return {
    id: created.id,
    code: created.code,
    targetUrl: created.targetUrl,
    missionId: created.missionId,
    clicks: 0
  };
}

function signalMeta(metadata: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

async function resolveBoundCommunity(
  prisma: PrismaClient,
  input: { chainId?: string; contractAddress?: string; q?: string }
): Promise<{ community: { id: string; ticker: string; chainId: string | null; contractAddress: string | null } | null; token: CanonicalToken | null }> {
  if (input.chainId && input.contractAddress) {
    const community = await prisma.community.findFirst({
      where: { chainId: input.chainId, contractAddress: normalizeContract(input.contractAddress) }
    });
    return { community, token: null };
  }

  const parsed = input.q
    ? parseTokenQuery(input.q)
    : input.contractAddress
      ? parseTokenQuery(input.contractAddress)
      : null;
  if (!parsed || parsed.kind === "search") return { community: null, token: null };

  if (parsed.kind === "url") {
    const community = await prisma.community.findFirst({
      where: { chainId: parsed.chainId, contractAddress: normalizeContract(parsed.address) }
    });
    if (community) return { community, token: null };
  }

  const address = parsed.kind === "url" || parsed.kind === "address" ? parsed.address : undefined;
  if (address) {
    const community = await prisma.community.findFirst({
      where: { contractAddress: normalizeContract(address) }
    });
    if (community) return { community, token: null };
  }

  const lookup = await lookupDexToken(input.q || input.contractAddress || "");
  if (!lookup?.token) return { community: null, token: null };
  const community = await prisma.community.findFirst({
    where: { chainId: lookup.token.chainId, contractAddress: lookup.token.address }
  });
  return { community, token: lookup.token };
}

function tasksFromDeal(ctx: Parameters<typeof dealPlays>[0]) {
  return dealPlays(ctx).map((play) => ({
    title: play.title,
    details: play.details,
    actionType: play.actionType,
    platform: play.platform,
    basePoints: play.basePoints
  }));
}

async function createMissionFromSignal(
  prisma: PrismaClient,
  signal: { id: string; communityId: string; type: SignalType; severity: number; metadata: Prisma.JsonValue | null }
) {
  const meta = signalMeta(signal.metadata);
  const ticker = typeof meta.ticker === "string" ? meta.ticker : null;
  const chainId = typeof meta.chainId === "string" ? meta.chainId : null;
  const contractAddress = typeof meta.contractAddress === "string" ? meta.contractAddress : null;
  const title = ticker
    ? `${ticker} · ${signal.type.replaceAll("_", " ")} response`
    : `${signal.type.replaceAll("_", " ")} response`;
  const description = contractAddress
    ? `Auto-created from ${signal.type} on ${chainId ?? "chain"} ${contractAddress}. Join only this mint.`
    : `Auto-created mission from ${signal.type} signal`;
  const community = await prisma.community?.findUnique?.({ where: { id: signal.communityId } });
  const tasks = tasksFromDeal({
    signalType: signal.type,
    xCommunityId: community?.xCommunityId,
    dexUrl: community?.dexUrl,
    targetUrl: extractSignalTarget(meta),
    telegramUrl: httpUrl(meta.telegramUrl),
    discordUrl: httpUrl(meta.discordUrl)
  });
  const mission = await prisma.mission.create({
    data: {
      communityId: signal.communityId,
      signalId: signal.id,
      title,
      description,
      priority: priorityFromSeverity(signal.severity),
      urgency: signal.severity,
      tasks: { create: tasks }
    },
    include: { tasks: true, shortLinks: true }
  });
  const shortLink = await createTrackedLink(prisma, signal.communityId, mission.id);
  await notifyMissionCreated(mission.id, mission.title, signal.type, mission.priority, signal.metadata as Prisma.JsonValue | undefined);
  return { ...mission, shortLinks: [...(mission.shortLinks ?? []), shortLink] };
}

async function recordSignalOnFeed(
  prisma: PrismaClient,
  community: { id: string; ticker: string; contractAddress: string | null },
  signal: { type: SignalType; metadata: Prisma.JsonValue | null; sourceRef?: string | null },
  missionId?: string
) {
  const meta = signalMeta(signal.metadata);
  const targetUrl = extractSignalTarget(meta, signal.sourceRef);
  if (!targetUrl) return null;
  const parsed = parseXStatusUrl(targetUrl);
  const handle = parseXHandle(String(meta.authorHandle ?? parsed?.handle ?? "unknown")) ?? "unknown";
  const kind = signal.type === SignalType.MENTION_SPIKE ? FeedPostKind.MENTION : FeedPostKind.KOL_POST;
  const result = await prisma.feedPost?.upsert?.({
    where: { communityId_url: { communityId: community.id, url: parsed?.url ?? targetUrl } },
    update: { missionId: missionId ?? undefined },
    create: {
      communityId: community.id,
      kind,
      url: parsed?.url ?? targetUrl,
      authorHandle: handle,
      authorName: typeof meta.authorName === "string" ? meta.authorName : undefined,
      text: typeof meta.text === "string" ? meta.text.slice(0, 2000) : `${community.ticker} ${signal.type.replaceAll("_", " ")}`,
      postedAt: new Date(),
      missionId
    }
  });
  return result ?? null;
}

async function spawnRaidFromFeedPost(
  prisma: PrismaClient,
  community: { id: string; ticker: string; chainId: string | null; contractAddress: string | null },
  post: { url: string; authorHandle: string; text: string; kind?: string },
  type: SignalType
) {
  const dedupeKey = `${community.id}:${type}:${post.url}`;
  const metadata = {
    ticker: community.ticker,
    chainId: community.chainId,
    contractAddress: community.contractAddress,
    targetUrl: post.url,
    authorHandle: post.authorHandle,
    text: post.text
  };
  const signal = await prisma.signal.upsert({
    where: { dedupeKey },
    update: { severity: type === SignalType.MENTION_SPIKE ? 90 : 70, metadata },
    create: {
      communityId: community.id,
      type,
      severity: type === SignalType.MENTION_SPIKE ? 90 : 70,
      sourceRef: post.url,
      dedupeKey,
      metadata
    }
  });
  let mission = await prisma.mission.findFirst({
    where: { signalId: signal.id },
    include: { tasks: true, shortLinks: true }
  });
  if (!mission) mission = await createMissionFromSignal(prisma, signal);
  return mission;
}

export async function tickFeeds(prisma: PrismaClient) {
  return refreshAllCommunityFeeds(prisma, {
    onNewMention: async ({ communityId, ticker, chainId, contractAddress, post }) => {
      const mission = await spawnRaidFromFeedPost(
        prisma,
        { id: communityId, ticker, chainId, contractAddress },
        post,
        SignalType.MENTION_SPIKE
      );
      await dispatchAlert(
        `📣 ${ticker} mentioned by @${post.authorHandle}\n${post.text.slice(0, 140)}\nShill this post: ${post.url}\nFeed: ${appUrl}/app/feed`
      );
      await prisma.feedPost.update({ where: { id: post.id }, data: { notifiedAt: new Date(), missionId: mission.id } });
      return mission.id;
    }
  });
}

const pulseMissionInclude = {
  tasks: true,
  shortLinks: { where: { userId: null }, include: { _count: { select: { clicks: true } } } },
  _count: { select: { claims: true, checkIns: true } }
} as const;

async function ensureDailyPulse(prisma: PrismaClient, communityId: string) {
  const community = await prisma.community?.findUnique?.({ where: { id: communityId } });
  if (!community) return null;
  const key = utcPulseKey(communityId);
  const existing = await prisma.mission?.findFirst?.({
    where: { communityId, description: { contains: key } },
    include: pulseMissionInclude
  });
  if (existing) return existing.status === MissionStatus.ACTIVE && !isMissionStale(existing) ? existing : null;
  const ticker = community.ticker || "the ticker";
  const tasks = tasksFromDeal({
    pulse: true,
    xCommunityId: community.xCommunityId,
    dexUrl: community.dexUrl
  });
  const mission = await prisma.mission.create({
    data: {
      communityId,
      title: `${ticker} · Daily pulse`,
      description: `Daily standing ops (${key}). Reply, share, invite — no live signal required.`,
      priority: Priority.LOW,
      urgency: 25,
      tasks: { create: tasks }
    },
    include: pulseMissionInclude
  });
  const shortLink = await createTrackedLink(prisma, communityId, mission.id);
  await notifyMissionCreated(mission.id, mission.title, "DAILY_PULSE", mission.priority, {
    ticker,
    chainId: community.chainId,
    contractAddress: community.contractAddress
  });
  return {
    ...mission,
    shortLinks: [
      ...(mission.shortLinks ?? []),
      { ...shortLink, _count: { clicks: 0 } }
    ]
  };
}

function nextPlayFromMission(
  mission: {
    id: string;
    title: string;
    tasks?: {
      id: string;
      title: string;
      details?: string | null;
      actionType?: string;
      platform?: string;
      submissions?: { user?: { wallet: string } }[];
    }[];
  },
  wallet?: string
): NextPlay | null {
  if (!wallet || !mission.tasks?.length) return null;
  const submitted = mission.tasks
    .filter((task) => (task.submissions ?? []).some((sub) => sameWallet(sub.user?.wallet ?? "", wallet)))
    .map((task) => task.id);
  const task = nextUnsubmittedTask(mission.tasks, wallet, mission.id, submitted);
  return task ? serializeNextPlay(task, mission) : null;
}

function nextPlayFromClaims(
  wallet: string,
  claims: {
    mission: {
      id: string;
      title: string;
      status: string;
      urgency?: number;
      tasks?: { id: string; title: string; details?: string | null; actionType?: string; platform?: string }[];
    };
  }[],
  submittedTaskIds: Iterable<string>
): NextPlay | null {
  const done = new Set(submittedTaskIds);
  const active = [...claims]
    .filter((claim) => claim.mission.status === MissionStatus.ACTIVE)
    .sort((a, b) => (b.mission.urgency ?? 0) - (a.mission.urgency ?? 0));
  for (const claim of active) {
    const tasks = claim.mission.tasks ?? [];
    const task = nextUnsubmittedTask(tasks, wallet, claim.mission.id, done);
    if (task) return serializeNextPlay(task, claim.mission);
  }
  return null;
}

function asyncRoute<T extends Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req as T, res, next).catch(next);
  };
}

function walletFromAuth(req: Request): string | undefined {
  const auth = req.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!auth) return undefined;
  return sessions.get(auth)?.wallet;
}

function resolveActorWallet(req: Request): string | undefined {
  return walletFromAuth(req);
}

function serializeShortLinks<T extends { code: string; targetUrl: string; missionId?: string | null; _count?: { clicks: number } }>(links: T[]) {
  return links.map((link) => ({
    code: link.code,
    targetUrl: link.targetUrl,
    missionId: link.missionId,
    clicks: link._count?.clicks ?? 0
  }));
}

async function loadLeadSeat(prisma: PrismaClient, communityId: string): Promise<LeadSeat> {
  const lead = await prisma.communityMember?.findFirst?.({
    where: { communityId, role: "lead" },
    include: { user: { select: { wallet: true, displayName: true } } },
    orderBy: { lastActiveAt: "desc" }
  });
  return evaluateLeadSeat((lead as LeadMember | null) ?? null);
}

async function loadMembership(prisma: PrismaClient, communityId: string, wallet?: string) {
  if (!wallet) return null;
  const user = await prisma.user?.findUnique?.({ where: { wallet } });
  if (!user) return null;
  const member = await prisma.communityMember?.findUnique?.({
    where: { userId_communityId: { userId: user.id, communityId } }
  });
  if (!member) return null;
  return { role: member.role, isLead: member.role === "lead" };
}

async function touchMemberActivity(prisma: PrismaClient, userId: string, communityId: string) {
  await prisma.communityMember?.updateMany?.({
    where: { userId, communityId },
    data: { lastActiveAt: new Date() }
  });
}

async function recordVerifiedSubmission(
  prisma: PrismaClient,
  input: {
    task: { id: string; title: string; actionType: ActionType; createdAt: Date; mission: { communityId: string; priority: Priority } };
    userId: string;
    proofUrl: string;
    proofText?: string;
    engagementValue: number;
  }
) {
  const isEarly = Date.now() - input.task.createdAt.getTime() < 10 * 60 * 1000;
  const duplicatePenalty = Boolean(input.proofText && input.proofText.toLowerCase().includes("copy"));
  const points = scoreSubmission({
    actionType: input.task.actionType,
    priority: input.task.mission.priority,
    isEarly,
    duplicatePenalty,
    engagementValue: input.engagementValue
  });
  const submission = await prisma.submission.create({
    data: {
      taskId: input.task.id,
      userId: input.userId,
      proofUrl: input.proofUrl,
      proofText: input.proofText,
      isVerified: true,
      verifiedAt: new Date(),
      pointsAwarded: points
    }
  });
  await prisma.score.create({
    data: {
      userId: input.userId,
      communityId: input.task.mission.communityId,
      points,
      reason: `Submission for ${input.task.title}`,
      sourceId: submission.id
    }
  });
  await prisma.engagementEvent.create({
    data: { submissionId: submission.id, type: "SUBMISSION", value: input.engagementValue }
  });
  const rows = await prisma.score.groupBy({
    by: ["userId"],
    where: { communityId: input.task.mission.communityId },
    _sum: { points: true },
    orderBy: { _sum: { points: "desc" } },
    take: 50
  });
  await prisma.leaderboardSnapshot.create({
    data: { communityId: input.task.mission.communityId, payload: rows as Prisma.InputJsonValue }
  });
  await touchMemberActivity(prisma, input.userId, input.task.mission.communityId);
  return submission;
}

async function loadTalkTrack(prisma: PrismaClient, communityId: string, missionId?: string | null) {
  if (missionId) {
    const mission = await prisma.mission?.findUnique?.({ where: { id: missionId }, select: { pinText: true } });
    if (mission?.pinText) return mission.pinText;
  }
  const pinned = await prisma.mission?.findFirst?.({
    where: { communityId, pinText: { not: null } },
    orderBy: { pinnedAt: "desc" },
    select: { pinText: true }
  });
  return pinned?.pinText ?? null;
}

async function loadFocusPayload(
  prisma: PrismaClient,
  community: { id: string; focusPostId?: string | null; focusAt?: Date | string | null; focusById?: string | null },
  posts: Array<{ id: string; url: string; authorHandle: string; text?: string | null; kind?: string | null; missionId?: string | null }>
) {
  if (!isFocusLive(community)) return null;
  let post = posts.find((item) => item.id === community.focusPostId) ?? null;
  if (!post && community.focusPostId) {
    post = await prisma.feedPost?.findUnique?.({
      where: { id: community.focusPostId },
      select: { id: true, url: true, authorHandle: true, text: true, kind: true, missionId: true }
    }) ?? null;
  }
  const by = community.focusById
    ? await prisma.user?.findUnique?.({
      where: { id: community.focusById },
      select: { wallet: true, displayName: true }
    }) ?? null
    : null;
  return serializeFocus({
    focusPostId: community.focusPostId,
    focusAt: community.focusAt,
    post,
    by
  });
}

async function decorateFocusWithStats(
  prisma: PrismaClient,
  focus: ReturnType<typeof serializeFocus>,
  viewerUserId?: string | null
) {
  if (!focus) return null;
  const shills = await prisma.feedShill?.findMany?.({
    where: { feedPostId: focus.postId },
    include: { user: { select: { wallet: true, displayName: true } } }
  }) ?? [];
  const proofRows = focus.missionId
    ? await prisma.submission?.findMany?.({
        where: { task: { missionId: focus.missionId } },
        include: {
          task: { select: { missionId: true, details: true } },
          user: { select: { wallet: true, displayName: true } }
        }
      }) ?? []
    : [];
  const withShill = attachShillState([{ id: focus.postId, missionId: focus.missionId }], shills, viewerUserId)[0];
  const withProof = attachProofState([withShill], proofRows, viewerUserId)[0];
  return {
    ...focus,
    youShilled: Boolean(withShill.youShilled),
    youProved: Boolean(withProof.youProved),
    provedCount: withProof.provedCount ?? 0,
    liveProvedCount: withProof.liveProvedCount ?? 0,
    liveRaiderCount: withShill.liveRaiderCount ?? 0,
    raiderCount: withShill.raiderCount ?? 0
  };
}

async function loadCommunityFocus(
  prisma: PrismaClient,
  community?: {
    id: string;
    focusPostId?: string | null;
    focusAt?: Date | string | null;
    focusById?: string | null;
  } | null,
  viewerUserId?: string | null
) {
  if (!community) return null;
  return decorateFocusWithStats(prisma, await loadFocusPayload(prisma, community, []), viewerUserId);
}

async function setFocusRaid(
  prisma: PrismaClient,
  community: { id: string; ticker: string },
  post: { id: string; url: string; authorHandle: string; text?: string | null; kind?: string | null },
  user: { id: string; wallet: string; displayName?: string | null },
  opts?: { announce?: boolean }
) {
  const focusAt = new Date();
  await prisma.community?.update?.({
    where: { id: community.id },
    data: { focusPostId: post.id, focusAt, focusById: user.id }
  });
  const focus = serializeFocus({
    focusPostId: post.id,
    focusAt,
    post,
    by: { wallet: user.wallet, displayName: user.displayName ?? null }
  });
  publishLiveFocus({ type: "focus", communityId: community.id, focus });
  if (opts?.announce !== false) {
    await dispatchAlert(
      `🎯 Focus raid for ${community.ticker}\nEveryone reply to @${post.authorHandle}\n${post.url}\nFeed: ${appUrl}/app/feed`
    );
  }
  return focus;
}

async function loadFocusSteer(prisma: PrismaClient, communityId: string, wallet: string) {
  const seat = await loadLeadSeat(prisma, communityId);
  return {
    isLead: !seat.vacant && sameWallet(seat.wallet, wallet),
    seatVacant: seat.vacant
  };
}

async function promoteLead(prisma: PrismaClient, communityId: string, userId: string) {
  await prisma.communityMember.updateMany({
    where: { communityId, role: "lead" },
    data: { role: "member" }
  });
  await prisma.communityMember.upsert({
    where: { userId_communityId: { userId, communityId } },
    update: { role: "lead", lastActiveAt: new Date() },
    create: { userId, communityId, role: "lead", lastActiveAt: new Date() }
  });
}

function serializeWarRoom(mission: {
  status?: string;
  createdAt?: Date;
  priority?: Priority;
  pinText?: string | null;
  pinnedAt?: Date | null;
  pinnedBy?: { wallet: string; displayName: string | null } | null;
  checkIns?: { createdAt: Date; user: { wallet: string; displayName: string | null } }[];
  claims?: unknown[];
  tasks?: { submissions?: unknown[] }[];
  shortLinks?: { userId?: string | null; _count?: { clicks: number } }[];
}) {
  const checkIns = mission.checkIns ?? [];
  const proofCount = (mission.tasks ?? []).reduce((sum, task) => sum + (task.submissions?.length ?? 0), 0);
  const clickCount = (mission.shortLinks ?? []).reduce((sum, link) => sum + (link._count?.clicks ?? 0), 0);
  return {
    closed: Boolean(missionClosedReason(mission)),
    pin: mission.pinText
      ? {
          body: mission.pinText,
          at: mission.pinnedAt?.toISOString?.() ?? mission.pinnedAt ?? null,
          wallet: mission.pinnedBy?.wallet ?? null,
          displayName: mission.pinnedBy?.displayName ?? null
        }
      : null,
    checkIns: checkIns.map((entry) => ({
      wallet: entry.user.wallet,
      displayName: entry.user.displayName,
      at: entry.createdAt
    })),
    checkInCount: checkIns.length,
    claimsCount: mission.claims?.length ?? 0,
    proofCount,
    clickCount
  };
}

const LIVE_RAID_MS = 15 * 60 * 1000;

// ── Streak helper ─────────────────────────────────────────────
async function touchStreak(prisma: PrismaClient, userId: string): Promise<number> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const streak = await prisma.userStreak.findUnique({ where: { userId } });
  if (!streak) {
    await prisma.userStreak.create({ data: { userId, currentStreak: 1, longestStreak: 1, lastActivityDate: now } });
    return 1;
  }
  const lastStr = streak.lastActivityDate ? new Date(streak.lastActivityDate).toISOString().slice(0, 10) : null;
  if (lastStr === todayStr) return streak.currentStreak;
  const yesterday = new Date(now.getTime() - 86400_000).toISOString().slice(0, 10);
  const newCurrent = lastStr === yesterday ? streak.currentStreak + 1 : 1;
  const newLongest = Math.max(newCurrent, streak.longestStreak);
  await prisma.userStreak.update({ where: { userId }, data: { currentStreak: newCurrent, longestStreak: newLongest, lastActivityDate: now } });
  return newCurrent;
}

// ── Achievement helper ────────────────────────────────────────
const ACHIEVEMENT_DEFS = [
  { slug: "first-shill", title: "First Strike", description: "Complete your first shill", icon: "⚡" },
  { slug: "first-proof", title: "Proof of Work", description: "Score your first raid reply", icon: "✅" },
  { slug: "streak-3", title: "On a Roll", description: "3-day activity streak", icon: "🔥" },
  { slug: "streak-7", title: "Week Warrior", description: "7-day activity streak", icon: "🏆" },
  { slug: "streak-30", title: "Month Grinder", description: "30-day activity streak", icon: "💎" },
  { slug: "shills-10", title: "Shill Machine", description: "Shill 10 posts", icon: "📣" },
  { slug: "shills-50", title: "Megaphone", description: "Shill 50 posts", icon: "📢" },
  { slug: "proofs-5", title: "Raider", description: "Score 5 raid replies", icon: "⚔️" },
  { slug: "top-raider", title: "Top Raider", description: "Be #1 on a raid leaderboard", icon: "👑" },
];

async function checkAndAwardAchievements(
  prisma: PrismaClient,
  userId: string,
  communityId: string,
  streak: number
): Promise<Array<{ slug: string; title: string; icon?: string | null }>> {
  const [shillCount, proofCount, earned] = await Promise.all([
    prisma.feedShill.count({ where: { userId, communityId } }),
    prisma.submission.count({ where: { userId, task: { mission: { communityId } } } }),
    prisma.userAchievement.findMany({ where: { userId }, select: { achievement: { select: { slug: true } } } })
  ]);
  const earnedSlugs = new Set(earned.map((ua) => ua.achievement.slug));
  const toAward: string[] = [];
  if (shillCount === 1 && !earnedSlugs.has("first-shill")) toAward.push("first-shill");
  if (proofCount === 1 && !earnedSlugs.has("first-proof")) toAward.push("first-proof");
  if (streak >= 3 && !earnedSlugs.has("streak-3")) toAward.push("streak-3");
  if (streak >= 7 && !earnedSlugs.has("streak-7")) toAward.push("streak-7");
  if (streak >= 30 && !earnedSlugs.has("streak-30")) toAward.push("streak-30");
  if (shillCount >= 10 && !earnedSlugs.has("shills-10")) toAward.push("shills-10");
  if (shillCount >= 50 && !earnedSlugs.has("shills-50")) toAward.push("shills-50");
  if (proofCount >= 5 && !earnedSlugs.has("proofs-5")) toAward.push("proofs-5");
  if (toAward.length === 0) return [];
  // Ensure achievement rows exist
  for (const def of ACHIEVEMENT_DEFS.filter((d) => toAward.includes(d.slug))) {
    await prisma.achievement.upsert({
      where: { slug: def.slug },
      update: {},
      create: def
    });
  }
  const achievements = await prisma.achievement.findMany({ where: { slug: { in: toAward } } });
  for (const ach of achievements) {
    await prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId: ach.id } },
      update: {},
      create: { userId, achievementId: ach.id }
    }).catch(() => undefined);
  }
  return achievements.map((a) => ({ slug: a.slug, title: a.title, icon: a.icon }));
}

// ── Rate-limit store (in-process, per wallet) ─────────────────
const shillRateLimit = new Map<string, { count: number; resetAt: number }>();
const proofRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(store: Map<string, { count: number; resetAt: number }>, key: string, maxPerWindow: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxPerWindow) return false;
  entry.count += 1;
  return true;
}

async function scheduleReplyAutoScore(
  prisma: PrismaClient,
  opts: {
    userId: string;
    xHandle: string;
    communityId: string;
    postId: string;
    postUrl: string;
    postKind: string;
  }
) {
  const parsed = parseXStatusUrl(opts.postUrl);
  if (!parsed?.id) return;
  // Create a proof job to track status
  const job = await prisma.proofJob.create({
    data: { userId: opts.userId, communityId: opts.communityId, feedPostId: opts.postId, status: "PENDING" }
  }).catch(() => null);
  const updateJob = async (status: "CHECKING" | "SCORED" | "FAILED", extra?: { proofUrl?: string; pointsAwarded?: number; failReason?: string }) => {
    if (!job) return;
    await prisma.proofJob.update({ where: { id: job.id }, data: { status, ...extra } }).catch(() => undefined);
  };
  const delays = [30_000, 90_000, 4 * 60_000, 8 * 60_000];
  for (const delay of delays) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    await updateJob("CHECKING");
    const existing = await prisma.submission?.findFirst?.({
      where: {
        userId: opts.userId,
        task: { mission: { feedPosts: { some: { id: opts.postId } } } }
      }
    });
    if (existing) { await updateJob("SCORED", { proofUrl: existing.proofUrl, pointsAwarded: existing.pointsAwarded }); return; }
    const reply = await fetchReplyByHandle(opts.xHandle, parsed.id, LIVE_RAID_MS).catch(() => null);
    if (!reply) continue;
    const post = await prisma.feedPost.findUnique({ where: { id: opts.postId } });
    if (!post) return;
    const community = await prisma.community.findUnique({ where: { id: opts.communityId } });
    if (!community) return;
    let missionId = post.missionId;
    if (!missionId) {
      const mission = await spawnRaidFromFeedPost(
        prisma,
        community,
        post,
        post.kind === FeedPostKind.MENTION ? SignalType.MENTION_SPIKE : SignalType.KOL_POST
      );
      missionId = mission.id;
      await prisma.feedPost.update({ where: { id: post.id }, data: { missionId } });
    }
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: { tasks: { include: { submissions: { where: { userId: opts.userId }, select: { id: true, taskId: true } } } } }
    });
    if (!mission || mission.status !== MissionStatus.ACTIVE) return;
    const submitted = mission.tasks.filter((task) => (task.submissions?.length ?? 0) > 0).map((task) => task.id);
    if (raidReplyAlreadyScored(mission.tasks, post.url, submitted)) return;
    const task = pickRaidReplyTask(mission.tasks, post.url, submitted);
    if (!task) return;
    const existingSub = await prisma.submission?.findFirst?.({ where: { taskId: task.id, userId: opts.userId } });
    if (existingSub) return;
    await prisma.missionClaim.upsert({
      where: { missionId_userId: { missionId: mission.id, userId: opts.userId } },
      update: {},
      create: { missionId: mission.id, userId: opts.userId }
    });
    const submission = await recordVerifiedSubmission(prisma, {
      task: { ...task, mission },
      userId: opts.userId,
      proofUrl: reply.url,
      proofText: reply.text.slice(0, 500),
      engagementValue: 25
    });
    const scoredRows = await prisma.submission?.findMany?.({
      where: { task: { missionId: mission.id } },
      include: {
        task: { select: { missionId: true, details: true } },
        user: { select: { wallet: true, displayName: true } }
      }
    }) ?? [];
    const scored = attachProofState([{ id: post.id, missionId: mission.id }], scoredRows, opts.userId)[0];
    const provedCount = Math.max(scored.provedCount, 1);
    const liveProvedCount = Math.max(scored.liveProvedCount, 1);
    const user = await prisma.user.findUnique({ where: { id: opts.userId } });
    publishLiveProof({
      type: "proof",
      communityId: opts.communityId,
      postId: post.id,
      url: opts.postUrl,
      provedCount,
      liveProvedCount,
      raider: {
        wallet: user?.wallet ?? "",
        displayName: user?.displayName ?? null
      },
      pointsAwarded: submission.pointsAwarded
    });
    await updateJob("SCORED", { proofUrl: reply.url, pointsAwarded: submission.pointsAwarded });
    return;
  }
  await updateJob("FAILED", { failReason: "Reply not found within time window" });
}

function isAdminWallet(wallet: string): boolean {
  const allowed = process.env.ADMIN_WALLETS?.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean) ?? [];
  if (allowed.length === 0) return false; // fail closed — deny when not configured
  return allowed.includes(wallet.toLowerCase());
}

function requireAdmin(req: Request, res: Response): string | null {
  const wallet = walletFromAuth(req);
  if (!wallet) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (!isAdminWallet(wallet)) { res.status(403).json({ error: "Not admin" }); return null; }
  return wallet;
}

/** Test-only helper: injects a pre-built session token so tests can authenticate without SIWE. */
export function injectTestSession(token: string, wallet: string): void {
  sessions.set(token, { wallet });
}

export function createApp(prisma: PrismaClient) {
  const app = express();
  app.set("trust proxy", 1);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Next.js needs this for RSC
        connectSrc: ["'self'", "https:"],
        imgSrc: ["'self'", "data:", "https:"],
        frameSrc: ["'self'", "https://dexscreener.com"]
      }
    }
  }));

  // Restrict CORS to the known frontend origin
  const allowedOrigin = process.env.APP_URL || "http://localhost:3000";
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || origin === allowedOrigin || allowedOrigin === "*") return cb(null, true);
      cb(new Error("CORS: origin not allowed"));
    },
    credentials: true
  }));

  app.use(express.json({ limit: "64kb" }));

  // Auth rate limiter — strict
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
  // General write limiter
  const writeLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
  // Admin limiter
  const adminLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.post("/auth/siwe/start", authLimiter, asyncRoute(async (req, res) => {
    const { wallet } = siweStartSchema.parse(req.body);
    if (!isAddress(wallet)) return res.status(400).json({ error: "Invalid wallet address" });
    const address = getAddress(wallet);
    const nonce = nanoid(16);
    siweNonces.set(nonce, { address, expiresAt: Date.now() + 10 * 60 * 1000 });
    const message = buildSiweMessage({ address, nonce });
    res.json({ nonce, message, address });
  }));

  app.post("/auth/siwe/verify", authLimiter, asyncRoute(async (req, res) => {
    const { message, signature, displayName } = siweVerifySchema.parse(req.body);
    const nonce = parseSiweNonce(message);
    const address = parseSiweAddress(message);
    const issued = nonce ? siweNonces.get(nonce) : undefined;
    // Always delete nonce (single-use regardless of outcome — MED-1 fix)
    if (nonce) siweNonces.delete(nonce);
    if (!nonce || !address || !issued || issued.expiresAt < Date.now() || issued.address !== address) {
      return res.status(401).json({ error: "Invalid or expired SIWE nonce" });
    }
    const valid = await verifyMessage({
      address,
      message,
      signature: signature as Hex
    });
    if (!valid) return res.status(401).json({ error: "Invalid signature" });

    let user = await prisma.user.findUnique({ where: { wallet: address } });
    if (!user) user = await prisma.user.create({ data: { wallet: address, displayName } });
    const token = nanoid(24);
    sessions.set(token, { wallet: address });
    // Return only safe user fields (no tokens)
    res.json({ token, user: { id: user.id, wallet: user.wallet, displayName: user.displayName, xHandle: user.xHandle, xVerified: user.xVerified } });
  }));

  app.get("/me", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const communityId = String(req.query.communityId || process.env.DEMO_COMMUNITY_ID || "demo-community");

    const [claims, submissions, scoreAgg, leaderboard, links, shills] = await Promise.all([
      prisma.missionClaim.findMany({
        where: { userId: user.id, mission: { communityId } },
        include: {
          mission: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              urgency: true,
              tasks: { select: { id: true, title: true, details: true, actionType: true, platform: true } }
            }
          }
        },
        orderBy: { claimedAt: "desc" }
      }),
      prisma.submission.findMany({
        where: { userId: user.id, task: { mission: { communityId } } },
        include: { task: { select: { id: true, title: true, missionId: true, mission: { select: { title: true } } } } },
        orderBy: { submittedAt: "desc" }
      }),
      prisma.score.aggregate({
        where: { userId: user.id, communityId },
        _sum: { points: true }
      }),
      prisma.score.groupBy({
        by: ["userId"],
        where: { communityId },
        _sum: { points: true },
        orderBy: { _sum: { points: "desc" } }
      }),
      prisma.shortLink.findMany({
        where: { userId: user.id, communityId },
        include: { _count: { select: { clicks: true } }, mission: { select: { title: true } } },
        orderBy: { createdAt: "desc" }
      }),
      prisma.feedShill?.findMany?.({
        where: { userId: user.id, communityId },
        include: {
          feedPost: { select: { id: true, url: true, authorHandle: true, text: true, kind: true, postedAt: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 50
      }) ?? []
    ]);

    const rankIndex = leaderboard.findIndex((row) => row.userId === user.id);
    const nextPlay = nextPlayFromClaims(
      wallet,
      claims,
      submissions.map((submission) => submission.taskId)
    );
    const trackedLinks = links.map((link) => ({
      code: link.code,
      targetUrl: link.targetUrl,
      missionId: link.missionId,
      missionTitle: link.mission?.title ?? null,
      clicks: link._count.clicks
    }));
    res.json({
      id: user.id,
      wallet: user.wallet,
      displayName: user.displayName,
      xHandle: user.xHandle,
      xVerified: user.xVerified,
      xVerifyToken: user.xVerifyToken, // needed for verify flow UI
      communityId,
      points: scoreAgg._sum.points ?? 0,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      clicks: trackedLinks.reduce((sum, link) => sum + link.clicks, 0),
      claimedMissionIds: claims.map((claim) => claim.missionId),
      nextPlay,
      claims: claims.map((claim) => ({
        missionId: claim.mission.id,
        title: claim.mission.title,
        status: claim.mission.status,
        priority: claim.mission.priority,
        claimedAt: claim.claimedAt
      })),
      submissions: submissions.map((submission) => ({
        id: submission.id,
        taskId: submission.taskId,
        taskTitle: submission.task.title,
        missionId: submission.task.missionId,
        missionTitle: submission.task.mission.title,
        proofUrl: submission.proofUrl,
        pointsAwarded: submission.pointsAwarded,
        isVerified: submission.isVerified,
        submittedAt: submission.submittedAt
      })),
      links: trackedLinks,
      shills: (shills ?? []).map((shill) => ({
        id: shill.id,
        at: shill.createdAt,
        reshill: shill.reshill,
        post: shill.feedPost
      })),
      focus: await loadCommunityFocus(
        prisma,
        await prisma.community?.findUnique?.({ where: { id: communityId } }),
        user.id
      )
    });
  }));

  // ── X handle linking ──────────────────────────────────────────
  app.post("/me/x-handle", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const raw = String(req.body?.handle ?? "");
    const handle = parseXHandle(raw);
    if (!handle) return res.status(400).json({ error: "Invalid X handle" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const taken = await prisma.user.findFirst({ where: { xHandle: handle, id: { not: user.id } } });
    if (taken) return res.status(409).json({ error: "Handle already linked to another account" });
    const token = nanoid(12);
    await prisma.user.update({ where: { id: user.id }, data: { xHandle: handle, xVerified: false, xVerifyToken: token } });
    const verifyTweetText = `Verifying my @ShillOps wallet: ${token}`;
    res.json({ handle, verified: false, verifyToken: token, verifyTweetText });
  }));

  app.post("/me/x-handle/verify", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.xHandle) return res.status(400).json({ error: "No X handle linked yet" });
    if (user.xVerified) return res.json({ verified: true, handle: user.xHandle });
    if (!user.xVerifyToken) return res.status(400).json({ error: "No verify token found" });
    const provider = configuredFeedProvider();
    if (provider === "none") {
      return res.status(503).json({ error: "X API not configured — cannot verify handle. Set TWITTERAPI_IO_KEY or TWITTER_BEARER_TOKEN." });
    }
    const { fetchHandleTweets } = await import("./xfeed");
    const recentTweets = await fetchHandleTweets(user.xHandle).catch(() => [] as import("./xfeed").NormalizedPost[]);
    const verified = recentTweets.some((t) => t.text.includes(user.xVerifyToken!));
    if (!verified) return res.status(400).json({ verified: false, error: "Verification tweet not found. Please post the tweet and try again." });
    await prisma.user.update({ where: { id: user.id }, data: { xVerified: true, xVerifyToken: null } });
    res.json({ verified: true, handle: user.xHandle });
  }));

  app.delete("/me/x-handle", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    await prisma.user.update({ where: { id: user.id }, data: { xHandle: null, xVerified: false, xVerifyToken: null } });
    res.json({ ok: true });
  }));

  app.post("/communities", writeLimiter, asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const data = createCommunitySchema.parse(req.body);
    const community = await prisma.community.create({
      data: {
        ...data,
        contractAddress: data.contractAddress ? normalizeContract(data.contractAddress) : undefined
      }
    });
    res.json(community);
  }));

  app.get("/tokens/lookup", asyncRoute(async (req, res) => {
    const parsed = tokenLookupSchema.parse({
      q: req.query.q,
      chain: req.query.chain,
      address: req.query.address,
      wallet: req.query.wallet
    });
    const query = parsed.q || (parsed.chain && parsed.address ? `${parsed.chain}:${parsed.address}` : parsed.address);
    if (!query) return res.status(400).json({ error: "Provide q or address" });
    const lookup = await lookupDexToken(query);
    const token = lookup?.token ?? null;
    const parsedQuery = parseTokenQuery(query);
    let community = null;
    if (token) {
      community = await prisma.community.findFirst({
        where: { chainId: token.chainId, contractAddress: token.address }
      });
    } else if (parsedQuery.kind === "address" || parsedQuery.kind === "url") {
      const address = normalizeContract(parsedQuery.kind === "url" ? parsedQuery.address : parsedQuery.address);
      community = await prisma.community.findFirst({
        where: { contractAddress: address, ...(parsedQuery.kind === "url" ? { chainId: parsedQuery.chainId } : {}) }
      });
    }
    if (!token && !community) return res.status(404).json({ error: "Token not found on DexScreener" });
    const orders = token ? await fetchDexOrders(token.chainId, token.address) : [];
    const proof = tokenProofFromOrders(orders);
    const actorWallet = resolveActorWallet(req);
    const lead = community ? await loadLeadSeat(prisma, community.id) : null;
    const you = community ? await loadMembership(prisma, community.id, actorWallet) : null;
    const viewer = actorWallet ? await prisma.user?.findUnique?.({ where: { wallet: actorWallet } }) : null;
    res.json({
      token,
      listings: lookup?.listings ?? [],
      proof: token ? proof : null,
      trust: token ? tokenTrustSignals(token, parsedQuery.kind === "search", proof) : null,
      community,
      lead,
      you,
      focus: await loadCommunityFocus(prisma, community, viewer?.id),
      ambiguous: parsedQuery.kind === "search",
      warning: "Communities are uniquely bound to a chain + contract. Ignore Telegram/Discord names that do not match this address."
    });
  }));

  app.post("/communities/from-token", asyncRoute(async (req, res) => {
    const body = fromTokenSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const query = body.q || (body.chainId && body.contractAddress ? `${body.chainId}:${body.contractAddress}` : body.contractAddress);
    if (!query) return res.status(400).json({ error: "Provide q or contractAddress" });
    const lookup = await lookupDexToken(query);
    const token = lookup?.token;
    const chainId = token?.chainId || body.chainId;
    const contractAddress = token?.address || (body.contractAddress ? normalizeContract(body.contractAddress) : undefined);
    if (!chainId || !contractAddress) return res.status(404).json({ error: "Token not found on DexScreener" });
    const existing = await prisma.community.findFirst({ where: { chainId, contractAddress } });
    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) user = await prisma.user.create({ data: { wallet } });
    if (existing) {
      await prisma.communityMember.upsert({
        where: { userId_communityId: { userId: user.id, communityId: existing.id } },
        update: { lastActiveAt: new Date() },
        create: { userId: user.id, communityId: existing.id, lastActiveAt: new Date() }
      });
      return res.json({
        community: existing,
        token,
        created: false,
        lead: await loadLeadSeat(prisma, existing.id),
        you: (await loadMembership(prisma, existing.id, wallet)) ?? { role: "member", isLead: false }
      });
    }
    const community = await prisma.community.create({
      data: {
        name: token?.name || contractAddress.slice(0, 10),
        ticker: token?.symbol || "TOKEN",
        description: `Shill Ops community bound to ${contractAddress} on ${chainId}. Not a Telegram group name.`,
        chainId,
        contractAddress,
        dexUrl: token?.dexUrl,
        imageUrl: token?.imageUrl ?? undefined
      }
    });
    await prisma.communityMember.upsert({
      where: { userId_communityId: { userId: user.id, communityId: community.id } },
      update: { role: "lead", lastActiveAt: new Date() },
      create: { userId: user.id, communityId: community.id, role: "lead", lastActiveAt: new Date() }
    });
    res.json({
      community,
      token,
      created: true,
      lead: await loadLeadSeat(prisma, community.id),
      you: { role: "lead", isLead: true }
    });
  }));

  // ── Community-wide leaderboard (ranks all communities by activity) ──
  app.get("/communities/leaderboard", asyncRoute(async (req, res) => {
    const sort = (req.query.sort as string) || "shills"; // shills | members | points | missions
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const communities = await prisma.community.findMany({
      include: {
        _count: {
          select: {
            members: true,
            missions: true,
            feedShills: true,
            feedPosts: true
          }
        }
      }
    });

    // Aggregate points per community
    const pointsAgg = await prisma.score.groupBy({
      by: ["communityId"],
      _sum: { points: true }
    });
    const pointsMap = new Map(pointsAgg.map((r) => [r.communityId, r._sum.points ?? 0]));

    // Active missions in last 48h
    const since48h = new Date(Date.now() - 48 * 3600_000);
    const activeMissions = await prisma.mission.groupBy({
      by: ["communityId"],
      where: { createdAt: { gte: since48h } },
      _count: { id: true }
    });
    const activeMissionsMap = new Map(activeMissions.map((r) => [r.communityId, r._count.id]));

    // Shills in last 24h
    const since24h = new Date(Date.now() - 24 * 3600_000);
    const recentShills = await prisma.feedShill.groupBy({
      by: ["communityId"],
      where: { createdAt: { gte: since24h } },
      _count: { id: true }
    });
    const recentShillsMap = new Map(recentShills.map((r) => [r.communityId, r._count.id]));

    // Is focus raid live?
    const focusLive = communities.filter(
      (c) => c.focusAt && Date.now() - new Date(c.focusAt).getTime() < 60 * 60_000
    ).map((c) => c.id);
    const focusSet = new Set(focusLive);

    const rows = communities.map((c) => ({
      id: c.id,
      name: c.name,
      ticker: c.ticker,
      description: c.description,
      imageUrl: c.imageUrl,
      chainId: c.chainId,
      contractAddress: c.contractAddress,
      dexUrl: c.dexUrl,
      memberCount: c._count.members,
      missionCount: c._count.missions,
      activeMissions24h: activeMissionsMap.get(c.id) ?? 0,
      shillCount: c._count.feedShills,
      shills24h: recentShillsMap.get(c.id) ?? 0,
      totalPoints: pointsMap.get(c.id) ?? 0,
      focusRaidLive: focusSet.has(c.id),
      createdAt: c.createdAt
    }));

    const sorted = rows.sort((a, b) => {
      if (sort === "members") return b.memberCount - a.memberCount;
      if (sort === "points") return b.totalPoints - a.totalPoints;
      if (sort === "missions") return b.activeMissions24h - a.activeMissions24h;
      // default: shills24h, then total shills as tiebreaker
      return b.shills24h - a.shills24h || b.shillCount - a.shillCount;
    });

    res.json(sorted.slice(0, limit).map((r, idx) => ({ ...r, rank: idx + 1 })));
  }));

  app.get("/communities/:id", asyncRoute(async (req, res) => {
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    const wallet = resolveActorWallet(req);
    const viewer = wallet ? await prisma.user?.findUnique?.({ where: { wallet } }) : null;
    res.json({
      ...community,
      lead: await loadLeadSeat(prisma, community.id),
      focus: await loadCommunityFocus(prisma, community, viewer?.id)
    });
  }));

  app.post("/communities/:id/join", writeLimiter, asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Sign in first" });
    const { displayName } = joinCommunitySchema.parse(req.body);
    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) user = await prisma.user.create({ data: { wallet, displayName } });
    const member = await prisma.communityMember.upsert({
      where: { userId_communityId: { userId: user.id, communityId: req.params.id } },
      update: { lastActiveAt: new Date() },
      create: { userId: user.id, communityId: req.params.id, lastActiveAt: new Date() }
    });
    res.json({ ...member, lead: await loadLeadSeat(prisma, req.params.id) });
  }));

  app.post("/communities/:id/lead/resign", writeLimiter, asyncRoute(async (req, res) => {
    const {} = claimSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const member = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: user.id, communityId: req.params.id } }
    });
    if (!member || member.role !== "lead") {
      return res.status(403).json({ error: "Only the current CTO lead can resign" });
    }
    await prisma.communityMember.update({
      where: { id: member.id },
      data: { role: "member", lastActiveAt: new Date() }
    });
    const lead = await loadLeadSeat(prisma, req.params.id);
    res.json({ resigned: true, lead, you: { role: "member", isLead: false } });
  }));

  app.post("/communities/:id/lead/claim", writeLimiter, asyncRoute(async (req, res) => {
    const {} = claimSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    const seat = await loadLeadSeat(prisma, community.id);
    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) user = await prisma.user.create({ data: { wallet } });
    if (!seat.vacant && !sameWallet(seat.wallet, wallet)) {
      return res.status(409).json({
        error: "This mint already has an active CTO lead",
        lead: seat
      });
    }
    await promoteLead(prisma, community.id, user.id);
    const lead = await loadLeadSeat(prisma, community.id);
    res.json({ claimed: true, lead, you: { role: "lead", isLead: true } });
  }));

  app.post("/communities/:id/x-community", asyncRoute(async (req, res) => {
    const { url } = xCommunitySchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    const seat = await loadLeadSeat(prisma, community.id);
    if (seat.vacant || !sameWallet(seat.wallet, wallet)) {
      return res.status(403).json({ error: "Only the active CTO lead can bind the X Community for this mint" });
    }
    const parsed = parseXCommunityUrl(url);
    if (!parsed) {
      return res.status(400).json({ error: "Use an X Community URL like https://x.com/i/communities/123456789" });
    }
    const taken = await prisma.community.findFirst({
      where: { xCommunityId: parsed.id, NOT: { id: community.id } }
    });
    if (taken) {
      return res.status(409).json({ error: "That X Community is already bound to another mint" });
    }
    const updated = await prisma.community.update({
      where: { id: community.id },
      data: { xCommunityId: parsed.id, xCommunityUrl: parsed.url }
    });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (user) await touchMemberActivity(prisma, user.id, community.id);
    res.json({ community: updated, xCommunity: parsed });
  }));

  app.get("/communities/:id/feed", asyncRoute(async (req, res) => {
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    const filters = feedQuerySchema.parse({
      handle: typeof req.query.handle === "string" && req.query.handle ? req.query.handle : undefined,
      q: typeof req.query.q === "string" && req.query.q ? req.query.q : undefined,
      kind: req.query.kind === "KOL_POST" || req.query.kind === "MENTION" ? req.query.kind : undefined,
      minFollowers: req.query.minFollowers ? Number(req.query.minFollowers) : undefined,
      minEngagement: req.query.minEngagement ? Number(req.query.minEngagement) : undefined,
      sort: req.query.sort === "hot" || req.query.sort === "new" ? req.query.sort : undefined,
      since: typeof req.query.since === "string" && req.query.since ? req.query.since : undefined
    });
    const since = filters.since ? new Date(filters.since) : null;
    const viewerWallet = resolveActorWallet(req);
    const [rawPosts, rawKols, shills, viewer, pinned, seat] = await Promise.all([
      prisma.feedPost?.findMany?.({
        where: { communityId: community.id },
        orderBy: { postedAt: "desc" },
        take: 120,
        include: { mission: { select: { id: true, status: true, title: true } }, kolWatch: true }
      }) ?? [],
      prisma.kolWatch?.findMany?.({
        where: { communityId: community.id },
        include: { _count: { select: { posts: true } } }
      }) ?? [],
      prisma.feedShill?.findMany?.({
        where: { communityId: community.id },
        include: {
          user: { select: { wallet: true, displayName: true } },
          feedPost: { select: { id: true, url: true, authorHandle: true, text: true, kind: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 400
      }) ?? [],
      viewerWallet ? prisma.user?.findUnique?.({ where: { wallet: viewerWallet } }) : null,
      prisma.mission?.findFirst?.({
        where: { communityId: community.id, pinText: { not: null } },
        orderBy: { pinnedAt: "desc" },
        select: { pinText: true }
      }) ?? null,
      loadLeadSeat(prisma, community.id)
    ]);
    const fresh = postsCreatedSince(rawPosts, since && !Number.isNaN(since.getTime()) ? since : null);
    const mapped = applyFeedFilters(fresh, filters).slice(0, 50).map((post) => ({
      ...post,
      heat: postHeat(post),
      kol: snapshotKol(post.kolWatch ?? rawKols.find((kol) => kol.handle === post.authorHandle))
    }));
    const posts = attachShillState(mapped, shills, viewer?.id);
    const missionIds = [...new Set(
      posts
        .map((post) => (post as { missionId?: string | null }).missionId)
        .filter((id): id is string => Boolean(id))
    )];
    const proofRows = missionIds.length
      ? await prisma.submission?.findMany?.({
          where: { task: { missionId: { in: missionIds } } },
          include: {
            task: { select: { missionId: true, details: true } },
            user: { select: { wallet: true, displayName: true } }
          },
          orderBy: { submittedAt: "desc" },
          take: 400
        }) ?? []
      : [];
    const withProof = attachProofState(posts, proofRows, viewer?.id);
    const kols = applyKolFilters(attachKolStats(rawKols, rawPosts), filters)
      .sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1));
    const shillHistory = serializeShillHistory(shills.slice(0, 30), viewer?.id).map((item, index) => ({
      ...item,
      post: shills[index]?.feedPost
        ? {
          id: shills[index].feedPost!.id,
          url: shills[index].feedPost!.url,
          authorHandle: shills[index].feedPost!.authorHandle,
          text: shills[index].feedPost!.text,
          kind: shills[index].feedPost!.kind
        }
        : { id: item.feedPostId }
    }));
    const talkTrack = pinned?.pinText ?? null;
    const focusBase = await loadFocusPayload(prisma, community, rawPosts);
    const decorated = withProof.map((post) => ({
      ...post,
      focused: focusBase?.postId === post.id
    }));
    const focusPost = decorated.find((post) => post.id === focusBase?.postId);
    const focus = focusBase
      ? focusPost
        ? {
          ...focusBase,
          youShilled: Boolean(focusPost.youShilled),
          youProved: Boolean(focusPost.youProved),
          provedCount: focusPost.provedCount ?? 0,
          liveProvedCount: focusPost.liveProvedCount ?? 0,
          liveRaiderCount: focusPost.liveRaiderCount ?? 0,
          raiderCount: focusPost.raiderCount ?? 0
        }
        : await decorateFocusWithStats(prisma, focusBase, viewer?.id)
      : null;
    res.json({
      provider: configuredFeedProvider(),
      ticker: community.ticker,
      contractAddress: community.contractAddress,
      talkTrack,
      shillCopy: buildShillCopy({
        ticker: community.ticker,
        contractAddress: community.contractAddress,
        pinText: talkTrack
      }),
      focus,
      you: {
        isLead: Boolean(viewer && !seat.vacant && sameWallet(seat.wallet, viewer.wallet)),
        canSteerFocus: Boolean(viewer && (seat.vacant || sameWallet(seat.wallet, viewer.wallet)))
      },
      filters,
      serverTime: new Date().toISOString(),
      live: true,
      kols,
      posts: decorated,
      shillHistory
    });
  }));

  // Track SSE connections per IP to prevent DoS (MED-14)
  const sseConnections = new Map<string, number>();
  const SSE_MAX_PER_IP = 5;

  app.get("/communities/:id/feed/live", (req, res) => {
    const clientIp = req.ip || "unknown";
    const current = sseConnections.get(clientIp) ?? 0;
    if (current >= SSE_MAX_PER_IP) {
      res.status(429).json({ error: "Too many live connections from this IP" });
      return;
    }
    sseConnections.set(clientIp, current + 1);
    req.on("close", () => {
      const n = (sseConnections.get(clientIp) ?? 1) - 1;
      if (n <= 0) sseConnections.delete(clientIp);
      else sseConnections.set(clientIp, n);
    });
    void (async () => {
      const community = await prisma.community.findUnique({ where: { id: req.params.id } });
      if (!community) {
        res.status(404).json({ error: "Community not found" });
        return;
      }
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") res.flushHeaders();
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, communityId: community.id, listeners: liveListenerCount(community.id) + 1 })}\n\n`);
      const send = (event: { type: string }) => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };
      const unsub = subscribeLiveFeed(community.id, send);
      const ping = setInterval(() => {
        res.write(`: ping\n\n`);
      }, 20_000);
      req.on("close", () => {
        clearInterval(ping);
        unsub();
      });
    })().catch(() => {
      if (!res.headersSent) res.status(500).json({ error: "Live feed failed" });
    });
  });

  app.post("/communities/:id/kols", asyncRoute(async (req, res) => {
    const { handle: rawHandle } = kolWatchSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    const seat = await loadLeadSeat(prisma, community.id);
    if (seat.vacant || !sameWallet(seat.wallet, wallet)) {
      return res.status(403).json({ error: "Only the active CTO lead can add KOL watches" });
    }
    const handle = parseWatchHandle(rawHandle);
    if (!handle) return res.status(400).json({ error: "Use an X handle like @username" });
    const profile = await fetchUserProfile(handle).catch(() => null);
    const watch = await prisma.kolWatch.upsert({
      where: { communityId_handle: { communityId: community.id, handle } },
      update: profile ? kolProfileData(profile) : {},
      create: {
        communityId: community.id,
        handle,
        ...(profile ? kolProfileData(profile) : {})
      }
    });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (user) await touchMemberActivity(prisma, user.id, community.id);
    res.json({ watch, provider: configuredFeedProvider() });
  }));

  app.delete("/communities/:id/kols/:handle", asyncRoute(async (req, res) => {
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const seat = await loadLeadSeat(prisma, req.params.id);
    if (seat.vacant || !sameWallet(seat.wallet, wallet)) {
      return res.status(403).json({ error: "Only the active CTO lead can remove KOL watches" });
    }
    const handle = parseWatchHandle(req.params.handle);
    if (!handle) return res.status(400).json({ error: "Invalid handle" });
    await prisma.kolWatch.deleteMany({ where: { communityId: req.params.id, handle } });
    res.json({ removed: handle });
  }));

  app.post("/communities/:id/feed/refresh", asyncRoute(async (req, res) => {
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    const member = user
      ? await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: user.id, communityId: community.id } }
      })
      : null;
    if (!member) return res.status(403).json({ error: "Join this mint before refreshing the raid feed" });
    await touchMemberActivity(prisma, user!.id, community.id);
    const result = await refreshCommunityFeed(prisma, community.id, {
      onNewMention: async ({ ticker, chainId, contractAddress, post }) => {
        const mission = await spawnRaidFromFeedPost(
          prisma,
          { id: community.id, ticker, chainId, contractAddress },
          post,
          SignalType.MENTION_SPIKE
        );
        await dispatchAlert(
          `📣 ${ticker} mentioned by @${post.authorHandle}\n${post.text.slice(0, 140)}\nShill this post: ${post.url}\nFeed: ${appUrl}/app/feed`
        );
        return mission.id;
      }
    });
    res.json(result);
  }));

  app.post("/communities/:id/feed/posts", writeLimiter, asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const body = feedPostSchema.parse(req.body ?? {});
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    // Restrict to community lead or admin
    const leadSeat = await loadLeadSeat(prisma, req.params.id);
    const isLead = leadSeat.wallet ? sameWallet(leadSeat.wallet, wallet) : false;
    if (!isLead && !isAdminWallet(wallet)) return res.status(403).json({ error: "Only community leads can post" });
    const parsed = parseXStatusUrl(body.url);
    if (!parsed) return res.status(400).json({ error: "Use an X status URL like https://x.com/user/status/123" });
    const handle = parseXHandle(body.authorHandle || parsed.handle || "") ?? parsed.handle ?? "unknown";
    const mention = mentionMatches(body.text, community.ticker, community.contractAddress);
    const result = await ingestNormalizedPost(
      prisma,
      community,
      {
        id: parsed.id,
        url: parsed.url,
        authorHandle: handle,
        text: body.text,
        postedAt: body.postedAt ? new Date(body.postedAt) : new Date()
      },
      body.kind ?? (mention ? FeedPostKind.MENTION : FeedPostKind.KOL_POST)
    );
    if (result.created && result.post.kind === FeedPostKind.MENTION) {
      const mission = await spawnRaidFromFeedPost(prisma, community, result.post, SignalType.MENTION_SPIKE);
      await dispatchAlert(
        `📣 ${community.ticker} mentioned by @${result.post.authorHandle}\n${result.post.text.slice(0, 140)}\nShill this post: ${result.post.url}\nFeed: ${appUrl}/app/feed`
      );
      await prisma.feedPost.update({
        where: { id: result.post.id },
        data: { missionId: mission.id, notifiedAt: new Date() }
      });
      return res.json({ post: { ...result.post, missionId: mission.id }, created: true, mission });
    }
    res.json({ post: result.post, created: result.created });
  }));

  app.post("/communities/:id/feed/:postId/shill", asyncRoute(async (req, res) => {
    const { reshill } = shillPostSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    // Rate-limit: max 30 shills per 5 minutes per wallet
    if (!checkRateLimit(shillRateLimit, wallet, 30, 5 * 60_000)) {
      return res.status(429).json({ error: "Too many shills — slow down." });
    }
    const post = await prisma.feedPost.findUnique({ where: { id: req.params.postId } });
    if (!post || post.communityId !== req.params.id) return res.status(404).json({ error: "Post not found" });
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) user = await prisma.user.create({ data: { wallet } });
    const member = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: user.id, communityId: community.id } }
    });
    if (!member) return res.status(403).json({ error: "Join this mint before shilling" });
    const liveFocus = isFocusLive(community);
    const offFocus = shillAllowedDuringFocus({
      live: liveFocus,
      focusPostId: community.focusPostId,
      postId: post.id
    });
    if (!offFocus.ok) {
      const focus = await loadFocusPayload(prisma, community, [post]);
      return res.status(409).json({
        error: focus?.authorHandle
          ? `Focus raid is on @${focus.authorHandle}. Shill that tweet so replies stack in one thread.`
          : offFocus.error,
        focus
      });
    }
    const prior = await prisma.feedShill?.count?.({ where: { feedPostId: post.id, userId: user.id } }) ?? 0;
    const pinText = await loadTalkTrack(prisma, community.id, post.missionId);
    const kit = buildShillKit({
      ticker: community.ticker,
      contractAddress: community.contractAddress,
      pinText,
      url: post.url
    });
    if (prior > 0 && !reshill) {
      const last = await prisma.feedShill?.findFirst?.({
        where: { feedPostId: post.id, userId: user.id },
        orderBy: { createdAt: "desc" }
      });
      return res.json({
        alreadyShilled: true,
        youShillCount: prior,
        lastShilledAt: last?.createdAt ?? null,
        url: post.url,
        missionId: post.missionId,
        claimed: true,
        kit,
        focus: await loadFocusPayload(prisma, community, [post])
      });
    }
    let missionId = post.missionId;
    if (!missionId) {
      const mission = await spawnRaidFromFeedPost(
        prisma,
        community,
        post,
        post.kind === FeedPostKind.MENTION ? SignalType.MENTION_SPIKE : SignalType.KOL_POST
      );
      missionId = mission.id;
      await prisma.feedPost.update({ where: { id: post.id }, data: { missionId } });
    }
    const mission = await prisma.mission.findUnique({ where: { id: missionId } });
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    await prisma.missionClaim.upsert({
      where: { missionId_userId: { missionId: mission.id, userId: user.id } },
      update: {},
      create: { missionId: mission.id, userId: user.id }
    });
    const shortLink = await ensureContributorLink(prisma, mission, user.id);
    await prisma.missionCheckIn?.upsert?.({
      where: { missionId_userId: { missionId: mission.id, userId: user.id } },
      update: {},
      create: { missionId: mission.id, userId: user.id }
    });
    const shill = await prisma.feedShill?.create?.({
      data: {
        communityId: community.id,
        feedPostId: post.id,
        userId: user.id,
        missionId: mission.id,
        reshill: prior > 0
      }
    });
    const rows = await prisma.feedShill?.findMany?.({
      where: { feedPostId: post.id },
      select: { userId: true, createdAt: true }
    }) ?? [];
    const liveRaiderCount = liveRaiderIds(rows).length;
    const raiderCount = new Set(rows.map((row) => row.userId)).size;
    publishLiveRaid({
      type: "shill",
      communityId: community.id,
      postId: post.id,
      url: post.url,
      reshill: prior > 0,
      raider: { wallet, displayName: user.displayName ?? null },
      liveRaiderCount,
      raiderCount
    });
    await touchMemberActivity(prisma, user.id, community.id);
    const focus = prior === 0 && !isFocusLive(community)
      ? await setFocusRaid(prisma, community, post, user)
      : await loadFocusPayload(prisma, community, [post]);
    // Schedule auto-score if user has a verified X handle
    if (user.xVerified && user.xHandle && prior === 0) {
      scheduleReplyAutoScore(prisma, {
        userId: user.id,
        xHandle: user.xHandle,
        communityId: community.id,
        postId: post.id,
        postUrl: post.url,
        postKind: post.kind as string
      }).catch(() => undefined);
    }
    // Streak + achievements (fire-and-forget)
    void touchStreak(prisma, user.id).then((streak) =>
      checkAndAwardAchievements(prisma, user.id, community.id, streak)
    ).catch(() => undefined);
    res.json({
      url: post.url,
      missionId: mission.id,
      claimed: true,
      alreadyShilled: prior > 0,
      reshill: prior > 0,
      youShillCount: prior + 1,
      liveRaiderCount,
      raiderCount,
      kit,
      focus,
      shill,
      shortLink
    });
  }));

  app.post("/communities/:id/feed/:postId/focus", asyncRoute(async (req, res) => {
    const {} = claimSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const post = await prisma.feedPost.findUnique({ where: { id: req.params.postId } });
    if (!post || post.communityId !== req.params.id) return res.status(404).json({ error: "Post not found" });
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) user = await prisma.user.create({ data: { wallet } });
    const member = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: user.id, communityId: community.id } }
    });
    if (!member) return res.status(403).json({ error: "Join this mint before calling a focus raid" });
    const live = isFocusLive(community);
    const { isLead, seatVacant } = await loadFocusSteer(prisma, community.id, wallet);
    const allowed = focusChangeAllowed({
      action: "set",
      isLead,
      seatVacant,
      live,
      currentPostId: community.focusPostId,
      nextPostId: post.id
    });
    if (!allowed.ok) return res.status(403).json({ error: allowed.error, focus: await loadFocusPayload(prisma, community, [post]) });
    const samePost = live && community.focusPostId === post.id;
    const focus = samePost && !isLead
      ? await loadFocusPayload(prisma, community, [post])
      : await setFocusRaid(prisma, community, post, user, { announce: !(samePost && isLead) });
    await touchMemberActivity(prisma, user.id, community.id);
    res.json({ focus, url: post.url });
  }));

  app.post("/communities/:id/feed/focus/clear", asyncRoute(async (req, res) => {
    const {} = claimSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    const member = user
      ? await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: user.id, communityId: community.id } }
      })
      : null;
    if (!member) return res.status(403).json({ error: "Join this mint before clearing the focus raid" });
    const { isLead, seatVacant } = await loadFocusSteer(prisma, community.id, wallet);
    const allowed = focusChangeAllowed({
      action: "clear",
      isLead,
      seatVacant,
      live: isFocusLive(community),
      currentPostId: community.focusPostId
    });
    if (!allowed.ok) return res.status(403).json({ error: allowed.error, focus: await loadFocusPayload(prisma, community, []) });
    await prisma.community?.update?.({
      where: { id: community.id },
      data: { focusPostId: null, focusAt: null, focusById: null }
    });
    publishLiveFocus({ type: "focus", communityId: community.id, focus: null });
    if (user) await touchMemberActivity(prisma, user.id, community.id);
    res.json({ focus: null, cleared: true });
  }));

  app.post("/communities/:id/feed/:postId/proof", asyncRoute(async (req, res) => {
    const { proofUrl, proofText } = feedProofSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    // Rate-limit: max 10 proofs per 5 minutes per wallet
    if (!checkRateLimit(proofRateLimit, wallet, 10, 5 * 60_000)) {
      return res.status(429).json({ error: "Too many proof submissions — slow down." });
    }
    const post = await prisma.feedPost.findUnique({ where: { id: req.params.postId } });
    if (!post || post.communityId !== req.params.id) return res.status(404).json({ error: "Post not found" });
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) user = await prisma.user.create({ data: { wallet } });
    const member = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: user.id, communityId: community.id } }
    });
    if (!member) return res.status(403).json({ error: "Join this mint before submitting proof" });
    const shilled = await prisma.feedShill?.count?.({ where: { feedPostId: post.id, userId: user.id } }) ?? 0;
    if (shilled < 1) return res.status(403).json({ error: "Shill this tweet first, then paste YOUR reply URL." });
    const raidProof = proofIsReplyToRaidTarget(proofUrl, `play:reply-narrative\ntarget:${post.url}`);
    if (!raidProof.ok) return res.status(400).json({ error: raidProof.error });
    let missionId = post.missionId;
    if (!missionId) {
      const mission = await spawnRaidFromFeedPost(
        prisma,
        community,
        post,
        post.kind === FeedPostKind.MENTION ? SignalType.MENTION_SPIKE : SignalType.KOL_POST
      );
      missionId = mission.id;
      await prisma.feedPost.update({ where: { id: post.id }, data: { missionId } });
    }
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: { tasks: { include: { submissions: { where: { userId: user.id }, select: { id: true, taskId: true } } } } }
    });
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    if (mission.status === MissionStatus.ACTIVE && isMissionStale(mission)) {
      await prisma.mission.update({ where: { id: mission.id }, data: { status: MissionStatus.EXPIRED } });
    }
    const closed = missionClosedReason(mission);
    if (closed) return res.status(409).json({ error: closed });
    await prisma.missionClaim.upsert({
      where: { missionId_userId: { missionId: mission.id, userId: user.id } },
      update: {},
      create: { missionId: mission.id, userId: user.id }
    });
    const submitted = mission.tasks.filter((task) => (task.submissions?.length ?? 0) > 0).map((task) => task.id);
    if (raidReplyAlreadyScored(mission.tasks, post.url, submitted)) {
      return res.status(409).json({ error: "You already scored a reply on this raid.", alreadyProved: true });
    }
    const task = pickRaidReplyTask(mission.tasks, post.url, submitted);
    if (!task) return res.status(404).json({ error: "This raid has no reply task to score." });
    const existing = await prisma.submission?.findFirst?.({
      where: { taskId: task.id, userId: user.id }
    });
    if (existing) return res.status(409).json({ error: "You already scored a reply on this raid.", alreadyProved: true });
    const submission = await recordVerifiedSubmission(prisma, {
      task: { ...task, mission },
      userId: user.id,
      proofUrl,
      proofText,
      engagementValue: 25
    });
    const scoredRows = await prisma.submission?.findMany?.({
      where: { task: { missionId: mission.id } },
      include: {
        task: { select: { missionId: true, details: true } },
        user: { select: { wallet: true, displayName: true } }
      }
    }) ?? [];
    const scored = attachProofState(
      [{ id: post.id, missionId: mission.id }],
      scoredRows,
      user.id
    )[0];
    const provedCount = Math.max(scored.provedCount, 1);
    const liveProvedCount = Math.max(scored.liveProvedCount, 1);
    publishLiveProof({
      type: "proof",
      communityId: community.id,
      postId: post.id,
      url: post.url,
      raider: { wallet, displayName: user.displayName ?? null },
      pointsAwarded: submission.pointsAwarded,
      provedCount,
      liveProvedCount
    });
    // Streak + achievements (fire-and-forget)
    void touchStreak(prisma, user.id).then((streak) =>
      checkAndAwardAchievements(prisma, user.id, community.id, streak)
    ).catch(() => undefined);
    res.json({
      ok: true,
      pointsAwarded: submission.pointsAwarded,
      missionId: mission.id,
      taskId: task.id,
      provedCount,
      liveProvedCount,
      submission
    });
  }));

  app.post("/signals/ingest", writeLimiter, asyncRoute(async (req, res) => {
    // Require API key OR admin wallet
    const apiKey = req.get("x-api-key") ?? req.get("x-signal-key");
    const ingestSecret = process.env.SIGNAL_INGEST_SECRET;
    const callerWallet = walletFromAuth(req);
    const isAuthorized = (ingestSecret && apiKey === ingestSecret) || (callerWallet && isAdminWallet(callerWallet));
    if (!isAuthorized) return res.status(401).json({ error: "Signal ingest requires X-API-Key or admin auth" });
    const body = ingestSignalSchema.parse(req.body);
    const { type, severity, sourceRef, metadata } = body;
    const bindByMint = Boolean(body.q || body.contractAddress);
    let communityId = body.communityId;
    let bound: { id: string; ticker: string; chainId: string | null; contractAddress: string | null } | null = null;
    if (bindByMint) {
      if (body.q && parseTokenQuery(body.q).kind === "search") {
        return res.status(400).json({ error: "Ingest requires a contract or DexScreener URL, not a ticker" });
      }
      const resolved = await resolveBoundCommunity(prisma, body);
      if (!resolved.community) {
        const chainId = resolved.token?.chainId || body.chainId;
        const contractAddress = resolved.token?.address || (body.contractAddress ? normalizeContract(body.contractAddress) : undefined);
        return res.status(404).json({
          error: "No Shill Ops community is bound to this contract yet",
          chainId,
          contractAddress,
          bindPath: chainId && contractAddress ? `/c/${chainId}/${contractAddress}` : undefined
        });
      }
      bound = resolved.community;
      communityId = resolved.community.id;
    }
    if (!communityId) {
      return res.status(400).json({ error: "Provide communityId or a DexScreener contract" });
    }
    const mergedMetadata: Record<string, unknown> = {
      ...(metadata ?? {}),
      ...(bound?.ticker ? { ticker: bound.ticker } : {}),
      ...(bound?.chainId ? { chainId: bound.chainId } : {}),
      ...(bound?.contractAddress ? { contractAddress: bound.contractAddress } : {})
    };
    const targetUrl = extractSignalTarget(mergedMetadata, sourceRef);
    if (targetUrl) mergedMetadata.targetUrl = targetUrl;
    const dedupeKey = `${communityId}:${type}:${sourceRef ?? ""}`;
    const safeMetadata = mergedMetadata as Prisma.InputJsonValue;
    const signal = await prisma.signal.upsert({
      where: { dedupeKey },
      update: { severity, metadata: safeMetadata },
      create: { communityId, type, severity, sourceRef, metadata: safeMetadata, dedupeKey }
    });

    let mission = await prisma.mission.findFirst({
      where: { signalId: signal.id },
      include: { tasks: true, shortLinks: true }
    });
    if (!mission) {
      mission = await createMissionFromSignal(prisma, signal);
    }
    const feedCommunity = bound ?? await prisma.community?.findUnique?.({ where: { id: communityId } });
    if (feedCommunity) {
      await recordSignalOnFeed(prisma, feedCommunity, signal, mission.id);
    }
    const actorWallet = resolveActorWallet(req);
    if (actorWallet) {
      const actor = await prisma.user?.findUnique?.({ where: { wallet: actorWallet } });
      if (actor) await touchMemberActivity(prisma, actor.id, communityId);
    }
    res.json({ signal, mission });
  }));

  app.get("/communities/:id/signals", asyncRoute(async (req, res) => {
    if (!walletFromAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const signals = await prisma.signal.findMany({ where: { communityId: req.params.id }, orderBy: { createdAt: "desc" } });
    res.json(signals);
  }));

  app.get("/communities/:id/missions", asyncRoute(async (req, res) => {
    await persistExpiredMissions(prisma, req.params.id);
    const status = (req.query.status as string | undefined)?.toUpperCase();
    const requested = status ? (status as MissionStatus) : MissionStatus.ACTIVE;
    let missions = await prisma.mission.findMany({
      where: { communityId: req.params.id, status: requested },
      include: pulseMissionInclude,
      orderBy: { createdAt: "desc" }
    });
    if (requested === MissionStatus.ACTIVE && missions.length === 0) {
      const pulse = await ensureDailyPulse(prisma, req.params.id);
      if (pulse) missions = [pulse];
    }
    res.json(missions.map((mission) => ({
      ...mission,
      claimsCount: mission._count?.claims ?? 0,
      checkInCount: mission._count?.checkIns ?? 0,
      shortLinks: serializeShortLinks(mission.shortLinks),
      ...withExpiryFields(mission)
    })));
  }));

  app.get("/communities/:id/activity", asyncRoute(async (req, res) => {
    if (!walletFromAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const [claims, submissions, clickScores, feedShills] = await Promise.all([
      prisma.missionClaim.findMany({
        where: { mission: { communityId: req.params.id } },
        include: {
          user: { select: { wallet: true, displayName: true } },
          mission: { select: { title: true } }
        },
        orderBy: { claimedAt: "desc" },
        take: 20
      }),
      prisma.submission.findMany({
        where: { task: { mission: { communityId: req.params.id } } },
        include: {
          user: { select: { wallet: true, displayName: true } },
          task: { select: { title: true, mission: { select: { title: true } } } }
        },
        orderBy: { submittedAt: "desc" },
        take: 20
      }),
      prisma.score.findMany({
        where: { communityId: req.params.id, reason: { startsWith: "CTA click" } },
        include: { user: { select: { wallet: true, displayName: true } } },
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      prisma.feedShill?.findMany?.({
        where: { communityId: req.params.id },
        include: {
          user: { select: { wallet: true, displayName: true } },
          feedPost: { select: { authorHandle: true, url: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 20
      }) ?? []
    ]);
    const events = [
      ...claims.map((claim) => ({
        type: "CLAIM" as const,
        at: claim.claimedAt,
        wallet: claim.user.wallet,
        displayName: claim.user.displayName,
        title: claim.mission.title,
        points: null as number | null
      })),
      ...submissions.map((submission) => ({
        type: "SUBMISSION" as const,
        at: submission.submittedAt,
        wallet: submission.user.wallet,
        displayName: submission.user.displayName,
        title: `${submission.task.title} · ${submission.task.mission.title}`,
        points: submission.pointsAwarded as number | null
      })),
      ...clickScores.map((score) => ({
        type: "CLICK" as const,
        at: score.createdAt,
        wallet: score.user.wallet,
        displayName: score.user.displayName,
        title: score.reason,
        points: score.points as number | null
      })),
      ...(feedShills ?? []).map((shill) => ({
        type: "SHILL" as const,
        at: shill.createdAt,
        wallet: shill.user.wallet,
        displayName: shill.user.displayName,
        title: `${shill.reshill ? "reshilled" : "shilled"} @${shill.feedPost?.authorHandle ?? "post"}`,
        points: null as number | null
      }))
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 20);
    res.json(events);
  }));

  app.post("/signals/:id/create-mission", adminLimiter, asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const signal = await prisma.signal.findUnique({ where: { id: req.params.id } });
    if (!signal) return res.status(404).json({ error: "Signal not found" });
    let mission = await prisma.mission.findFirst({
      where: { signalId: signal.id },
      include: { tasks: true, shortLinks: true }
    });
    if (!mission) {
      mission = await createMissionFromSignal(prisma, signal);
    }
    res.json(mission);
  }));

  app.get("/missions/:id", asyncRoute(async (req, res) => {
    let mission = await prisma.mission.findUnique({
      where: { id: req.params.id },
      include: {
        tasks: {
          include: {
            submissions: {
              include: { user: { select: { wallet: true, displayName: true } } },
              orderBy: { submittedAt: "desc" }
            }
          }
        },
        signal: true,
        pinnedBy: { select: { wallet: true, displayName: true } },
        shortLinks: { include: { _count: { select: { clicks: true } } } },
        claims: {
          include: { user: { select: { wallet: true, displayName: true } } },
          orderBy: { claimedAt: "desc" }
        },
        checkIns: {
          include: { user: { select: { wallet: true, displayName: true } } },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    if (mission.status === MissionStatus.ACTIVE && isMissionStale(mission)) {
      await prisma.mission.update({ where: { id: mission.id }, data: { status: MissionStatus.EXPIRED } });
      mission = { ...mission, status: MissionStatus.EXPIRED };
    }
    const actorWallet = resolveActorWallet(req);
    res.json({
      ...mission,
      claimsCount: mission.claims.length,
      shortLinks: serializeShortLinks((mission.shortLinks ?? []).filter((link) => !link.userId)),
      warRoom: serializeWarRoom(mission),
      nextPlay: nextPlayFromMission(mission, actorWallet),
      raidTarget: extractSignalTarget(signalMeta(mission.signal?.metadata), mission.signal?.sourceRef),
      focus: await loadCommunityFocus(
        prisma,
        await prisma.community?.findUnique?.({ where: { id: mission.communityId } }),
        actorWallet ? (await prisma.user?.findUnique?.({ where: { wallet: actorWallet } }))?.id : null
      ),
      ...withExpiryFields(mission)
    });
  }));

  app.post("/missions/:id/claim", asyncRoute(async (req, res) => {
    const {} = claimSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) user = await prisma.user.create({ data: { wallet } });
    const mission = await prisma.mission.findUnique({ where: { id: req.params.id } });
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    if (mission.status === MissionStatus.ACTIVE && isMissionStale(mission)) {
      await prisma.mission.update({ where: { id: mission.id }, data: { status: MissionStatus.EXPIRED } });
    }
    const closed = missionClosedReason(mission);
    if (closed) return res.status(409).json({ error: closed });
    const claim = await prisma.missionClaim.upsert({
      where: { missionId_userId: { missionId: mission.id, userId: user.id } },
      update: {},
      create: { missionId: mission.id, userId: user.id }
    });
    const shortLink = await ensureContributorLink(prisma, mission, user.id);
    await prisma.missionCheckIn?.upsert?.({
      where: { missionId_userId: { missionId: mission.id, userId: user.id } },
      update: {},
      create: { missionId: mission.id, userId: user.id }
    });
    await touchMemberActivity(prisma, user.id, mission.communityId);
    res.json({ missionId: mission.id, claimed: true, claim, shortLink });
  }));

  app.post("/missions/:id/pin", asyncRoute(async (req, res) => {
    const { body } = pinSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const mission = await prisma.mission.findUnique({ where: { id: req.params.id } });
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    if (mission.status === MissionStatus.ACTIVE && isMissionStale(mission)) {
      await prisma.mission.update({ where: { id: mission.id }, data: { status: MissionStatus.EXPIRED } });
    }
    const closed = missionClosedReason(mission);
    if (closed) return res.status(409).json({ error: closed });
    const seat = await loadLeadSeat(prisma, mission.communityId);
    if (seat.vacant || !sameWallet(seat.wallet, wallet)) {
      return res.status(403).json({ error: "Only the active CTO lead can pin the war-room narrative" });
    }
    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) user = await prisma.user.create({ data: { wallet } });
    const updated = await prisma.mission.update({
      where: { id: mission.id },
      data: { pinText: body, pinnedAt: new Date(), pinnedById: user.id },
      include: { pinnedBy: { select: { wallet: true, displayName: true } } }
    });
    await touchMemberActivity(prisma, user.id, mission.communityId);
    res.json({
      pinned: true,
      pin: {
        body: updated.pinText,
        at: updated.pinnedAt,
        wallet: updated.pinnedBy?.wallet ?? wallet,
        displayName: updated.pinnedBy?.displayName ?? null
      }
    });
  }));

  app.post("/missions/:id/check-in", asyncRoute(async (req, res) => {
    const {} = claimSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const mission = await prisma.mission.findUnique({ where: { id: req.params.id } });
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    if (mission.status === MissionStatus.ACTIVE && isMissionStale(mission)) {
      await prisma.mission.update({ where: { id: mission.id }, data: { status: MissionStatus.EXPIRED } });
    }
    const closed = missionClosedReason(mission);
    if (closed) return res.status(409).json({ error: closed });
    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) user = await prisma.user.create({ data: { wallet } });
    const membership = await loadMembership(prisma, mission.communityId, wallet);
    if (!membership) {
      return res.status(403).json({ error: "Join this mint before checking in" });
    }
    await prisma.missionCheckIn.upsert({
      where: { missionId_userId: { missionId: mission.id, userId: user.id } },
      update: {},
      create: { missionId: mission.id, userId: user.id }
    });
    await touchMemberActivity(prisma, user.id, mission.communityId);
    const checkInCount = await prisma.missionCheckIn.count({ where: { missionId: mission.id } });
    res.json({ checkedIn: true, checkInCount });
  }));

  app.post("/missions/:id/complete", adminLimiter, asyncRoute(async (req, res) => {
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const mission = await prisma.mission.findUnique({ where: { id: req.params.id } });
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    // Only community lead or admin can complete a mission
    const leadSeat = await loadLeadSeat(prisma, mission.communityId);
    const isLead = leadSeat.wallet ? sameWallet(leadSeat.wallet, wallet) : false;
    if (!isLead && !isAdminWallet(wallet)) return res.status(403).json({ error: "Only community leads can complete missions" });
    if (mission.status === MissionStatus.ACTIVE && isMissionStale(mission)) {
      await prisma.mission.update({ where: { id: mission.id }, data: { status: MissionStatus.EXPIRED } });
    }
    const closed = missionClosedReason(mission);
    if (closed) return res.status(409).json({ error: closed });
    const updated = await prisma.mission.update({ where: { id: req.params.id }, data: { status: MissionStatus.COMPLETED } });
    res.json(updated);
  }));

  app.post("/tasks/:id/submissions", asyncRoute(async (req, res) => {
    const { proofUrl, proofText, engagementValue } = submissionSchema.parse(req.body);
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) user = await prisma.user.create({ data: { wallet } });
    const task = await prisma.missionTask.findUnique({ where: { id: req.params.id }, include: { mission: true } });
    if (!task) return res.status(404).json({ error: "Task not found" });
    const claim = await prisma.missionClaim.findUnique({
      where: { missionId_userId: { missionId: task.missionId, userId: user.id } }
    });
    if (!claim) return res.status(403).json({ error: "Claim this mission before submitting proof" });
    if (task.mission.status === MissionStatus.ACTIVE && isMissionStale(task.mission)) {
      await prisma.mission.update({ where: { id: task.mission.id }, data: { status: MissionStatus.EXPIRED } });
    }
    const closed = missionClosedReason(task.mission);
    if (closed) return res.status(409).json({ error: closed });
    const requiredCommunityId = xCommunityIdFromTask(task.details);
    if (requiredCommunityId && !proofMatchesXCommunity(proofUrl, requiredCommunityId)) {
      return res.status(400).json({
        error: `This bonus task needs a post from the linked X Community (https://x.com/i/communities/${requiredCommunityId}). Reply/KOL proofs on this mission can still be any x.com status URL.`
      });
    }
    const raidProof = proofIsReplyToRaidTarget(proofUrl, task.details);
    if (!raidProof.ok) return res.status(400).json({ error: raidProof.error });
    const submission = await recordVerifiedSubmission(prisma, {
      task,
      userId: user.id,
      proofUrl,
      proofText,
      engagementValue
    });
    res.json(submission);
  }));

  app.get("/communities/:id/leaderboard", asyncRoute(async (req, res) => {
    const rows = await prisma.score.groupBy({
      by: ["userId"],
      where: { communityId: req.params.id },
      _sum: { points: true },
      orderBy: { _sum: { points: "desc" } },
      take: 50
    });
    const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } } });
    const userMap = new Map(users.map((u) => [u.id, u]));
    res.json(rows.map((row, idx) => ({
      rank: idx + 1,
      userId: row.userId,
      wallet: userMap.get(row.userId)?.wallet ?? "unknown",
      displayName: userMap.get(row.userId)?.displayName,
      points: row._sum.points ?? 0
    })));
  }));

  app.post("/submissions/:id/verify", adminLimiter, asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const approved = Boolean(req.body?.approved ?? true);
    const submission = await prisma.submission.update({
      where: { id: req.params.id },
      data: { isVerified: approved, verifiedAt: approved ? new Date() : null }
    });
    res.json(submission);
  }));

  app.post("/links", writeLimiter, asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const { communityId, missionId, targetUrl } = createLinkSchema.parse(req.body);
    // Validate targetUrl is a safe https URL (open redirect prevention — HIGH-3)
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== "https:") return res.status(400).json({ error: "targetUrl must be https" });
    } catch {
      return res.status(400).json({ error: "Invalid targetUrl" });
    }
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const link = await prisma.shortLink.create({ data: { communityId, missionId, targetUrl, userId: user.id, code: nanoid(8) } });
    res.json(link);
  }));

  app.get("/r/:code", asyncRoute(async (req, res) => {
    const link = await prisma.shortLink.findUnique({
      where: { code: req.params.code },
      include: { mission: { select: { status: true, priority: true } } }
    });
    if (!link) return res.status(404).send("Not found");
    // Validate redirect target is safe (HIGH-3)
    try {
      const parsed = new URL(link.targetUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return res.status(400).send("Invalid redirect target");
    } catch {
      return res.status(400).send("Invalid redirect target");
    }
    // Use req.ip which respects trust proxy setting (LOW-3)
    const ip = req.ip || "unknown";
    const userAgent = req.get("user-agent") || "";
    const ipHash = hashClickFingerprint(ip, userAgent);

    const duplicate = link.userId
      ? await prisma.shortLinkClick.findFirst({ where: { shortLinkId: link.id, ipHash } })
      : null;

    await prisma.shortLinkClick.create({
      data: { shortLinkId: link.id, referrer: req.get("referer"), userAgent, ipHash }
    });

    if (link.userId && !duplicate && link.mission?.status !== MissionStatus.COMPLETED && link.mission?.status !== MissionStatus.EXPIRED && !isMissionStale(link.mission ?? {})) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const awardedToday = await prisma.score.aggregate({
        where: {
          userId: link.userId,
          sourceId: link.id,
          createdAt: { gte: dayStart }
        },
        _sum: { points: true }
      });
      if ((awardedToday._sum.points ?? 0) < CLICK_POINTS_CAP_PER_LINK_PER_DAY) {
        const points = scoreAttributedClick({ highPriority: link.mission?.priority === Priority.HIGH });
        await prisma.score.create({
          data: {
            userId: link.userId,
            communityId: link.communityId,
            points,
            reason: `CTA click ${link.code}`,
            sourceId: link.id
          }
        });
        await prisma.engagementEvent.create({
          data: { type: "CLICK", value: 1 }
        });
      }
    }
    res.redirect(link.targetUrl);
  }));

  app.get("/communities/:id/attribution", asyncRoute(async (req, res) => {
    if (!walletFromAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const links = await prisma.shortLink.findMany({
      where: { communityId: req.params.id },
      include: {
        _count: { select: { clicks: true } },
        user: { select: { wallet: true, displayName: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(links.map((l) => ({
      code: l.code,
      targetUrl: l.targetUrl,
      clicks: l._count.clicks,
      missionId: l.missionId,
      wallet: l.user?.wallet ?? null,
      displayName: l.user?.displayName ?? null
    })));
  }));

  app.post("/notifications/telegram/test", adminLimiter, asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await dispatchAlert("Test Telegram mission alert from Shill Ops MVP");
    res.json({ ok: true });
  }));

  app.post("/notifications/discord/test", adminLimiter, asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    await dispatchAlert("Test Discord mission alert from Shill Ops MVP");
    res.json({ ok: true });
  }));

  app.get("/notifications", adminLimiter, asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(notificationLog);
  }));

  // ── Proof job status ──────────────────────────────────────────
  app.get("/me/proof-jobs", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const communityId = String(req.query.communityId || process.env.DEMO_COMMUNITY_ID || "demo-community");
    const jobs = await prisma.proofJob.findMany({
      where: { userId: user.id, communityId },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    res.json(jobs);
  }));

  // ── Streaks ───────────────────────────────────────────────────
  app.get("/me/streak", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const streak = await prisma.userStreak.findUnique({ where: { userId: user.id } });
    res.json(streak ?? { userId: user.id, currentStreak: 0, longestStreak: 0, lastActivityDate: null });
  }));

  // ── Achievements ──────────────────────────────────────────────
  app.get("/me/achievements", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const earned = await prisma.userAchievement.findMany({
      where: { userId: user.id },
      include: { achievement: true },
      orderBy: { earnedAt: "desc" }
    });
    res.json(earned.map((ua) => ({ ...ua.achievement, earnedAt: ua.earnedAt })));
  }));

  app.get("/achievements", asyncRoute(async (_req, res) => {
    const all = await prisma.achievement.findMany({ orderBy: { slug: "asc" } });
    res.json(all);
  }));

  // ── Announcements ─────────────────────────────────────────────
  app.get("/communities/:id/announcements", asyncRoute(async (req, res) => {
    const now = new Date();
    const rows = await prisma.announcement.findMany({
      where: {
        communityId: req.params.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
      },
      include: { author: { select: { wallet: true, displayName: true } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 10
    });
    res.json(rows);
  }));

  app.post("/communities/:id/announcements", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const member = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: user.id, communityId: req.params.id } }
    });
    if (!member || member.role !== "lead") return res.status(403).json({ error: "Only community leads can post announcements" });
    const { text, pinned = false, expiresInHours } = z.object({
      text: z.string().min(1).max(500),
      pinned: z.boolean().optional(),
      expiresInHours: z.number().optional()
    }).parse(req.body);
    const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 3600_000) : undefined;
    const ann = await prisma.announcement.create({
      data: { communityId: req.params.id, authorId: user.id, text, pinned: pinned ?? false, expiresAt }
    });
    res.json(ann);
  }));

  app.delete("/communities/:id/announcements/:annId", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const ann = await prisma.announcement.findUnique({ where: { id: req.params.annId } });
    if (!ann || ann.communityId !== req.params.id) return res.status(404).json({ error: "Not found" });
    const member = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: user.id, communityId: req.params.id } }
    });
    if (!member || member.role !== "lead") return res.status(403).json({ error: "Only leads can delete announcements" });
    await prisma.announcement.delete({ where: { id: ann.id } });
    res.json({ ok: true });
  }));

  // ── Push subscriptions ─────────────────────────────────────────
  app.post("/me/push-subscription", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const { endpoint, p256dh, auth } = z.object({
      endpoint: z.string().url(),
      p256dh: z.string(),
      auth: z.string()
    }).parse(req.body);
    await prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId: user.id, endpoint } },
      update: { p256dh, auth },
      create: { userId: user.id, endpoint, p256dh, auth }
    });
    res.json({ ok: true });
  }));

  app.delete("/me/push-subscription", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } });
    res.json({ ok: true });
  }));

  // ── Redemption ────────────────────────────────────────────────
  app.post("/me/redeem", writeLimiter, asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const { communityId, points } = z.object({
      communityId: z.string(),
      points: z.number().int().min(100)
    }).parse(req.body);
    // Use a transaction to prevent double-spend race condition (MED-10)
    const redemption = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { wallet } });
      if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });
      const scoreAgg = await tx.score.aggregate({
        where: { userId: user.id, communityId },
        _sum: { points: true }
      });
      const redeemed = await tx.redemption.aggregate({
        where: { userId: user.id, communityId },
        _sum: { pointsBurned: true }
      });
      const available = (scoreAgg._sum.points ?? 0) - (redeemed._sum.pointsBurned ?? 0);
      if (available < points) throw Object.assign(new Error(`Only ${available} redeemable points available`), { statusCode: 400 });
      return tx.redemption.create({
        data: { userId: user.id, communityId, pointsBurned: points, status: "pending" }
      });
    }).catch((err: Error & { statusCode?: number }) => {
      if (err.statusCode) {
        res.status(err.statusCode).json({ error: err.message });
        return null;
      }
      throw err;
    });
    if (!redemption) return;
    res.json({ ok: true, redemptionId: redemption.id, pointsBurned: points });
  }));

  app.get("/me/redeem", asyncRoute(async (req, res) => {
    const wallet = walletFromAuth(req);
    if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const communityId = String(req.query.communityId || process.env.DEMO_COMMUNITY_ID || "demo-community");
    const [scoreAgg, redeemed, history] = await Promise.all([
      prisma.score.aggregate({ where: { userId: user.id, communityId }, _sum: { points: true } }),
      prisma.redemption.aggregate({ where: { userId: user.id, communityId }, _sum: { pointsBurned: true } }),
      prisma.redemption.findMany({ where: { userId: user.id, communityId }, orderBy: { createdAt: "desc" }, take: 20 })
    ]);
    const total = scoreAgg._sum.points ?? 0;
    const burned = redeemed._sum.pointsBurned ?? 0;
    res.json({ total, burned, available: total - burned, history });
  }));

  // ── Per-raid leaderboard ──────────────────────────────────────
  app.get("/communities/:id/feed/:postId/leaderboard", asyncRoute(async (req, res) => {
    const post = await prisma.feedPost.findUnique({ where: { id: req.params.postId } });
    if (!post || post.communityId !== req.params.id) return res.status(404).json({ error: "Post not found" });
    const missionId = post.missionId;
    if (!missionId) return res.json({ entries: [] });
    const submissions = await prisma.submission.findMany({
      where: { task: { missionId } },
      include: { user: { select: { wallet: true, displayName: true } } },
      orderBy: { pointsAwarded: "desc" }
    });
    const byUser = new Map<string, { wallet: string; displayName: string | null; points: number; proofs: number }>();
    for (const sub of submissions) {
      const key = sub.userId;
      const existing = byUser.get(key);
      if (existing) {
        existing.points += sub.pointsAwarded;
        existing.proofs += 1;
      } else {
        byUser.set(key, { wallet: sub.user.wallet, displayName: sub.user.displayName, points: sub.pointsAwarded, proofs: 1 });
      }
    }
    const entries = [...byUser.values()].sort((a, b) => b.points - a.points).slice(0, 20);
    res.json({ entries, missionId });
  }));

  // ── Admin: rate-limit abuse flags ─────────────────────────────
  app.get("/admin/abuse-flags", adminLimiter, asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const since = new Date(Date.now() - 24 * 3600_000);
    const heavyShillers = await prisma.feedShill.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      having: { id: { _count: { gt: 50 } } }
    });
    const heavyProofers = await prisma.submission.groupBy({
      by: ["userId"],
      where: { submittedAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      having: { id: { _count: { gt: 20 } } }
    });
    const userIds = [...new Set([...heavyShillers.map((r) => r.userId), ...heavyProofers.map((r) => r.userId)])];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, wallet: true, displayName: true } });
    const userMap = new Map(users.map((u) => [u.id, u]));
    res.json({
      heavyShillers: heavyShillers.map((r) => ({ ...userMap.get(r.userId), shills24h: r._count.id })),
      heavyProofers: heavyProofers.map((r) => ({ ...userMap.get(r.userId), proofs24h: r._count.id }))
    });
  }));

  app.get("/admin/stats", adminLimiter, asyncRoute(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const since24h = new Date(Date.now() - 24 * 3600_000);
    const [users, communities, shills24h, proofs24h, activeMembers24h] = await Promise.all([
      prisma.user.count(),
      prisma.community.count(),
      prisma.feedShill.count({ where: { createdAt: { gte: since24h } } }),
      prisma.submission.count({ where: { submittedAt: { gte: since24h } } }),
      prisma.feedShill.groupBy({ by: ["userId"], where: { createdAt: { gte: since24h } } }).then((rows) => rows.length)
    ]);
    res.json({ users, communities, shills24h, proofs24h, activeMembers24h });
  }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: err.issues });
    }
    return res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
