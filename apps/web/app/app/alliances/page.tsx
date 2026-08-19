"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../../../lib/config";
import { authHeaders, getStoredToken } from "../../../lib/session";
import { getStoredCommunityId } from "../../../lib/community";
import ConnectWalletButton from "../../ConnectWalletButton";
import Link from "next/link";

interface Alliance {
  id: string;
  remainingMs: number;
  status: string;
  initiator: { id: string; name: string; ticker: string };
  partner: { id: string; name: string; ticker: string };
  post: { id: string; url: string; authorHandle: string; text: string };
}

interface Community {
  id: string;
  name: string;
  ticker: string;
}

export default function AlliancePage() {
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [partnerCommunityId, setPartnerCommunityId] = useState("");
  const [feedPostId, setFeedPostId] = useState("");
  const [durationHours, setDurationHours] = useState(2);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const communityId = getStoredCommunityId();
  const connected = Boolean(getStoredToken());

  const load = useCallback(() => {
    if (!communityId) { setLoading(false); return; }
    fetch(`${API_BASE}/communities/${communityId}/alliances`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setAlliances(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch(`${API_BASE}/communities`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setCommunities(Array.isArray(d) ? d.filter((c: any) => c.id !== communityId) : []))
      .catch(() => null);
  }, [communityId]);

  const create = async () => {
    if (!partnerCommunityId || !feedPostId) return;
    setCreating(true);
    setCreateMsg(null);
    const res = await fetch(`${API_BASE}/communities/${communityId}/alliances`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ partnerCommunityId, feedPostId, durationHours })
    });
    if (res.ok) {
      setCreateMsg("Alliance raid launched!");
      setPartnerCommunityId("");
      setFeedPostId("");
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      setCreateMsg(e.error || "Failed to create alliance.");
    }
    setCreating(false);
  };

  const fmt = (ms: number) => {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h ${m}m`;
  };

  return (
    <main className="container">
      <div className="kicker">Cross-community power</div>
      <h1>Alliance Raids ⚔️</h1>
      <p className="muted">Join forces with another community to raid a target post together. Alliance raids pool shills and boost visibility.</p>

      {loading && <p className="muted">Loading…</p>}

      {alliances.length === 0 && !loading && (
        <div className="card"><p className="muted">No active alliance raids for your community.</p></div>
      )}

      {alliances.map((a) => (
        <div key={a.id} className="card alliance-card">
          <div className="alliance-header">
            <span className="alliance-teams">${a.initiator.ticker} ⚔️ ${a.partner.ticker}</span>
            <span className="badge alliance-timer">{fmt(a.remainingMs)} left</span>
          </div>
          <div className="muted">{a.post.text.slice(0, 120)}{a.post.text.length > 120 ? "…" : ""}</div>
          <div className="row" style={{ marginTop: "0.5rem", gap: "0.5rem" }}>
            <a href={a.post.url} target="_blank" rel="noreferrer" className="btn">View target post ↗</a>
          </div>
        </div>
      ))}

      {connected && (
        <div className="card" style={{ marginTop: "2rem" }}>
          <h2>Propose an Alliance Raid</h2>
          <p className="muted">Only the community lead can propose. Select an ally community and a target post.</p>
          <div className="form-group">
            <label>Partner Community</label>
            <select className="input" value={partnerCommunityId} onChange={(e) => setPartnerCommunityId(e.target.value)}>
              <option value="">— Select community —</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>${c.ticker} — {c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Target Post ID</label>
            <input className="input" value={feedPostId} onChange={(e) => setFeedPostId(e.target.value)} placeholder="Post ID from feed" />
          </div>
          <div className="form-group">
            <label>Duration (hours)</label>
            <input className="input" type="number" min={1} max={24} value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))} />
          </div>
          <button className="btn" onClick={create} disabled={creating || !partnerCommunityId || !feedPostId}>
            {creating ? "Launching…" : "Launch Alliance Raid ⚔️"}
          </button>
          {createMsg && <p className="muted" style={{ marginTop: "0.5rem" }}>{createMsg}</p>}
        </div>
      )}
      {!connected && (
        <div className="card" style={{ marginTop: "2rem" }}>
          <p className="muted">Connect wallet to propose alliance raids.</p>
          <ConnectWalletButton />
        </div>
      )}
      <p style={{ marginTop: "1.5rem" }}><Link href="/app/feed">← Back to feed</Link></p>
    </main>
  );
}
