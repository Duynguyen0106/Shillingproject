import { postHeat } from "./xfeed";

export type LiveKol = {
  handle: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
  followers?: number | null;
  following?: number | null;
  verified?: boolean;
  bio?: string | null;
};

export type LivePost = {
  id: string;
  kind: string;
  url: string;
  authorHandle: string;
  authorName?: string | null;
  authorFollowers: number;
  text: string;
  likeCount: number;
  replyCount: number;
  retweetCount: number;
  quoteCount: number;
  viewCount: number;
  postedAt: string;
  createdAt: string;
  missionId?: string | null;
  heat: number;
};

export type LiveFeedEvent = {
  type: "post";
  communityId: string;
  post: LivePost;
  kol: LiveKol | null;
};

export type LiveRaidEvent = {
  type: "shill";
  communityId: string;
  postId: string;
  url: string;
  reshill: boolean;
  raider: { wallet: string; displayName: string | null };
  liveRaiderCount: number;
  raiderCount: number;
};

export type LiveFocusEvent = {
  type: "focus";
  communityId: string;
  focus: {
    postId: string;
    url: string;
    authorHandle: string;
    text: string;
    kind?: string | null;
    at: string;
    until: string;
    by: { wallet: string; displayName: string | null } | null;
  } | null;
};

export type LiveBusEvent = LiveFeedEvent | LiveRaidEvent | LiveFocusEvent;

type LiveListener = (event: LiveBusEvent) => void;

const listeners = new Map<string, Set<LiveListener>>();

export function snapshotKol(kol?: {
  handle: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
  followers?: number | null;
  following?: number | null;
  verified?: boolean | null;
  bio?: string | null;
} | null): LiveKol | null {
  if (!kol?.handle) return null;
  return {
    handle: kol.handle,
    displayName: kol.displayName ?? null,
    profileImageUrl: kol.profileImageUrl ?? null,
    followers: kol.followers ?? null,
    following: kol.following ?? null,
    verified: Boolean(kol.verified),
    bio: kol.bio ?? null
  };
}

export function snapshotPost(post: {
  id: string;
  kind: string;
  url: string;
  authorHandle: string;
  authorName?: string | null;
  authorFollowers?: number | null;
  text: string;
  likeCount?: number | null;
  replyCount?: number | null;
  retweetCount?: number | null;
  quoteCount?: number | null;
  viewCount?: number | null;
  postedAt: Date | string;
  createdAt?: Date | string | null;
  missionId?: string | null;
}): LivePost {
  return {
    id: post.id,
    kind: post.kind,
    url: post.url,
    authorHandle: post.authorHandle,
    authorName: post.authorName ?? null,
    authorFollowers: post.authorFollowers ?? 0,
    text: post.text,
    likeCount: post.likeCount ?? 0,
    replyCount: post.replyCount ?? 0,
    retweetCount: post.retweetCount ?? 0,
    quoteCount: post.quoteCount ?? 0,
    viewCount: post.viewCount ?? 0,
    postedAt: new Date(post.postedAt).toISOString(),
    createdAt: new Date(post.createdAt ?? post.postedAt).toISOString(),
    missionId: post.missionId ?? null,
    heat: postHeat(post)
  };
}

export function toLiveFeedEvent(
  communityId: string,
  post: Parameters<typeof snapshotPost>[0],
  kol?: Parameters<typeof snapshotKol>[0]
): LiveFeedEvent {
  return {
    type: "post",
    communityId,
    post: snapshotPost(post),
    kol: snapshotKol(kol)
  };
}

export function publishLivePost(event: LiveFeedEvent) {
  for (const listener of listeners.get(event.communityId) ?? []) listener(event);
}

export function publishLiveRaid(event: LiveRaidEvent) {
  for (const listener of listeners.get(event.communityId) ?? []) listener(event);
}

export function publishLiveFocus(event: LiveFocusEvent) {
  for (const listener of listeners.get(event.communityId) ?? []) listener(event);
}

export function subscribeLiveFeed(communityId: string, listener: LiveListener): () => void {
  const set = listeners.get(communityId) ?? new Set<LiveListener>();
  set.add(listener);
  listeners.set(communityId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(communityId);
  };
}

export function liveListenerCount(communityId: string): number {
  return listeners.get(communityId)?.size ?? 0;
}

export function postsCreatedSince<T extends { createdAt?: Date | string | null }>(posts: T[], since?: Date | null): T[] {
  if (!since || Number.isNaN(since.getTime())) return posts;
  const start = since.getTime();
  return posts.filter((post) => {
    if (!post.createdAt) return false;
    return new Date(post.createdAt).getTime() > start;
  });
}
