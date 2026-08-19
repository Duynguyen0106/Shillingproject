"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSelectedCommunity } from "../lib/useSelectedCommunity";
import { getStoredCommunityId } from "../lib/community";
import { FOCUS_EVENT, type FocusRaid } from "../lib/shillAction";
import { shortAddress } from "../lib/session";

export default function CommunityBanner() {
  const { community } = useSelectedCommunity();
  const [focus, setFocus] = useState<FocusRaid | null>(null);

  useEffect(() => {
    const onFocus = (message: Event) => {
      const event = (message as CustomEvent<{ communityId?: string; focus?: FocusRaid | null }>).detail;
      if (event?.communityId && event.communityId !== getStoredCommunityId()) return;
      setFocus(event?.focus ?? null);
    };
    const onCommunity = () => setFocus(null);
    window.addEventListener(FOCUS_EVENT, onFocus);
    window.addEventListener("shillops-community", onCommunity);
    return () => {
      window.removeEventListener(FOCUS_EVENT, onFocus);
      window.removeEventListener("shillops-community", onCommunity);
    };
  }, []);

  if (!community) {
    return (
      <div className="community-banner">
        <span className="muted">Bind ops to a token contract so scam CTOs cannot spoof the community name.</span>
        <Link href="/">Search DexScreener</Link>
      </div>
    );
  }
  return (
    <div className={`community-banner${focus ? " raid" : ""}`}>
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
      {focus && (
        <span>
          Raid: reply to <strong>@{focus.authorHandle}</strong>
          {" · "}
          <Link href="/app/feed">Open feed</Link>
        </span>
      )}
    </div>
  );
}
