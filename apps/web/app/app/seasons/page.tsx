"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../../../lib/config";
import { authHeaders } from "../../../lib/session";
import { getStoredCommunityId } from "../../../lib/community";
import { WalletGate, useAuthedSession } from "../../ConnectToContinue";
import SeasonSparkline from "../../SeasonSparkline";
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

interface TimelinePoint {
  date: string;
  points: number;
  cumulative: number;
}

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selected, setSelected] = useState<SeasonLeaderboard | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [chartMode, setChartMode] = useState<"daily" | "cumulative">("daily");
  const [loading, setLoading] = useState(true);
  const [lbLoading, setLbLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const connected = useAuthedSession();
  const communityId = getStoredCommunityId();

  const load = useCallback(() => {
    if (!communityId) { setLoading(false); return; }
    fetch(`${API_BASE}/communities/${communityId}/seasons`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setSeasons(Array.isArray(d) ? d : []))
      .catch(() => setSeasons([]))
      .finally(() => setLoading(false));
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const viewLeaderboard = (season: Season) => {
    setLbLoading(true);
    Promise.all([
      fetch(`${API_BASE}/communities/${communityId}/seasons/${season.id}/leaderboard`).then((r) => r.ok ? r.json() : null),
      fetch(`${API_BASE}/communities/${communityId}/seasons/${season.id}/timeline`).then((r) => r.ok ? r.json() : { timeline: [] })
    ])
      .then(([lb, tl]) => {
        setSelected(lb);
        setTimeline(Array.isArray(tl?.timeline) ? tl.timeline : []);
      })
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
    if (res.ok) { setMsg("Season ended and rankings snapshot saved!"); load(); setSelected(null); }
    else { const e = await res.json().catch(() => ({})); setMsg(e.error || "Failed"); }
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString();

  return (
    <main className="container">
      <div className="kicker">Competitive epochs</div>
      <h1>Seasons</h1>
      <p className="muted page-lead">Seasons are timed competitions. View leaderboards and activity charts — connect wallet to create or end a season.</p>

      {loading && <p className="muted">Loading…</p>}
      {!loading && seasons.length === 0 && (
        <div className="card"><p className="muted">No seasons yet. Connect wallet to create the first one.</p></div>
      )}

      {seasons.map((s) => (
        <div key={s.id} className={`card season-card ${s.status}`}>
          <div className="season-header">
            <span className="season-label">{s.label}</span>
            <span className={`badge season-status-badge ${s.status === "active" ? "high" : ""}`}>{s.status.toUpperCase()}</span>
          </div>
          <p className="muted">{fmt(s.startsAt)} → {fmt(s.endsAt)}</p>
          <div className="row" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
            <button type="button" className="btn secondary" onClick={() => viewLeaderboard(s)}>📊 Leaderboard</button>
            {s.status === "active" && connected && (
              <button type="button" className="btn season-end-btn" onClick={() => endSeason(s)}>End season</button>
            )}
          </div>
        </div>
      ))}

      {selected && (
        <div className="card season-detail-card">
          <div className="season-detail-header">
            <h2>📊 {selected.season.label}</h2>
            <button type="button" className="season-detail-close" onClick={() => { setSelected(null); setTimeline([]); }} aria-label="Close">✕</button>
          </div>

          {lbLoading && <p className="muted">Loading…</p>}

          {!lbLoading && (
            <>
              <div className="season-chart-block">
                <div className="season-chart-tabs">
                  <button type="button" className={`btn secondary ${chartMode === "daily" ? "active" : ""}`} onClick={() => setChartMode("daily")}>Daily pts</button>
                  <button type="button" className={`btn secondary ${chartMode === "cumulative" ? "active" : ""}`} onClick={() => setChartMode("cumulative")}>Cumulative</button>
                </div>
                <SeasonSparkline
                  data={timeline}
                  mode={chartMode}
                  width={320}
                  label={chartMode === "daily" ? "Community points per day" : "Total points over season"}
                />
              </div>

              <h3 className="season-lb-heading">Rankings</h3>
              {selected.leaderboard.map((entry) => (
                <div key={entry.rank} className="season-lb-row">
                  <span className="season-lb-rank">#{entry.rank}</span>
                  <span className="season-lb-name">{entry.user.displayName || entry.user.wallet.slice(0, 10) + "…"}</span>
                  <span className="season-lb-pts">{entry.points.toLocaleString()} pts</span>
                </div>
              ))}
              {selected.leaderboard.length === 0 && <p className="muted">No scores yet this season.</p>}
            </>
          )}
        </div>
      )}

      <WalletGate title="Connect to manage seasons" description="Community leads need a connected wallet to create or configure seasons.">
        <div className="card" style={{ marginTop: "1.5rem" }}>
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
          <button type="button" className="btn" onClick={create} disabled={creating}>Create season</button>
          {msg && <p className="muted" style={{ marginTop: "0.5rem" }}>{msg}</p>}
        </div>
      </WalletGate>

      <p className="page-back"><Link href="/app/me">← Back to My Ops</Link></p>
    </main>
  );
}
