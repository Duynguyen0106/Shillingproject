/**
 * Cron scheduler — runs on a cadence inside the API process.
 * All jobs are fire-and-forget; errors are logged but never crash the server.
 */
import type { PrismaClient } from "@prisma/client";

type Job = { name: string; intervalMs: number; fn: () => Promise<void> };

export function startCron(prisma: PrismaClient) {
  const jobs: Job[] = [
    { name: "daily-quests",          intervalMs: 60 * 60 * 1000,      fn: () => generateDailyQuests(prisma) },
    { name: "expire-announcements",  intervalMs: 30 * 60 * 1000,      fn: () => expireAnnouncements(prisma) },
    { name: "end-expired-seasons",   intervalMs: 15 * 60 * 1000,      fn: () => endExpiredSeasons(prisma) },
    { name: "expire-redemptions",    intervalMs: 60 * 60 * 1000,      fn: () => expireRedemptionClaims(prisma) },
    { name: "expire-alliance-raids", intervalMs: 15 * 60 * 1000,      fn: () => expireAllianceRaids(prisma) },
  ];

  for (const job of jobs) {
    const run = () => {
      job.fn().catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[cron] ${job.name} failed:`, err);
      });
    };
    run(); // run once on startup
    setInterval(run, job.intervalMs);
  }
  // eslint-disable-next-line no-console
  console.log(`[cron] started ${jobs.length} jobs`);
}

// ── Generate today's daily quest for every active community ──────
async function generateDailyQuests(prisma: PrismaClient) {
  const today = new Date().toISOString().slice(0, 10);
  const communities = await prisma.community.findMany({ select: { id: true } });
  const types = ["shill", "proof", "focus", "checkin"] as const;
  const descriptions: Record<string, string> = {
    shill:   "Shill at least one post in the raid feed today",
    proof:   "Submit verified proof on an active mission today",
    focus:   "Participate in a focus raid",
    checkin: "Check in to the app and view the feed",
  };
  let created = 0;
  for (const c of communities) {
    const questType = types[new Date().getDay() % types.length];
    const existing = await (prisma as any).dailyQuest.findUnique({
      where: { communityId_date: { communityId: c.id, date: today } },
    });
    if (!existing) {
      await (prisma as any).dailyQuest.create({
        data: { communityId: c.id, date: today, questType, description: descriptions[questType], pointBonus: 25 },
      });
      created++;
    }
  }
  if (created > 0) console.log(`[cron] daily-quests: created ${created} quests for ${today}`); // eslint-disable-line
}

// ── Delete expired announcements ─────────────────────────────────
async function expireAnnouncements(prisma: PrismaClient) {
  const result = await prisma.announcement.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  if (result.count > 0) console.log(`[cron] expire-announcements: removed ${result.count}`); // eslint-disable-line
}

// ── Auto-end seasons whose endsAt has passed ─────────────────────
async function endExpiredSeasons(prisma: PrismaClient) {
  const expired = await (prisma as any).season.findMany({
    where: { status: "active", endsAt: { lte: new Date() } },
  });
  for (const season of expired) {
    const scores = await prisma.score.groupBy({
      by: ["userId"],
      where: { communityId: season.communityId, createdAt: { gte: new Date(season.startsAt), lte: new Date(season.endsAt) } },
      _sum: { points: true },
      orderBy: { _sum: { points: "desc" } },
    });
    await Promise.all(
      scores.map((s: any, i: number) =>
        (prisma as any).seasonSnapshot.upsert({
          where: { seasonId_userId: { seasonId: season.id, userId: s.userId } },
          create: { seasonId: season.id, userId: s.userId, communityId: season.communityId, points: s._sum.points ?? 0, rank: i + 1 },
          update: { points: s._sum.points ?? 0, rank: i + 1 },
        })
      )
    );
    await (prisma as any).season.update({ where: { id: season.id }, data: { status: "ended" } });
    console.log(`[cron] end-expired-seasons: ended season "${season.label}" (${scores.length} snapshots)`); // eslint-disable-line
  }
}

// ── Expire stale redemption claims ───────────────────────────────
async function expireRedemptionClaims(prisma: PrismaClient) {
  // Mark expired unclaimed claims and refund points
  const expired = await (prisma as any).redemptionClaim.findMany({
    where: { expiresAt: { lte: new Date() }, claimedAt: null },
  });
  for (const claim of expired) {
    await (prisma as any).redemptionClaim.update({ where: { id: claim.id }, data: { claimedAt: new Date(), txHash: "expired" } });
    // Refund points
    await prisma.score.create({
      data: { userId: claim.userId, communityId: claim.communityId, points: claim.pointsBurned, reason: `Refund: expired redemption claim ${claim.id}` },
    });
  }
  if (expired.length > 0) console.log(`[cron] expire-redemptions: refunded ${expired.length} expired claims`); // eslint-disable-line
}

// ── Expire finished alliance raids ───────────────────────────────
async function expireAllianceRaids(prisma: PrismaClient) {
  const result = await (prisma as any).allianceRaid.updateMany({
    where: { status: "active", endsAt: { lte: new Date() } },
    data: { status: "ended" },
  });
  if (result.count > 0) console.log(`[cron] expire-alliance-raids: ended ${result.count} raids`); // eslint-disable-line
}
