import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { Prisma, PrismaClient, ActionType, MissionStatus, Platform, Priority, SignalType } from "@prisma/client";
import { computeScore } from "@shillops/scoring-engine";
import { getAddress, isAddress, verifyMessage } from "viem";
import type { Address, Hex } from "viem";
import { z } from "zod";

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
  description: z.string().optional()
});

const joinCommunitySchema = z.object({
  wallet: z.string().min(3),
  displayName: z.string().optional()
});

const ingestSignalSchema = z.object({
  communityId: z.string().min(3),
  type: z.nativeEnum(SignalType),
  severity: z.number().int().min(0).max(100).default(50),
  sourceRef: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
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

export function buildSiweMessage(input: { address: string; nonce: string; uri?: string; issuedAt?: string }): string {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const checksum = getAddress(input.address);
  return [
    "localhost wants you to sign in with your Ethereum account:",
    checksum,
    "",
    "Sign in to Shill Ops.",
    "",
    `URI: ${input.uri ?? appUrl}`,
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
  if (input.signalType === SignalType.WHALE_BUY) {
    const token = String(metadata.token ?? "token");
    return `🐋 Whale buy detected for ${token}\nMission auto-created. Push now.\nCTA: Join Mission ${ctaUrl}`;
  }
  if (input.signalType === SignalType.MENTION_SPIKE) {
    const ticker = String(metadata.ticker ?? "ticker");
    const upPct = String(metadata.spikePct ?? "0");
    return `📈 Mention spike: ${ticker} up ${upPct}%\nCommunity action requested.\nCTA: Boost Narrative ${ctaUrl}`;
  }
  return `🔥 New mission live: ${input.title}\nSignal: ${input.signalType} | Priority: ${input.priority}\nCTA: Open Mission ${ctaUrl}`;
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

async function createTrackedLink(prisma: PrismaClient, communityId: string, missionId: string) {
  return prisma.shortLink.create({
    data: {
      communityId,
      missionId,
      targetUrl: `${appUrl}/app/missions/${missionId}`,
      code: nanoid(8)
    }
  });
}

async function createMissionFromSignal(
  prisma: PrismaClient,
  signal: { id: string; communityId: string; type: SignalType; severity: number; metadata: Prisma.JsonValue | null }
) {
  const mission = await prisma.mission.create({
    data: {
      communityId: signal.communityId,
      signalId: signal.id,
      title: `${signal.type.replaceAll("_", " ")} response`,
      description: `Auto-created mission from ${signal.type} signal`,
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

    const [claims, submissions, scoreAgg, leaderboard] = await Promise.all([
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
      })
    ]);

    const rankIndex = leaderboard.findIndex((row) => row.userId === user.id);
    res.json({
      ...user,
      communityId,
      points: scoreAgg._sum.points ?? 0,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
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
      }))
    });
  }));

  app.post("/communities", asyncRoute(async (req, res) => {
    const data = createCommunitySchema.parse(req.body);
    const community = await prisma.community.create({ data });
    res.json(community);
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
    const { communityId, type, severity, sourceRef, metadata } = ingestSignalSchema.parse(req.body);
    const dedupeKey = `${communityId}:${type}:${sourceRef ?? ""}`;
    const safeMetadata = (metadata ?? undefined) as Prisma.InputJsonValue | undefined;
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
    const status = (req.query.status as string | undefined)?.toUpperCase();
    const missions = await prisma.mission.findMany({
      where: { communityId: req.params.id, status: status ? (status as MissionStatus) : MissionStatus.ACTIVE },
      include: {
        tasks: true,
        shortLinks: { include: { _count: { select: { clicks: true } } } },
        _count: { select: { claims: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(missions.map((mission) => ({
      ...mission,
      claimsCount: mission._count.claims,
      shortLinks: serializeShortLinks(mission.shortLinks)
    })));
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
    const mission = await prisma.mission.findUnique({
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
        shortLinks: { include: { _count: { select: { clicks: true } } } },
        claims: {
          include: { user: { select: { wallet: true, displayName: true } } },
          orderBy: { claimedAt: "desc" }
        }
      }
    });
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    res.json({
      ...mission,
      claimsCount: mission.claims.length,
      shortLinks: serializeShortLinks(mission.shortLinks)
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
    const claim = await prisma.missionClaim.upsert({
      where: { missionId_userId: { missionId: mission.id, userId: user.id } },
      update: {},
      create: { missionId: mission.id, userId: user.id }
    });
    res.json({ missionId: mission.id, claimed: true, claim });
  }));

  app.post("/missions/:id/complete", asyncRoute(async (req, res) => {
    const mission = await prisma.mission.update({ where: { id: req.params.id }, data: { status: MissionStatus.COMPLETED } });
    res.json(mission);
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
    const link = await prisma.shortLink.findUnique({ where: { code: req.params.code } });
    if (!link) return res.status(404).send("Not found");
    await prisma.shortLinkClick.create({
      data: { shortLinkId: link.id, referrer: req.get("referer"), userAgent: req.get("user-agent") }
    });
    res.redirect(link.targetUrl);
  }));

  app.get("/communities/:id/attribution", asyncRoute(async (req, res) => {
    const links = await prisma.shortLink.findMany({
      where: { communityId: req.params.id },
      include: { _count: { select: { clicks: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(links.map((l) => ({ code: l.code, targetUrl: l.targetUrl, clicks: l._count.clicks, missionId: l.missionId })));
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
