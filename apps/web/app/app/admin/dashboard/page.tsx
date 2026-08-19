"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../../../../lib/config";
import { authHeaders } from "../../../../lib/session";
import { getStoredCommunityId } from "../../../../lib/community";
import Link from "next/link";

type Stats = {
  users: number;
  communities: number;
  shills24h: number;
  proofs24h: number;
  activeMembers24h: number;
};

type AbuseFlag = {
  id?: string;
  wallet?: string;
  displayName?: string | null;
  shills24h?: number;
  proofs24h?: number;
};

type AbuseData = {
  heavyShillers: AbuseFlag[];
  heavyProofers: AbuseFlag[];
};

type Announcement = {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: string;
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [abuse, setAbuse] = useState<AbuseData | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annText, setAnnText] = useState("");
  const [annPinned, setAnnPinned] = useState(false);
  const [annExpiry, setAnnExpiry] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const communityId = getStoredCommunityId();

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const headers = authHeaders();
    await Promise.allSettled([
      fetch(`${API_BASE}/admin/stats`, { headers }).then((r) => r.ok ? r.json() : null).then((d) => d && setStats(d)),
      fetch(`${API_BASE}/admin/abuse-flags`, { headers }).then((r) => r.ok ? r.json() : null).then((d) => d && setAbuse(d)),
      fetch(`${API_BASE}/communities/${communityId}/announcements`, { headers }).then((r) => r.ok ? r.json() : []).then(setAnnouncements)
    ]);
  }

  async function postAnnouncement() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/communities/${communityId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ text: annText.trim(), pinned: annPinned, expiresInHours: annExpiry })
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      setAnnText("");
      await loadAll();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAnn(id: string) {
    await fetch(`${API_BASE}/communities/${communityId}/announcements/${id}`, {
      method: "DELETE",
      headers: authHeaders()
    });
    await loadAll();
  }

  return (
    <main className="container">
      <div className="kicker">Admin</div>
      <h1>Dashboard</h1>
      <div className="row" style={{ marginBottom: 16 }}>
        <Link href="/app/admin/attribution">Attribution</Link>
        <Link href="/app/admin/signals">Signals</Link>
        <Link href="/app/admin/notifications">Notifications</Link>
      </div>

      {stats && (
        <>
          <h2>Platform stats (24h)</h2>
          <div className="stats">
            <div className="stat"><span className="muted">Total users</span><strong>{stats.users}</strong></div>
            <div className="stat"><span className="muted">Communities</span><strong>{stats.communities}</strong></div>
            <div className="stat"><span className="muted">Shills</span><strong>{stats.shills24h}</strong></div>
            <div className="stat"><span className="muted">Proofs</span><strong>{stats.proofs24h}</strong></div>
            <div className="stat"><span className="muted">Active members</span><strong>{stats.activeMembers24h}</strong></div>
          </div>
        </>
      )}

      <h2>Announcements</h2>
      <div className="card">
        <label>
          Message
          <textarea
            rows={2}
            value={annText}
            onChange={(e) => setAnnText(e.target.value)}
            placeholder="Write an announcement for your community…"
          />
        </label>
        <div className="row" style={{ marginTop: 8 }}>
          <label style={{ flex: 1, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={annPinned} onChange={(e) => setAnnPinned(e.target.checked)} style={{ width: "auto" }} />
            Pin to top
          </label>
          <label style={{ flex: 1 }}>
            Expires after (hours)
            <input type="number" min={1} max={168} value={annExpiry} onChange={(e) => setAnnExpiry(Number(e.target.value))} />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" onClick={() => void postAnnouncement()} disabled={busy || !annText.trim()}>
          {busy ? "Posting…" : "Post announcement"}
        </button>
      </div>
      {announcements.map((ann) => (
        <div key={ann.id} className="card row">
          {ann.pinned && <span className="badge high">Pinned</span>}
          <span style={{ flex: 1 }}>{ann.text}</span>
          <button className="btn secondary small" onClick={() => void deleteAnn(ann.id)}>Delete</button>
        </div>
      ))}

      {abuse && (abuse.heavyShillers.length > 0 || abuse.heavyProofers.length > 0) && (
        <>
          <h2>Abuse flags (24h)</h2>
          {abuse.heavyShillers.length > 0 && (
            <>
              <h3>High-volume shillers</h3>
              {abuse.heavyShillers.map((u, i) => (
                <div key={i} className="card row">
                  <span>{u.displayName ?? u.wallet?.slice(0, 12) ?? "?"}</span>
                  <span className="badge high">{u.shills24h} shills</span>
                </div>
              ))}
            </>
          )}
          {abuse.heavyProofers.length > 0 && (
            <>
              <h3>High-volume proofs</h3>
              {abuse.heavyProofers.map((u, i) => (
                <div key={i} className="card row">
                  <span>{u.displayName ?? u.wallet?.slice(0, 12) ?? "?"}</span>
                  <span className="badge high">{u.proofs24h} proofs</span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </main>
  );
}
