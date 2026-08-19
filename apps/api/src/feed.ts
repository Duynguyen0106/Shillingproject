import { FeedPostKind, PrismaClient, SignalType } from "@prisma/client";
import {
  configuredFeedProvider,
  fetchHandleTweets,
  fetchMentionTweets,
  fetchUserProfile,
  mentionMatches,
  parseXHandle,
  type NormalizedKol,
  type NormalizedPost
} from "./xfeed";

export type FeedHooks = {
  onNewMention: (input: {
    communityId: string;
    ticker: string;
    chainId: string | null;
    contractAddress: string | null;
    post: {
      id: string;
      url: string;
      authorHandle: string;
      text: string;
      postedAt: Date;
    };
  }) => Promise<string | null>;
};

function postMetrics(post: NormalizedPost) {
  return {
    authorName: post.authorName,
    authorFollowers: post.authorFollowers ?? 0,
    likeCount: post.likeCount ?? 0,
    replyCount: post.replyCount ?? 0,
    retweetCount: post.retweetCount ?? 0,
    quoteCount: post.quoteCount ?? 0,
    viewCount: post.viewCount ?? 0,
    text: post.text.slice(0, 2000),
    postedAt: post.postedAt
  };
}

function kolProfileData(profile: NormalizedKol) {
  return {
    displayName: profile.displayName,
    xUserId: profile.xUserId,
    bio: profile.bio,
    profileImageUrl: profile.profileImageUrl,
    followers: profile.followers,
    following: profile.following,
    statusesCount: profile.statusesCount,
    verified: profile.verified ?? false,
    lastFetchedAt: new Date()
  };
}

export async function ingestNormalizedPost(
  prisma: PrismaClient,
  community: { id: string; ticker: string; contractAddress: string | null },
  post: NormalizedPost,
  kind: FeedPostKind,
  kolWatchId?: string | null
) {
  const existing = await prisma.feedPost.findUnique({
    where: { communityId_url: { communityId: community.id, url: post.url } }
  });
  if (existing) {
    const updated = await prisma.feedPost.update({
      where: { id: existing.id },
      data: postMetrics(post)
    });
    return { post: updated, created: false as const };
  }
  const created = await prisma.feedPost.create({
    data: {
      communityId: community.id,
      kolWatchId: kolWatchId || undefined,
      kind,
      url: post.url,
      authorHandle: post.authorHandle,
      ...postMetrics(post)
    }
  });
  return { post: created, created: true as const };
}

export async function refreshCommunityFeed(prisma: PrismaClient, communityId: string, hooks?: FeedHooks) {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    include: { kolWatches: true }
  });
  if (!community) return { error: "Community not found" as const };
  const provider = configuredFeedProvider();
  if (provider === "none") {
    return {
      provider,
      added: 0,
      mentions: 0,
      message: "Set TWITTERAPI_IO_KEY or X_BEARER_TOKEN to pull live KOL posts and mentions."
    };
  }

  let added = 0;
  let mentions = 0;
  for (const watch of community.kolWatches.slice(0, 8)) {
    const profile = await fetchUserProfile(watch.handle).catch(() => null);
    const tweets = await fetchHandleTweets(watch.handle);
    await prisma.kolWatch.update({
      where: { id: watch.id },
      data: {
        ...(profile ? kolProfileData(profile) : { lastFetchedAt: new Date() }),
        xUserId: profile?.xUserId ?? tweets[0]?.authorId ?? watch.xUserId
      }
    });
    for (const tweet of tweets) {
      const isMention = mentionMatches(tweet.text, community.ticker, community.contractAddress);
      const result = await ingestNormalizedPost(
        prisma,
        community,
        tweet,
        isMention ? FeedPostKind.MENTION : FeedPostKind.KOL_POST,
        watch.id
      );
      if (!result.created) continue;
      added += 1;
      if (isMention) {
        mentions += 1;
        const missionId = await hooks?.onNewMention({
          communityId: community.id,
          ticker: community.ticker,
          chainId: community.chainId,
          contractAddress: community.contractAddress,
          post: result.post
        });
        if (missionId) {
          await prisma.feedPost.update({ where: { id: result.post.id }, data: { missionId, notifiedAt: new Date() } });
        }
      }
    }
  }

  const mentionTweets = await fetchMentionTweets(community.ticker, community.contractAddress);
  for (const tweet of mentionTweets) {
    const result = await ingestNormalizedPost(prisma, community, tweet, FeedPostKind.MENTION);
    if (!result.created) continue;
    added += 1;
    mentions += 1;
    const missionId = await hooks?.onNewMention({
      communityId: community.id,
      ticker: community.ticker,
      chainId: community.chainId,
      contractAddress: community.contractAddress,
      post: result.post
    });
    if (missionId) {
      await prisma.feedPost.update({ where: { id: result.post.id }, data: { missionId, notifiedAt: new Date() } });
    }
  }

  return { provider, added, mentions };
}

export async function refreshAllCommunityFeeds(prisma: PrismaClient, hooks?: FeedHooks) {
  const communities = await prisma.community.findMany({ select: { id: true } });
  const results = [];
  for (const community of communities) {
    results.push(await refreshCommunityFeed(prisma, community.id, hooks));
  }
  return results;
}

export function parseWatchHandle(input: string): string | null {
  return parseXHandle(input);
}

export { kolProfileData };
