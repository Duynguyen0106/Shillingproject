"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSelectedCommunity } from "../lib/useSelectedCommunity";
import { getStoredCommunityId } from "../lib/community";
import { FOCUS_EVENT, PROOF_EVENT, RAID_EVENT, SHILL_EVENT, runShill, type FocusRaid } from "../lib/shillAction";
import { shortAddress } from "../lib/session";
import { useConnectedWallet } from "../lib/useConnectedWallet";
import ProofPaste from "./ProofPaste";
import RaidScoreboard from "./RaidScoreboard";

export default function CommunityBanner() {
  const { community } = useSelectedCommunity();
  const { connected } = useConnectedWallet();
  const [focus, setFocus] = useState<FocusRaid | null>(null);
  const [youShilled, setYouShilled] = useState(false);
  const [youProved, setYouProved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const focusPostId = useRef<string | null>(null);

  useEffect(() => {
    const onFocus = (message: Event) => {
      const event = (message as CustomEvent<{ communityId?: string; focus?: FocusRaid | null }>).detail;
      if (event?.communityId && event.communityId !== getStoredCommunityId()) return;
      const next = event?.focus ?? null;
      const same = Boolean(next && focusPostId.current === next.postId);
      focusPostId.current = next?.postId ?? null;
      setFocus((current) => {
        if (!next) return null;
        if (same && current) {
          return {
            ...next,
            youShilled: Boolean(next.youShilled) || current.youShilled,
            youProved: Boolean(next.youProved) || current.youProved,
            provedCount: next.provedCount ?? current.provedCount,
            liveProvedCount: next.liveProvedCount ?? current.liveProvedCount,
            liveRaiderCount: next.liveRaiderCount ?? current.liveRaiderCount,
            raiderCount: next.raiderCount ?? current.raiderCount
          };
        }
        return next;
      });
      setYouShilled((prev) => Boolean(next?.youShilled) || (same && prev));
      setYouProved((prev) => Boolean(next?.youProved) || (same && prev));
      if (!same) setNote("");
    };
    const onCommunity = () => {
      focusPostId.current = null;
      setFocus(null);
      setYouShilled(false);
      setYouProved(false);
      setNote("");
    };
    const onShill = (message: Event) => {
      const event = (message as CustomEvent<{ communityId?: string; postId?: string; liveRaiderCount?: number }>).detail;
      if (event?.communityId && event.communityId !== getStoredCommunityId()) return;
      if (event?.postId && event.postId === focusPostId.current) {
        setYouShilled(true);
        if (typeof event.liveRaiderCount === "number") {
          setFocus((current) => current ? { ...current, liveRaiderCount: event.liveRaiderCount, youShilled: true } : current);
        }
      }
    };
    const onRaid = (message: Event) => {
      const event = (message as CustomEvent<{ communityId?: string; postId?: string; liveRaiderCount?: number; raiderCount?: number }>).detail;
      if (event?.communityId && event.communityId !== getStoredCommunityId()) return;
      if (event?.postId !== focusPostId.current) return;
      setFocus((current) => current ? {
        ...current,
        liveRaiderCount: event.liveRaiderCount ?? current.liveRaiderCount,
        raiderCount: event.raiderCount ?? current.raiderCount
      } : current);
    };
    const onProof = (message: Event) => {
      const event = (message as CustomEvent<{ postId?: string; communityId?: string; provedCount?: number; liveProvedCount?: number; you?: boolean }>).detail;
      if (event?.communityId && event.communityId !== getStoredCommunityId()) return;
      if (event?.postId && event.postId === focusPostId.current) {
        if (event.you) setYouProved(true);
        setFocus((current) => current ? {
          ...current,
          youProved: current.youProved || Boolean(event.you),
          provedCount: event.provedCount ?? (event.you ? (current.provedCount ?? 0) + 1 : current.provedCount),
          liveProvedCount: event.liveProvedCount ?? current.liveProvedCount
        } : current);
      }
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    window.addEventListener("shillops-community", onCommunity);
    window.addEventListener(SHILL_EVENT, onShill);
    window.addEventListener(RAID_EVENT, onRaid);
    window.addEventListener(PROOF_EVENT, onProof);
    return () => {
      window.removeEventListener(FOCUS_EVENT, onFocus);
      window.removeEventListener("shillops-community", onCommunity);
      window.removeEventListener(SHILL_EVENT, onShill);
      window.removeEventListener(RAID_EVENT, onRaid);
      window.removeEventListener(PROOF_EVENT, onProof);
    };
  }, []);

  async function shillFocus() {
    if (!focus) return;
    setBusy(true);
    const result = await runShill({ communityId: getStoredCommunityId(), postId: focus.postId });
    setBusy(false);
    if (!result.ok) {
      setNote(result.error || "Could not claim this tweet.");
      return;
    }
    setYouShilled(true);
    setNote(result.alreadyShilled
      ? "Already shilled — paste YOUR reply URL."
      : "Talk track copied. Reply, then paste YOUR status URL.");
  }

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
        <>
          <span>
            Raid: reply to <strong>@{focus.authorHandle}</strong>
          </span>
          <RaidScoreboard
            compact
            provedCount={focus.provedCount}
            liveRaiderCount={focus.liveRaiderCount}
            until={focus.until}
          />
          {connected && !youShilled && (
            <button className="btn" disabled={busy} type="button" onClick={() => void shillFocus()}>
              Shill this tweet
            </button>
          )}
          <Link href="/app/feed">Open feed</Link>
          <ProofPaste
            compact
            communityId={getStoredCommunityId()}
            postId={focus.postId}
            youShilled={youShilled}
            youProved={youProved}
            onStatus={setNote}
          />
          {note && <span className="muted">{note}</span>}
        </>
      )}
    </div>
  );
}
