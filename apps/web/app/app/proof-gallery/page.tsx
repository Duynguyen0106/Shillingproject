"use client";

import { useState, useEffect } from "react";
import { API_BASE } from "../../../lib/config";
import { getStoredCommunityId } from "../../../lib/community";
import Link from "next/link";

interface ProofEntry {
  id: string;
  proofUrl: string;
  submittedAt: string;
  pointsAwarded: number;
  user: { wallet: string; displayName: string | null };
  task: { title: string; actionType: string; mission: { title: string } };
}

export default function ProofGalleryPage() {
  const [proofs, setProofs] = useState<ProofEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const communityId = getStoredCommunityId();

  useEffect(() => {
    if (!communityId) { setLoading(false); return; }
    setLoading(true);
    fetch(`${API_BASE}/communities/${communityId}/proof-gallery?page=${page}&limit=20`)
      .then((r) => r.ok ? r.json() : { proofs: [], pages: 1 })
      .then((d) => { setProofs(d.proofs || []); setPages(d.pages || 1); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [communityId, page]);

  return (
    <main className="container">
      <div className="kicker">Community wall</div>
      <h1>Proof Gallery</h1>
      <p className="muted">Verified shill proofs from community raiders.</p>
      {loading && <p className="muted">Loading…</p>}
      {!loading && proofs.length === 0 && (
        <div className="card"><p className="muted">No verified proofs yet. Complete missions and submit proofs!</p></div>
      )}
      <div className="proof-gallery">
        {proofs.map((p) => (
          <div key={p.id} className="card proof-card">
            <div className="proof-header">
              <span className="proof-user">{p.user.displayName || p.user.wallet.slice(0, 10) + "…"}</span>
              <span className="badge">{p.pointsAwarded} pts</span>
            </div>
            <div className="proof-mission">{p.task.mission.title} · {p.task.title}</div>
            <div className="proof-action">
              <span className={`badge ${p.task.actionType === "REPLY" ? "high" : ""}`}>{p.task.actionType}</span>
              <a href={p.proofUrl} target="_blank" rel="noreferrer" className="proof-link">View proof ↗</a>
            </div>
            <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
              {new Date(p.submittedAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="row" style={{ marginTop: "1.5rem", gap: "0.5rem" }}>
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="muted">{page} / {pages}</span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
      <p style={{ marginTop: "1.5rem" }}><Link href="/app/feed">← Back to feed</Link></p>
    </main>
  );
}
