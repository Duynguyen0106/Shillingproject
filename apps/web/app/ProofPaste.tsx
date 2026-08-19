"use client";

import { FormEvent, useEffect, useState } from "react";
import { isXStatusUrl, proofPlaceholder } from "../lib/playbook";
import { runProof } from "../lib/shillAction";
import { useConnectedWallet } from "../lib/useConnectedWallet";

const PLACEHOLDER = proofPlaceholder("play:reply-narrative");

export default function ProofPaste({
  communityId,
  postId,
  youShilled = false,
  youProved = false,
  xVerified = false,
  compact = false,
  onStatus
}: {
  communityId: string;
  postId: string;
  youShilled?: boolean;
  youProved?: boolean;
  xVerified?: boolean;
  compact?: boolean;
  onStatus?: (message: string) => void;
}) {
  const { connected } = useConnectedWallet();
  const [proofUrl, setProofUrl] = useState(PLACEHOLDER);
  const [busy, setBusy] = useState(false);
  const [scored, setScored] = useState(youProved);
  const [note, setNote] = useState("");

  useEffect(() => {
    setScored(youProved);
    setNote("");
    setProofUrl(PLACEHOLDER);
  }, [postId]);

  useEffect(() => {
    if (youProved) setScored(true);
  }, [youProved]);

  if (scored) {
    return <span className="badge ok">Reply scored</span>;
  }
  if (!youShilled) {
    return compact ? null : <p className="muted">Shill this tweet first, then paste YOUR reply URL here.</p>;
  }
  if (!connected) {
    return <p className="muted">Connect a wallet to score your reply.</p>;
  }

  if (xVerified) {
    return (
      <div className={`proof-paste${compact ? " compact" : ""}`}>
        <span className="badge">Auto-scoring your reply…</span>
        <span className="muted">We&apos;ll detect your reply on X and score it automatically. Usually within 2 min.</span>
        {!compact && (
          <details>
            <summary className="muted">Score manually instead</summary>
            <form className="proof-paste compact" onSubmit={(event) => void submit(event)}>
              <input
                value={proofUrl}
                onChange={(event) => setProofUrl(event.target.value)}
                placeholder={PLACEHOLDER}
                aria-label="Your reply status URL"
              />
              <button className="btn" type="submit" disabled={busy}>Score reply</button>
              {note && <span className="muted">{note}</span>}
            </form>
          </details>
        )}
      </div>
    );
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = proofUrl.trim();
    if (!isXStatusUrl(trimmed)) {
      const msg = "Paste the X status URL of YOUR reply, not the KOL tweet or a profile link.";
      setNote(msg);
      onStatus?.(msg);
      return;
    }
    setBusy(true);
    const result = await runProof({ communityId, postId, proofUrl: trimmed });
    setBusy(false);
    if (result.alreadyProved) {
      setScored(true);
      const msg = "Already scored on this raid.";
      setNote(msg);
      onStatus?.(msg);
      return;
    }
    if (!result.ok) {
      const msg = result.error || "Could not score this reply.";
      setNote(msg);
      onStatus?.(msg);
      return;
    }
    setScored(true);
    const msg = `Reply scored${typeof result.pointsAwarded === "number" ? ` · ${result.pointsAwarded} pts` : ""}.`;
    setNote(msg);
    onStatus?.(msg);
  }

  return (
    <form className={`proof-paste${compact ? " compact" : ""}`} onSubmit={(event) => void submit(event)}>
      <input
        value={proofUrl}
        onChange={(event) => setProofUrl(event.target.value)}
        placeholder={PLACEHOLDER}
        aria-label="Your reply status URL"
      />
      <button className="btn" type="submit" disabled={busy}>Score reply</button>
      {note && <span className="muted">{note}</span>}
    </form>
  );
}
