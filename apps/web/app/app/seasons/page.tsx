"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../../../lib/config";
import { authHeaders, getStoredToken } from "../../../lib/session";
import { getStoredCommunityId } from "../../../lib/community";
import ConnectWalletButton from "../../ConnectWalletButton";
import Link from "next/link";

interface Season {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface SeasonLeaderboard {
  season: Season;
  leaderboard: { rank: number; user: { wallet: string; displayName: string | null }; points: number }[];
}

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selected, setSelected] = useState<SeasonLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [lbLoading, setLbLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const connected = Boolean(getStoredToken());
  const communityId = getStoredCommunityId();

  const load = useCallback(() => {
    if (!communityId) { setLoading(false); return; }
    fetch(`${API_BASE}/communities/${communityId}/seasons`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setSeasons(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const viewLeaderboard = (season: Season) => {
    setLbLoading(true);
    fetch(`${API_BASE}/communities/${communityId}/seasons/${season.id}/leaderboard`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setSelected(d))
      .finally(() => setLbLoading(false));
  };

  const create = async () => {
    if (!newLabel || !newStart || !newEnd) return;
    setCreating(true);
    setMsg(null);
    const res = await fetch(`${API_BASE}/communities/${communityId}/seasons`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ label: newLabel, startsAt: new Date(newStart).toISOString(), endsAt: new Date(newEnd).toISOString() })
    });
    if (res.ok) {
      setMsg("Season created!");
      setNewLabel(""); setNewStart(""); setNewEnd("");
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(e.error || "Failed");
    }
    setCreating(false);
  };

  const endSeason = async (season: Season) => {
    if (!confirm(`End season "${season.label}"? This will snapshot the final rankings.`)) return;
    const res = await fetch(`${API_BASE}/communities/${communityId}/seasons/${season.id}/end`, {
      method: "POST", headers: authHeaders()
    });
    if (res.ok) { setMsg("Season ended and rankings snapshot saved!"); load(); }
    else { const e = await res.json().catch(() => ({})); setMsg(e.error || "Failed"); }
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString();

  return (
    <main className="container">
      <div className="kicker">Competitive epochs</div>
      <h1>Seasons</h1>
      <p className="muted">Seasons are timed competitions. At the end, rankings are snapshot — top raiders earn recognition and multiplier boosts.</p>

      {loading && <p className="muted">Loading…</p>}
      {!loading && seasons.length === 0 && <div className="card"><p className="muted">No seasons yet. Create the first one below!</p></div>}

      {seasons.map((s) => (
        <div key={s.id} className={`card season-card ${s.status}`}>
          <div className="season-header">
            <span className="season-label">{s.label}</span>
            <span className={`badge season-status-badge ${s.status === "active" ? "high" : ""}`}>{s.status.toUpperCase()}</span>
          </div>
          <p className="muted">{fmt(s.startsAt)} → {fmt(s.endsAt)}</p>
          <div className="row" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
            <button className="btn secondary" onClick={() => viewLeaderboard(s)}>📊 Leaderboard</button>
            {s.status === "active" && connected && (
              <button className="btn" style={{ background: "#450a0a" }} onClick={() => endSeason(s)}>End season</button>
            )}
          </div>
        </div>
      ))}

      {selected && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <h2>📊 {selected.season.label} — Rankings</h2>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
          </div>
          {lbLoading && <p className="muted">Loading…</p>}
          {selected.leaderboard.map((entry) => (
            <div key={entry.rank} className="season-lb-row">
              <span className="season-lb-rank">#{entry.rank}</span>
              <span className="season-lb-name">{entry.user.displayName || entry.user.wallet.slice(0, 10) + "…"}</span>
              <span className="season-lb-pts">{entry.points.toLocaleString()} pts</span>
            </div>
          ))}
          {selected.leaderboard.length === 0 && <p className="muted">No scores yet this season.</p>}
        </div>
      )}

      {connected && (
        <div className="card" style={{ marginTop: "2rem" }}>
          <h2>Create Season</h2>
          <div className="form-group">
            <label>Season name</label>
            <input className="input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Season 1 — August" />
          </div>
          <div className="form-group">
            <label>Start date</label>
            <input className="input" type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
          </div>
          <div className="form-group">
            <label>End date</label>
            <input className="input" type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
          </div>
          <button className="btn" onClick={create} disabled={creating}>Create season</button>
          {msg && <p className="muted" style={{ marginTop: "0.5rem" }}>{msg}</p>}
        </div>
      )}
      {!connected && <div className="card" style={{ marginTop: "1.5rem" }}><ConnectWalletButton /></div>}

      <p style={{ marginTop: "1.5rem" }}><Link href="/app/me">← Back to My Ops</Link></p>
    </main>
  );
}
