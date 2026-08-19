import { PrismaClient, ActionType, Platform, Priority, SignalType } from "@prisma/client";

const prisma = new PrismaClient();
const appUrl = process.env.APP_URL || "http://localhost:3000";

async function main() {
  const community = await prisma.community.upsert({
    where: { id: "demo-community" },
    update: {
      contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
      chainId: "ethereum",
      dexUrl: "https://dexscreener.com/ethereum/0x6982508145454ce325ddbe47a25d4ec3d2311933"
    },
    create: {
      id: "demo-community",
      name: "Pepe Raiders",
      ticker: "PEPE",
      description: "Demo memecoin community bound to the PEPE contract on Ethereum",
      contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
      chainId: "ethereum",
      dexUrl: "https://dexscreener.com/ethereum/0x6982508145454ce325ddbe47a25d4ec3d2311933"
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
            details: "play:reply-narrative",
            actionType: ActionType.REPLY,
            platform: Platform.X,
            basePoints: 10
          },
          {
            title: "Share in Telegram",
            details: "play:share-telegram",
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

  await prisma.kolWatch.upsert({
    where: { communityId_handle: { communityId: community.id, handle: "examplekol" } },
    update: {
      displayName: "Example KOL",
      followers: 128000,
      following: 412,
      statusesCount: 4100,
      verified: true,
      bio: "Demo watch so the raid feed is not empty."
    },
    create: {
      communityId: community.id,
      handle: "examplekol",
      displayName: "Example KOL",
      followers: 128000,
      following: 412,
      statusesCount: 4100,
      verified: true,
      bio: "Demo watch so the raid feed is not empty."
    }
  });

  await prisma.feedPost.upsert({
    where: { communityId_url: { communityId: community.id, url: "https://x.com/examplekol/status/1" } },
    update: {
      text: "$PEPE looking heavy. Quote this.",
      authorFollowers: 128000,
      likeCount: 840,
      replyCount: 62,
      retweetCount: 110,
      quoteCount: 21,
      viewCount: 22000
    },
    create: {
      communityId: community.id,
      kind: "KOL_POST",
      url: "https://x.com/examplekol/status/1",
      authorHandle: "examplekol",
      authorName: "Example KOL",
      authorFollowers: 128000,
      likeCount: 840,
      replyCount: 62,
      retweetCount: 110,
      quoteCount: 21,
      viewCount: 22000,
      text: "$PEPE looking heavy. Quote this.",
      postedAt: new Date()
    }
  });

  await prisma.feedPost.upsert({
    where: { communityId_url: { communityId: community.id, url: "https://x.com/random/status/2" } },
    update: {
      text: `CA ${community.contractAddress}`,
      authorFollowers: 2400,
      likeCount: 18,
      replyCount: 7,
      retweetCount: 3
    },
    create: {
      communityId: community.id,
      kind: "MENTION",
      url: "https://x.com/random/status/2",
      authorHandle: "random",
      authorFollowers: 2400,
      likeCount: 18,
      replyCount: 7,
      retweetCount: 3,
      text: `Someone dropped the ${community.ticker} CA ${community.contractAddress}`,
      postedAt: new Date(),
      missionId: mission.id
    }
  });

  const mentionPost = await prisma.feedPost.findUnique({
    where: { communityId_url: { communityId: community.id, url: "https://x.com/random/status/2" } }
  });
  if (mentionPost) {
    const already = await prisma.feedShill.findFirst({
      where: { feedPostId: mentionPost.id, userId: user.id }
    });
    if (!already) {
      await prisma.feedShill.create({
        data: {
          communityId: community.id,
          feedPostId: mentionPost.id,
          userId: user.id,
          missionId: mission.id
        }
      });
    }
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
