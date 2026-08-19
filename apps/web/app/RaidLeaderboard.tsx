"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../lib/config";

type Entry = {
  wallet: string;
  displayName?: string | null;
  points: number;
  proofs: number;
};

export default function RaidLeaderboard({
  communityId,
  postId,
  compact = false
}: {
  communityId: string;
  postId: string;
  compact?: boolean;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/communities/${communityId}/feed/${postId}/leaderboard`)
      .then((r) => r.ok ? r.json() : { entries: [] })
      .then((data) => setEntries(data.entries ?? []))
      .catch(() => undefined);
  }, [communityId, postId, open]);

  if (compact) {
    return (
      <details onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>View raid leaderboard</summary>
        <div className="raid-leaderboard">
          {entries.slice(0, 10).map((entry, i) => (
            <div key={entry.wallet} className="raid-lb-row">
              <span className="rank">{i + 1}</span>
              <span className="raid-lb-name">{entry.displayName ?? entry.wallet.slice(0, 8) + "…"}</span>
              <span className="muted">{entry.proofs} reply{entry.proofs !== 1 ? "s" : ""}</span>
              <strong style={{ marginLeft: "auto" }}>{entry.points} pts</strong>
            </div>
          ))}
          {entries.length === 0 && <p className="muted">No scored replies yet.</p>}
        </div>
      </details>
    );
  }

  return (
    <div className="raid-leaderboard">
      <div className="kicker">Raid leaderboard</div>
      {entries.length === 0 && !open && (
        <button className="btn secondary small" onClick={() => setOpen(true)}>Load leaderboard</button>
      )}
      {open && entries.slice(0, 20).map((entry, i) => (
        <div key={entry.wallet} className="raid-lb-row">
          <span className="rank">{i + 1}</span>
          <span className="raid-lb-name">{entry.displayName ?? entry.wallet.slice(0, 8) + "…"}</span>
          <span className="muted">{entry.proofs} reply{entry.proofs !== 1 ? "s" : ""}</span>
          <strong style={{ marginLeft: "auto" }}>{entry.points} pts</strong>
        </div>
      ))}
      {open && entries.length === 0 && <p className="muted">No scored replies yet.</p>}
    </div>
  );
}
