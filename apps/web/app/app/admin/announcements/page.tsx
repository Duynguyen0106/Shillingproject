"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../../../../lib/config";
import { authHeaders } from "../../../../lib/session";
import { getStoredCommunityId } from "../../../../lib/community";
import ConnectToContinue from "../../../ConnectToContinue";

interface Announcement {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: string;
  expiresAt: string | null;
  author: { wallet: string; displayName: string | null } | null;
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [pinned, setPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const communityId = getStoredCommunityId();

  const load = useCallback(() => {
    if (!communityId) { setLoading(false); return; }
    fetch(`${API_BASE}/communities/${communityId}/announcements`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setAnnouncements(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!text.trim()) return;
    setSaving(true); setMsg(null);
    const res = await fetch(`${API_BASE}/communities/${communityId}/announcements`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ text, pinned, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined })
    });
    if (res.ok) {
      setMsg("Announcement posted!");
      setText(""); setPinned(false); setExpiresAt("");
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(e.error || "Failed");
    }
    setSaving(false);
  };

  const del = async (id: string) => {
    await fetch(`${API_BASE}/communities/${communityId}/announcements/${id}`, {
      method: "DELETE", headers: authHeaders()
    });
    setAnnouncements((a) => a.filter((x) => x.id !== id));
  };

  return (
    <ConnectToContinue
      title="Announcement Composer"
      kicker="Lead tools"
      description="Post pinned messages visible to all community members at the top of the feed."
      gateDescription="Connect wallet to compose and manage community announcements."
      backHref="/app/admin/dashboard"
      backLabel="← Back to admin"
    >
      {loading && <p className="muted">Loading…</p>}
      {!loading && announcements.length === 0 && <div className="card"><p className="muted">No announcements yet.</p></div>}

      {announcements.map((a) => (
        <div key={a.id} className={`card announcement-mgmt-card ${a.pinned ? "pinned" : ""}`}>
          <div className="ann-header">
            {a.pinned && <span className="ann-pin">📌 Pinned</span>}
            <span className="muted" style={{ fontSize: "0.75rem" }}>{new Date(a.createdAt).toLocaleString()}</span>
          </div>
          <p className="ann-text">{a.text}</p>
          {a.expiresAt && <p className="muted" style={{ fontSize: "0.75rem" }}>Expires: {new Date(a.expiresAt).toLocaleDateString()}</p>}
          <button className="btn" style={{ background: "#450a0a", fontSize: "0.75rem", padding: "0.2rem 0.6rem", marginTop: "0.5rem" }} onClick={() => del(a.id)}>Delete</button>
        </div>
      ))}

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Post Announcement</h2>
        <div className="form-group">
          <label>Message *</label>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="🚀 New focus raid starting now! Shill the KOL post and earn double points..." style={{ resize: "vertical" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.25rem" }}>
            <span className="muted" style={{ fontSize: "0.75rem" }}>{text.length}/1000</span>
          </div>
        </div>
        <div className="form-group" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" id="pin" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          <label htmlFor="pin" style={{ margin: 0, cursor: "pointer" }}>Pin this announcement</label>
        </div>
        <div className="form-group">
          <label>Expires at (optional)</label>
          <input className="input" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <button className="btn" onClick={post} disabled={saving || !text.trim()}>Post announcement</button>
        {msg && <p className="muted" style={{ marginTop: "0.5rem" }}>{msg}</p>}
      </div>
    </ConnectToContinue>
  );
}
