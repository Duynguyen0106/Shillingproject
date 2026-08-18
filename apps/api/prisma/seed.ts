import { PrismaClient, ActionType, Platform, Priority, SignalType } from "@prisma/client";

const prisma = new PrismaClient();
const appUrl = process.env.APP_URL || "http://localhost:3000";

async function main() {
  const community = await prisma.community.upsert({
    where: { id: "demo-community" },
    update: {},
    create: {
      id: "demo-community",
      name: "Pepe Raiders",
      ticker: "PEPE",
      description: "Demo memecoin community for mission ops"
    }
  });

  const user = await prisma.user.upsert({
    where: { wallet: "0xdemo" },
    update: { displayName: "Raider" },
    create: { wallet: "0xdemo", displayName: "Raider" }
  });

  await prisma.communityMember.upsert({
    where: { userId_communityId: { userId: user.id, communityId: community.id } },
    update: {},
    create: { userId: user.id, communityId: community.id, role: "lead" }
  });

  const signal = await prisma.signal.upsert({
    where: { dedupeKey: `${community.id}:${SignalType.MENTION_SPIKE}:demo` },
    update: {},
    create: {
      communityId: community.id,
      type: SignalType.MENTION_SPIKE,
      severity: 72,
      sourceRef: "demo",
      dedupeKey: `${community.id}:${SignalType.MENTION_SPIKE}:demo`,
      metadata: { ticker: "PEPE", spikePct: 28 }
    }
  });

  const mission = await prisma.mission.upsert({
    where: { signalId: signal.id },
    update: {},
    create: {
      communityId: community.id,
      signalId: signal.id,
      title: "Mention spike response mission",
      description: "Boost narrative quickly across X + Telegram.",
      priority: Priority.HIGH,
      urgency: 72,
      tasks: {
        create: [
          {
            title: "Reply to target thread",
            actionType: ActionType.REPLY,
            platform: Platform.X,
            basePoints: 10
          },
          {
            title: "Share update in Telegram groups",
            actionType: ActionType.SHARE,
            platform: Platform.TELEGRAM,
            basePoints: 6
          }
        ]
      }
    }
  });

  await prisma.missionClaim.upsert({
    where: { missionId_userId: { missionId: mission.id, userId: user.id } },
    update: {},
    create: { missionId: mission.id, userId: user.id }
  });

  const communityLink = await prisma.shortLink.findFirst({ where: { missionId: mission.id, userId: null } });
  if (!communityLink) {
    await prisma.shortLink.create({
      data: {
        communityId: community.id,
        missionId: mission.id,
        code: "democta1",
        targetUrl: `${appUrl}/app/missions/${mission.id}`
      }
    });
  }

  const raiderLink = await prisma.shortLink.findFirst({ where: { missionId: mission.id, userId: user.id } });
  if (!raiderLink) {
    await prisma.shortLink.create({
      data: {
        communityId: community.id,
        missionId: mission.id,
        userId: user.id,
        code: "raidcta1",
        targetUrl: `${appUrl}/app/missions/${mission.id}`
      }
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
