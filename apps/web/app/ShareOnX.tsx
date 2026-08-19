"use client";

interface ShareOnXProps {
  ticker: string;
  action?: string;
  points?: number;
  communityUrl?: string;
}

export default function ShareOnX({ ticker, action = "shilled", points, communityUrl }: ShareOnXProps) {
  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://shillops.xyz";
  const url = communityUrl || appUrl;
  const text = points
    ? `Just ${action} $${ticker} on ShillOps and earned ${points} pts! 🚀\n\nJoin my community and raid together: ${url}`
    : `Raiding $${ticker} on ShillOps! 🚀 Coordinate shills, earn points, redeem tokens.\n\nJoin: ${url}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;

  return (
    <a
      href={tweetUrl}
      target="_blank"
      rel="noreferrer"
      className="btn share-on-x-btn"
      title="Share your raid on X"
    >
      𝕏 Share on X
    </a>
  );
}
