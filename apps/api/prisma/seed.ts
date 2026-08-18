import { PrismaClient, ActionType, Platform, Priority, SignalType } from "@prisma/client";

const prisma = new PrismaClient();

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

  await prisma.mission.upsert({
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
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
