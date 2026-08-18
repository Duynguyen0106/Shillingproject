import { createHash } from "crypto";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { Prisma, PrismaClient, ActionType, MissionStatus, Platform, Priority, SignalType } from "@prisma/client";
import { computeScore, scoreAttributedClick } from "@shillops/scoring-engine";
import { getAddress, isAddress, verifyMessage } from "viem";
import type { Address, Hex } from "viem";
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
  engagementValue: z.number().int().min(0).default(0)
});

const createLinkSchema = z.object({
  communityId: z.string().min(3),
  missionId: z.string().optional(),
  targetUrl: z.string().url()
});

const claimSchema = z.object({
  wallet: z.string().min(3).optional()
});

const tokenLookupSchema = z.object({
  q: z.string().min(2).optional(),
  chain: z.string().min(2).optional(),
  address: z.string().min(3).optional()
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
  signalType: SignalType;
  priority: Priority;
  metadata?: Prisma.JsonValue;
}): string {
  const ctaUrl = `${appUrl}/app/missions/${input.missionId}`;
  const metadata = (input.metadata ?? {}) as Record<string, unknown>;
  const mintLine = mintVerifyLine(metadata);
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
  signalType: SignalType,
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
  const mission = await prisma.mission.create({
    data: {
      communityId: signal.communityId,
      signalId: signal.id,
      title,
      description,
      priority: priorityFromSeverity(signal.severity),
      urgency: signal.severity,
      tasks: {
        create: [
          { title: "Reply with narrative", actionType: ActionType.REPLY, platform: Platform.X, basePoints: 10 },
          { title: "Share in Telegram", actionType: ActionType.SHARE, platform: Platform.TELEGRAM, basePoints: 6 }
        ]
      }
    },
    include: { tasks: true, shortLinks: true }
  });
  const shortLink = await createTrackedLink(prisma, signal.communityId, mission.id);
  await notifyMissionCreated(mission.id, mission.title, signal.type, mission.priority, signal.metadata as Prisma.JsonValue | undefined);
  return { ...mission, shortLinks: [...(mission.shortLinks ?? []), shortLink] };
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

function resolveActorWallet(req: Request, bodyWallet?: string): string | undefined {
  return walletFromAuth(req) || bodyWallet;
}

function serializeShortLinks<T extends { code: string; targetUrl: string; missionId?: string | null; _count?: { clicks: number } }>(links: T[]) {
  return links.map((link) => ({
    code: link.code,
    targetUrl: link.targetUrl,
    missionId: link.missionId,
    clicks: link._count?.clicks ?? 0
  }));
}

export function createApp(prisma: PrismaClient) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.post("/auth/siwe/start", asyncRoute(async (req, res) => {
    const { wallet } = siweStartSchema.parse(req.body);
    if (!isAddress(wallet)) return res.status(400).json({ error: "Invalid wallet address" });
    const address = getAddress(wallet);
    const nonce = nanoid(16);
    siweNonces.set(nonce, { address, expiresAt: Date.now() + 10 * 60 * 1000 });
    const message = buildSiweMessage({ address, nonce });
    res.json({ nonce, message, address });
  }));

  app.post("/auth/siwe/verify", asyncRoute(async (req, res) => {
    const { message, signature, displayName } = siweVerifySchema.parse(req.body);
    const nonce = parseSiweNonce(message);
    const address = parseSiweAddress(message);
    const issued = nonce ? siweNonces.get(nonce) : undefined;
    if (!nonce || !address || !issued || issued.expiresAt < Date.now() || issued.address !== address) {
      return res.status(401).json({ error: "Invalid or expired SIWE nonce" });
    }
    const valid = await verifyMessage({
      address,
      message,
      signature: signature as Hex
    });
    if (!valid) return res.status(401).json({ error: "Invalid signature" });
    siweNonces.delete(nonce);

    let user = await prisma.user.findUnique({ where: { wallet: address } });
    if (!user) user = await prisma.user.create({ data: { wallet: address, displayName } });
    const token = nanoid(24);
    sessions.set(token, { wallet: address });
    res.json({ token, user });
  }));

  app.get("/me", asyncRoute(async (req, res) => {
    const header = req.get("authorization");
    let wallet = "";
    if (header) {
      const token = header.replace(/^Bearer\s+/i, "").trim();
      wallet = sessions.get(token)?.wallet ?? "";
      if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    } else {
      wallet = String(req.query.wallet || "");
      if (!wallet) return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const communityId = String(req.query.communityId || process.env.DEMO_COMMUNITY_ID || "demo-community");

    const [claims, submissions, scoreAgg, leaderboard, links] = await Promise.all([
      prisma.missionClaim.findMany({
        where: { userId: user.id, mission: { communityId } },
        include: { mission: { select: { id: true, title: true, status: true, priority: true, urgency: true } } },
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
      })
    ]);

    const rankIndex = leaderboard.findIndex((row) => row.userId === user.id);
    const trackedLinks = links.map((link) => ({
      code: link.code,
      targetUrl: link.targetUrl,
      missionId: link.missionId,
      missionTitle: link.mission?.title ?? null,
      clicks: link._count.clicks
    }));
    res.json({
      ...user,
      communityId,
      points: scoreAgg._sum.points ?? 0,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      clicks: trackedLinks.reduce((sum, link) => sum + link.clicks, 0),
      claimedMissionIds: claims.map((claim) => claim.missionId),
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
      links: trackedLinks
    });
  }));

  app.post("/communities", asyncRoute(async (req, res) => {
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
      address: req.query.address
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
    res.json({
      token,
      listings: lookup?.listings ?? [],
      proof: token ? proof : null,
      trust: token ? tokenTrustSignals(token, parsedQuery.kind === "search", proof) : null,
      community,
      ambiguous: parsedQuery.kind === "search",
      warning: "Communities are uniquely bound to a chain + contract. Ignore Telegram/Discord names that do not match this address."
    });
  }));

  app.post("/communities/from-token", asyncRoute(async (req, res) => {
    const body = fromTokenSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req, body.wallet);
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
        update: {},
        create: { userId: user.id, communityId: existing.id }
      });
      return res.json({ community: existing, token, created: false });
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
      update: {},
      create: { userId: user.id, communityId: community.id, role: "lead" }
    });
    res.json({ community, token, created: true });
  }));

  app.get("/communities/:id", asyncRoute(async (req, res) => {
    const community = await prisma.community.findUnique({ where: { id: req.params.id } });
    if (!community) return res.status(404).json({ error: "Community not found" });
    res.json(community);
  }));

  app.post("/communities/:id/join", asyncRoute(async (req, res) => {
    const { wallet, displayName } = joinCommunitySchema.parse(req.body);
    let user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) user = await prisma.user.create({ data: { wallet, displayName } });
    const member = await prisma.communityMember.upsert({
      where: { userId_communityId: { userId: user.id, communityId: req.params.id } },
      update: {},
      create: { userId: user.id, communityId: req.params.id }
    });
    res.json(member);
  }));

  app.post("/signals/ingest", asyncRoute(async (req, res) => {
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
    const mergedMetadata = {
      ...(metadata ?? {}),
      ...(bound?.ticker ? { ticker: bound.ticker } : {}),
      ...(bound?.chainId ? { chainId: bound.chainId } : {}),
      ...(bound?.contractAddress ? { contractAddress: bound.contractAddress } : {})
    };
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
    res.json({ signal, mission });
  }));

  app.get("/communities/:id/signals", asyncRoute(async (req, res) => {
    const signals = await prisma.signal.findMany({ where: { communityId: req.params.id }, orderBy: { createdAt: "desc" } });
    res.json(signals);
  }));

  app.get("/communities/:id/missions", asyncRoute(async (req, res) => {
    await persistExpiredMissions(prisma, req.params.id);
    const status = (req.query.status as string | undefined)?.toUpperCase();
    const missions = await prisma.mission.findMany({
      where: { communityId: req.params.id, status: status ? (status as MissionStatus) : MissionStatus.ACTIVE },
      include: {
        tasks: true,
        shortLinks: { where: { userId: null }, include: { _count: { select: { clicks: true } } } },
        _count: { select: { claims: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(missions.map((mission) => ({
      ...mission,
      claimsCount: mission._count.claims,
      shortLinks: serializeShortLinks(mission.shortLinks),
      ...withExpiryFields(mission)
    })));
  }));

  app.get("/communities/:id/activity", asyncRoute(async (req, res) => {
    const [claims, submissions, clickScores] = await Promise.all([
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
      })
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
      }))
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 20);
    res.json(events);
  }));

  app.post("/signals/:id/create-mission", asyncRoute(async (req, res) => {
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
        shortLinks: { where: { userId: null }, include: { _count: { select: { clicks: true } } } },
        claims: {
          include: { user: { select: { wallet: true, displayName: true } } },
          orderBy: { claimedAt: "desc" }
        }
      }
    });
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    if (mission.status === MissionStatus.ACTIVE && isMissionStale(mission)) {
      await prisma.mission.update({ where: { id: mission.id }, data: { status: MissionStatus.EXPIRED } });
      mission = { ...mission, status: MissionStatus.EXPIRED };
    }
    res.json({
      ...mission,
      claimsCount: mission.claims.length,
      shortLinks: serializeShortLinks(mission.shortLinks),
      ...withExpiryFields(mission)
    });
  }));

  app.post("/missions/:id/claim", asyncRoute(async (req, res) => {
    const { wallet: bodyWallet } = claimSchema.parse(req.body ?? {});
    const wallet = resolveActorWallet(req, bodyWallet);
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
    res.json({ missionId: mission.id, claimed: true, claim, shortLink });
  }));

  app.post("/missions/:id/complete", asyncRoute(async (req, res) => {
    const wallet = resolveActorWallet(req);
    if (!wallet) return res.status(401).json({ error: "Connect a wallet and sign in first" });
    const mission = await prisma.mission.findUnique({ where: { id: req.params.id } });
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    if (mission.status === MissionStatus.ACTIVE && isMissionStale(mission)) {
      await prisma.mission.update({ where: { id: mission.id }, data: { status: MissionStatus.EXPIRED } });
    }
    const closed = missionClosedReason(mission);
    if (closed) return res.status(409).json({ error: closed });
    const updated = await prisma.mission.update({ where: { id: req.params.id }, data: { status: MissionStatus.COMPLETED } });
    res.json(updated);
  }));

  app.post("/tasks/:id/submissions", asyncRoute(async (req, res) => {
    const { wallet: bodyWallet, proofUrl, proofText, engagementValue } = submissionSchema.parse(req.body);
    const wallet = resolveActorWallet(req, bodyWallet);
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
    const isEarly = Date.now() - task.createdAt.getTime() < 10 * 60 * 1000;
    const duplicatePenalty = Boolean(proofText && proofText.length > 0 && proofText.toLowerCase().includes("copy"));
    const points = scoreSubmission({ actionType: task.actionType, priority: task.mission.priority, isEarly, duplicatePenalty, engagementValue });

    const submission = await prisma.submission.create({
      data: { taskId: task.id, userId: user.id, proofUrl, proofText, isVerified: true, verifiedAt: new Date(), pointsAwarded: points }
    });

    await prisma.score.create({
      data: { userId: user.id, communityId: task.mission.communityId, points, reason: `Submission for ${task.title}`, sourceId: submission.id }
    });

    await prisma.engagementEvent.create({
      data: { submissionId: submission.id, type: "SUBMISSION", value: engagementValue }
    });

    const rows = await prisma.score.groupBy({
      by: ["userId"],
      where: { communityId: task.mission.communityId },
      _sum: { points: true },
      orderBy: { _sum: { points: "desc" } },
      take: 50
    });
    await prisma.leaderboardSnapshot.create({
      data: { communityId: task.mission.communityId, payload: rows as Prisma.InputJsonValue }
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

  app.post("/submissions/:id/verify", asyncRoute(async (req, res) => {
    const approved = Boolean(req.body?.approved ?? true);
    const submission = await prisma.submission.update({
      where: { id: req.params.id },
      data: { isVerified: approved, verifiedAt: approved ? new Date() : null }
    });
    res.json(submission);
  }));

  app.post("/links", asyncRoute(async (req, res) => {
    const { communityId, missionId, targetUrl } = createLinkSchema.parse(req.body);
    const link = await prisma.shortLink.create({ data: { communityId, missionId, targetUrl, code: nanoid(8) } });
    res.json(link);
  }));

  app.get("/r/:code", asyncRoute(async (req, res) => {
    const link = await prisma.shortLink.findUnique({
      where: { code: req.params.code },
      include: { mission: { select: { status: true, priority: true } } }
    });
    if (!link) return res.status(404).send("Not found");
    const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || req.ip || "unknown";
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

  app.post("/notifications/telegram/test", asyncRoute(async (_req, res) => {
    await dispatchAlert("Test Telegram mission alert from Shill Ops MVP");
    res.json({ ok: true });
  }));

  app.post("/notifications/discord/test", asyncRoute(async (_req, res) => {
    await dispatchAlert("Test Discord mission alert from Shill Ops MVP");
    res.json({ ok: true });
  }));

  app.get("/notifications", asyncRoute(async (_req, res) => {
    res.json(notificationLog);
  }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: err.issues });
    }
    return res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
