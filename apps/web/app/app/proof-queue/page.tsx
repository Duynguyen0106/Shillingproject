"use client";

import { useState, useEffect } from "react";
import { API_BASE } from "../../../lib/config";
import { authHeaders } from "../../../lib/session";
import { getStoredCommunityId } from "../../../lib/community";
import ConnectWalletButton from "../../ConnectWalletButton";
import Link from "next/link";

interface QueueEntry {
  id: string;
  proofUrl: string;
  submittedAt: string;
  user: { wallet: string; displayName: string | null; xHandle: string | null };
  task: { title: string; actionType: string; mission: { title: string } };
}

export default function ProofQueuePage() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const communityId = getStoredCommunityId();

  const load = () => {
    if (!communityId) { setLoading(false); return; }
    fetch(`${API_BASE}/communities/${communityId}/proof-queue`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => setQueue(Array.isArray(d) ? d : []))
      .catch((e) => setError(typeof e === "number" && e === 403 ? "Only community lead can view this queue." : "Failed to load."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [communityId]);

  const approve = async (id: string) => {
    await fetch(`${API_BASE}/submissions/${id}/verify`, { method: "POST", headers: authHeaders() });
    setQueue((q) => q.filter((e) => e.id !== id));
  };

  const reject = async (id: string) => {
    await fetch(`${API_BASE}/submissions/${id}/reject`, { method: "POST", headers: authHeaders() });
    setQueue((q) => q.filter((e) => e.id !== id));
  };

  return (
    <main className="container">
      <div className="kicker">Lead tools</div>
      <h1>Proof Verification Queue</h1>
      <p className="muted">Review submitted proofs from your community members.</p>

      {loading && <p className="muted">Loading…</p>}
      {error && <div className="card"><p className="muted">{error}</p><ConnectWalletButton /></div>}

      {!loading && !error && queue.length === 0 && (
        <div className="card"><p className="muted">Queue is empty — no pending proofs.</p></div>
      )}

      {queue.map((entry) => (
        <div key={entry.id} className="card proof-queue-card">
          <div className="pq-header">
            <span className="pq-user">
              {entry.user.displayName || entry.user.wallet.slice(0, 10) + "…"}
              {entry.user.xHandle && <span className="muted"> · @{entry.user.xHandle}</span>}
            </span>
            <span className="muted pq-date">{new Date(entry.submittedAt).toLocaleDateString()}</span>
          </div>
          <div className="pq-mission">{entry.task.mission.title} · {entry.task.title}</div>
          <a href={entry.proofUrl} target="_blank" rel="noreferrer" className="pq-link">{entry.proofUrl}</a>
          <div className="pq-actions">
            <button className="btn pq-approve" onClick={() => approve(entry.id)}>✅ Approve</button>
            <button className="btn pq-reject" onClick={() => reject(entry.id)}>❌ Reject</button>
          </div>
        </div>
      ))}

      <p style={{ marginTop: "1.5rem" }}><Link href="/app/feed">← Back to feed</Link></p>
    </main>
  );
}
