"use client";

import Link from "next/link";
import { useSelectedCommunity } from "../lib/useSelectedCommunity";
import { shortAddress } from "../lib/session";

export default function CommunityBanner() {
  const { community } = useSelectedCommunity();
  if (!community) {
    return (
      <div className="community-banner">
        <span className="muted">Bind ops to a token contract so scam CTOs cannot spoof the community name.</span>
        <Link href="/">Search DexScreener</Link>
      </div>
    );
  }
  return (
    <div className="community-banner">
      <span>
        Operating on <strong>{community.ticker}</strong>
        {community.contractAddress ? ` · ${shortAddress(community.contractAddress)}` : ""}
        {community.chainId ? ` · ${community.chainId}` : ""}
      </span>
      {community.contractAddress && community.chainId && (
        <Link href={`/c/${community.chainId}/${community.contractAddress}`}>Token hub</Link>
      )}
      {community.dexUrl && (
        <a href={community.dexUrl} target="_blank" rel="noreferrer">DexScreener</a>
      )}
    </div>
  );
}
