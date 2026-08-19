export const LIVE_POST_EVENT = "shillops-live-post";

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
  kind: "KOL_POST" | "MENTION" | string;
  url: string;
  authorHandle: string;
  authorName?: string | null;
  authorFollowers?: number;
  text: string;
  likeCount?: number;
  replyCount?: number;
  retweetCount?: number;
  quoteCount?: number;
  viewCount?: number;
  postedAt: string;
  createdAt?: string;
  missionId?: string | null;
  heat?: number;
  kol?: LiveKol | null;
};

export type LiveFeedEvent = {
  type: "post";
  communityId: string;
  post: LivePost;
  kol: LiveKol | null;
};

export function compactCount(value?: number | null): string {
  const n = value ?? 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function dispatchLivePost(event: LiveFeedEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LIVE_POST_EVENT, { detail: event }));
}
