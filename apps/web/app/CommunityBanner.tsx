"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSelectedCommunity } from "../lib/useSelectedCommunity";
import { getStoredCommunityId } from "../lib/community";
import { FOCUS_EVENT, PROOF_EVENT, SHILL_EVENT, runShill, type FocusRaid } from "../lib/shillAction";
import { shortAddress } from "../lib/session";
import { useConnectedWallet } from "../lib/useConnectedWallet";
import ProofPaste from "./ProofPaste";

export default function CommunityBanner() {
  const { community } = useSelectedCommunity();
  const { connected } = useConnectedWallet();
  const [focus, setFocus] = useState<FocusRaid | null>(null);
  const [youShilled, setYouShilled] = useState(false);
  const [youProved, setYouProved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const onFocus = (message: Event) => {
      const event = (message as CustomEvent<{ communityId?: string; focus?: FocusRaid | null }>).detail;
      if (event?.communityId && event.communityId !== getStoredCommunityId()) return;
      const next = event?.focus ?? null;
      setFocus(next);
      setYouShilled(Boolean(next?.youShilled));
      setYouProved(Boolean(next?.youProved));
      setNote("");
    };
    const onCommunity = () => {
      setFocus(null);
      setYouShilled(false);
      setYouProved(false);
      setNote("");
    };
    const onShill = (message: Event) => {
      const event = (message as CustomEvent<{ postId?: string }>).detail;
      setFocus((current) => {
        if (current && event?.postId === current.postId) setYouShilled(true);
        return current;
      });
    };
    const onProof = (message: Event) => {
      const event = (message as CustomEvent<{ postId?: string; communityId?: string }>).detail;
      if (event?.communityId && event.communityId !== getStoredCommunityId()) return;
      setFocus((current) => {
        if (current && event?.postId === current.postId) setYouProved(true);
        return current;
      });
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    window.addEventListener("shillops-community", onCommunity);
    window.addEventListener(SHILL_EVENT, onShill);
    window.addEventListener(PROOF_EVENT, onProof);
    return () => {
      window.removeEventListener(FOCUS_EVENT, onFocus);
      window.removeEventListener("shillops-community", onCommunity);
      window.removeEventListener(SHILL_EVENT, onShill);
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
