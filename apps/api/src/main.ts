import "dotenv/config";
import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { Prisma, PrismaClient, ActionType, MissionStatus, Platform, Priority, SignalType } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);
const appUrl = process.env.APP_URL || "http://localhost:3000";

app.use(cors());
app.use(express.json());

const actionBasePoints: Record<ActionType, number> = {
  REPLY: 10,
  SHARE: 6,
  BOOST: 4,
  INVITE: 8
};

function scoreSubmission(input: { actionType: ActionType; priority: Priority; isEarly: boolean; duplicatePenalty: boolean; engagementValue: number }): number {
  const base = actionBasePoints[input.actionType] ?? 5;
  const earlyBonus = input.isEarly ? base * 0.3 : 0;
  const engagementBonus = Math.min(20, Math.floor(input.engagementValue / 10));
  const priorityMultiplier = input.priority === Priority.HIGH ? 1.5 : 1;
  const spamPenalty = input.duplicatePenalty ? base * 0.4 : 0;
  return Math.max(0, Math.floor((base + earlyBonus + engagementBonus) * priorityMultiplier - spamPenalty));
}

async function sendWebhookMessage(url: string | undefined, message: string) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message, content: message })
    });
  } catch {
    // Non-blocking notification hook in MVP.
  }
}

async function notifyMissionCreated(missionId: string, title: string, signalType: SignalType, priority: Priority) {
  const ctaUrl = `${appUrl}/app/missions/${missionId}`;
  const baseMsg = `🔥 New mission live: ${title}\nSignal: ${signalType} | Priority: ${priority}\nCTA: Open Mission ${ctaUrl}`;
  await Promise.all([
    sendWebhookMessage(process.env.TELEGRAM_WEBHOOK_URL, baseMsg),
    sendWebhookMessage(process.env.DISCORD_WEBHOOK_URL, baseMsg)
  ]);
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/auth/siwe/start", async (_req, res) => {
  res.json({ nonce: nanoid(16), message: "Sign this SIWE message" });
});

app.post("/auth/siwe/verify", async (req, res) => {
  const { wallet } = req.body;
  let user = await prisma.user.findUnique({ where: { wallet } });
  if (!user) user = await prisma.user.create({ data: { wallet } });
  res.json({ token: nanoid(24), user });
});

app.get("/me", async (req, res) => {
  const wallet = String(req.query.wallet || "");
  const user = await prisma.user.findUnique({ where: { wallet } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.post("/communities", async (req, res) => {
  const { name, ticker, description } = req.body;
  const community = await prisma.community.create({ data: { name, ticker, description } });
  res.json(community);
});

app.get("/communities/:id", async (req, res) => {
  const community = await prisma.community.findUnique({ where: { id: req.params.id } });
  if (!community) return res.status(404).json({ error: "Community not found" });
  res.json(community);
});

app.post("/communities/:id/join", async (req, res) => {
  const { wallet, displayName } = req.body;
  let user = await prisma.user.findUnique({ where: { wallet } });
  if (!user) user = await prisma.user.create({ data: { wallet, displayName } });
  const member = await prisma.communityMember.upsert({
    where: { userId_communityId: { userId: user.id, communityId: req.params.id } },
    update: {},
    create: { userId: user.id, communityId: req.params.id }
  });
  res.json(member);
});

app.post("/signals/ingest", async (req, res) => {
  const { communityId, type, severity = 50, sourceRef, metadata } = req.body as {
    communityId: string;
    type: SignalType;
    severity?: number;
    sourceRef?: string;
    metadata?: Record<string, unknown>;
  };
  const dedupeKey = `${communityId}:${type}:${sourceRef ?? ""}`;
  const safeMetadata = (metadata ?? undefined) as Prisma.InputJsonValue | undefined;
  const signal = await prisma.signal.upsert({
    where: { dedupeKey },
    update: { severity, metadata: safeMetadata },
    create: { communityId, type, severity, sourceRef, metadata: safeMetadata, dedupeKey }
  });

  let mission = await prisma.mission.findFirst({ where: { signalId: signal.id } });
  if (!mission) {
    mission = await prisma.mission.create({
      data: {
        communityId,
        signalId: signal.id,
        title: `${type.replaceAll("_", " ")} response`,
        description: `Auto-created mission from ${type} signal`,
        priority: severity >= 80 ? Priority.HIGH : severity >= 50 ? Priority.MEDIUM : Priority.LOW,
        urgency: severity,
        tasks: {
          create: [
            { title: "Reply with narrative", actionType: ActionType.REPLY, platform: Platform.X, basePoints: 10 },
            { title: "Share in Telegram", actionType: ActionType.SHARE, platform: Platform.TELEGRAM, basePoints: 6 }
          ]
        }
      },
      include: { tasks: true }
    });
    await notifyMissionCreated(mission.id, mission.title, signal.type, mission.priority);
  }
  res.json({ signal, mission });
});

app.get("/communities/:id/signals", async (req, res) => {
  const signals = await prisma.signal.findMany({
    where: { communityId: req.params.id },
    orderBy: { createdAt: "desc" }
  });
  res.json(signals);
});

app.get("/communities/:id/missions", async (req, res) => {
  const status = (req.query.status as string | undefined)?.toUpperCase();
  const missions = await prisma.mission.findMany({
    where: {
      communityId: req.params.id,
      status: status ? (status as MissionStatus) : MissionStatus.ACTIVE
    },
    include: { tasks: true },
    orderBy: { createdAt: "desc" }
  });
  res.json(missions);
});

app.post("/signals/:id/create-mission", async (req, res) => {
  const signal = await prisma.signal.findUnique({ where: { id: req.params.id } });
  if (!signal) return res.status(404).json({ error: "Signal not found" });
  let mission = await prisma.mission.findFirst({ where: { signalId: signal.id } });
  if (!mission) {
    mission = await prisma.mission.create({
      data: {
        communityId: signal.communityId,
        signalId: signal.id,
        title: `${signal.type.replaceAll("_", " ")} response`,
        description: "Internal mission creation from signal",
        priority: signal.severity >= 80 ? Priority.HIGH : signal.severity >= 50 ? Priority.MEDIUM : Priority.LOW,
        urgency: signal.severity
      }
    });
  }
  res.json(mission);
});

app.get("/missions/:id", async (req, res) => {
  const mission = await prisma.mission.findUnique({ where: { id: req.params.id }, include: { tasks: true, signal: true } });
  if (!mission) return res.status(404).json({ error: "Mission not found" });
  res.json(mission);
});

app.post("/missions/:id/claim", async (_req, res) => {
  res.json({ missionId: _req.params.id, claimed: true });
});

app.post("/missions/:id/complete", async (req, res) => {
  const mission = await prisma.mission.update({
    where: { id: req.params.id },
    data: { status: MissionStatus.COMPLETED }
  });
  res.json(mission);
});

app.post("/tasks/:id/submissions", async (req, res) => {
  const { wallet, proofUrl, proofText, engagementValue = 0 } = req.body;
  let user = await prisma.user.findUnique({ where: { wallet } });
  if (!user) user = await prisma.user.create({ data: { wallet } });
  const task = await prisma.missionTask.findUnique({
    where: { id: req.params.id },
    include: { mission: true }
  });
  if (!task) return res.status(404).json({ error: "Task not found" });

  const isEarly = Date.now() - task.createdAt.getTime() < 10 * 60 * 1000;
  const duplicatePenalty = Boolean(proofText && proofText.length > 0 && proofText.toLowerCase().includes("copy"));
  const points = scoreSubmission({
    actionType: task.actionType,
    priority: task.mission.priority,
    isEarly,
    duplicatePenalty,
    engagementValue
  });

  const submission = await prisma.submission.create({
    data: {
      taskId: task.id,
      userId: user.id,
      proofUrl,
      proofText,
      isVerified: true,
      verifiedAt: new Date(),
      pointsAwarded: points
    }
  });

  await prisma.score.create({
    data: {
      userId: user.id,
      communityId: task.mission.communityId,
      points,
      reason: `Submission for ${task.title}`,
      sourceId: submission.id
    }
  });

  res.json(submission);
});

app.get("/communities/:id/leaderboard", async (req, res) => {
  const rows = await prisma.score.groupBy({
    by: ["userId"],
    where: { communityId: req.params.id },
    _sum: { points: true },
    orderBy: { _sum: { points: "desc" } },
    take: 50
  });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } } });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const leaderboard = rows.map((row, idx) => ({
    rank: idx + 1,
    userId: row.userId,
    wallet: userMap.get(row.userId)?.wallet ?? "unknown",
    displayName: userMap.get(row.userId)?.displayName,
    points: row._sum.points ?? 0
  }));
  res.json(leaderboard);
});

app.post("/submissions/:id/verify", async (req, res) => {
  const { approved = true } = req.body;
  const submission = await prisma.submission.update({
    where: { id: req.params.id },
    data: { isVerified: approved, verifiedAt: approved ? new Date() : null }
  });
  res.json(submission);
});

app.post("/links", async (req, res) => {
  const { communityId, missionId, targetUrl } = req.body;
  const link = await prisma.shortLink.create({
    data: { communityId, missionId, targetUrl, code: nanoid(8) }
  });
  res.json(link);
});

app.get("/r/:code", async (req, res) => {
  const link = await prisma.shortLink.findUnique({ where: { code: req.params.code } });
  if (!link) return res.status(404).send("Not found");
  await prisma.shortLinkClick.create({
    data: {
      shortLinkId: link.id,
      referrer: req.get("referer"),
      userAgent: req.get("user-agent")
    }
  });
  res.redirect(link.targetUrl);
});

app.get("/communities/:id/attribution", async (req, res) => {
  const links = await prisma.shortLink.findMany({
    where: { communityId: req.params.id },
    include: { _count: { select: { clicks: true } } },
    orderBy: { createdAt: "desc" }
  });
  res.json(links.map((l) => ({ code: l.code, targetUrl: l.targetUrl, clicks: l._count.clicks })));
});

app.post("/notifications/telegram/test", async (_req, res) => {
  await sendWebhookMessage(process.env.TELEGRAM_WEBHOOK_URL, "Test Telegram mission alert from Shill Ops MVP");
  res.json({ ok: true });
});

app.post("/notifications/discord/test", async (_req, res) => {
  await sendWebhookMessage(process.env.DISCORD_WEBHOOK_URL, "Test Discord mission alert from Shill Ops MVP");
  res.json({ ok: true });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});
