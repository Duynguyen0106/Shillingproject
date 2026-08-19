/**
 * Prisma seed — creates demo data for local dev & fresh deployments.
 * Run: npx ts-node prisma/seed.ts   OR   npx prisma db seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database…");

  // ── Demo community ───────────────────────────────────────────────
  const community = await prisma.community.upsert({
    where: { id: "demo-community" },
    create: {
      id: "demo-community",
      name: "ShillOps Demo",
      ticker: "DEMO",
      description: "The official ShillOps demo community. Join to test all features.",
      chainId: "base",
      contractAddress: "0x0000000000000000000000000000000000000000",
      dexUrl: "https://dexscreener.com",
    },
    update: {},
  });
  console.log(`  ✓ Community: ${community.name}`);

  // ── Demo KOL watches ────────────────────────────────────────────
  const kols = [
    { handle: "elonmusk", displayName: "Elon Musk" },
    { handle: "cz_binance", displayName: "CZ" },
    { handle: "VitalikButerin", displayName: "Vitalik Buterin" },
  ];
  for (const k of kols) {
    await prisma.kolWatch.upsert({
      where: { communityId_handle: { communityId: community.id, handle: k.handle.toLowerCase() } },
      create: { communityId: community.id, handle: k.handle.toLowerCase(), displayName: k.displayName },
      update: {},
    });
  }
  console.log(`  ✓ KOL watches: ${kols.length}`);

  // ── Demo missions ────────────────────────────────────────────────
  const missions = [
    {
      title: "Reply to KOL alpha post",
      description: "Reply to a high-profile CT post mentioning $DEMO and our community link.",
      priority: "HIGH" as const,
      urgency: 80,
      tasks: [
        { title: "Reply with $DEMO mention", actionType: "REPLY" as const, platform: "X" as const, pointValue: 50 },
        { title: "Quote-tweet with community context", actionType: "SHARE" as const, platform: "X" as const, pointValue: 30 },
      ],
    },
    {
      title: "Shill the DEX listing",
      description: "Share the DEX listing across CT to drive volume and awareness.",
      priority: "MEDIUM" as const,
      urgency: 50,
      tasks: [
        { title: "Post DexScreener link with commentary", actionType: "SHARE" as const, platform: "X" as const, pointValue: 30 },
        { title: "Drop chart in Discord/Telegram", actionType: "SHARE" as const, platform: "TELEGRAM" as const, pointValue: 20 },
      ],
    },
    {
      title: "Invite new holders",
      description: "Bring 3 new wallets into the community. Use your referral link.",
      priority: "LOW" as const,
      urgency: 20,
      tasks: [
        { title: "Share referral link", actionType: "INVITE" as const, platform: "X" as const, pointValue: 20 },
      ],
    },
  ];

  for (const m of missions) {
    const existing = await prisma.mission.findFirst({ where: { communityId: community.id, title: m.title } });
    if (!existing) {
      await prisma.mission.create({
        data: {
          communityId: community.id,
          title: m.title,
          description: m.description,
          priority: m.priority,
          urgency: m.urgency,
          status: "ACTIVE",
          tasks: { create: m.tasks },
        },
      });
    }
  }
  console.log(`  ✓ Missions: ${missions.length}`);

  // ── Achievements ────────────────────────────────────────────────
  const achievements = [
    { slug: "first-shill",     title: "First Blood",       description: "Complete your first shill",           icon: "🩸" },
    { slug: "first-proof",     title: "Proof of Work",     description: "Submit your first verified proof",     icon: "✅" },
    { slug: "streak-7",        title: "Week Warrior",      description: "Maintain a 7-day activity streak",    icon: "🔥" },
    { slug: "streak-30",       title: "Monthly Grinder",   description: "Maintain a 30-day streak",            icon: "💎" },
    { slug: "100-shills",      title: "Centurion",         description: "Submit 100 shills",                   icon: "💯" },
    { slug: "top-raider",      title: "Top Raider",        description: "Reach rank #1 on the leaderboard",    icon: "🥇" },
    { slug: "whale-tier",      title: "Whale",             description: "Reach whale holder tier",             icon: "🐋" },
    { slug: "first-referral",  title: "Recruiter",         description: "Refer your first raider",             icon: "🔗" },
    { slug: "season-winner",   title: "Season Champion",   description: "Finish #1 in a season",               icon: "🏆" },
    { slug: "alliance-raid",   title: "Alliance Forged",   description: "Participate in an alliance raid",     icon: "⚔️" },
  ];

  for (const a of achievements) {
    await prisma.achievement.upsert({
      where: { slug: a.slug },
      create: a,
      update: { title: a.title, description: a.description, icon: a.icon },
    });
  }
  console.log(`  ✓ Achievements: ${achievements.length}`);

  // ── Demo announcement ────────────────────────────────────────────
  const annoCount = await prisma.announcement.count({ where: { communityId: community.id } });
  if (annoCount === 0) {
    await prisma.announcement.create({
      data: {
        communityId: community.id,
        text: "🚀 Welcome to ShillOps Demo! Connect your wallet, verify your X, and start raiding. Earn points → redeem tokens.",
        pinned: true,
      },
    });
    console.log("  ✓ Demo announcement created");
  }

  // ── Demo season ──────────────────────────────────────────────────
  const now = new Date();
  const seasonEnd = new Date(now.getTime() + 14 * 24 * 3600_000);
  const existingSeason = await (prisma as any).season.findFirst({ where: { communityId: community.id } });
  if (!existingSeason) {
    await (prisma as any).season.create({
      data: { communityId: community.id, label: "Season 1 — Demo", startsAt: now, endsAt: seasonEnd, status: "active" },
    });
    console.log("  ✓ Demo season created");
  }

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
