"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { authHeaders, getStoredWallet } from "../../../lib/session";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

type SortKey = "shills" | "members" | "points" | "missions";

type CommunityRow = {
  rank: number;
  id: string;
  name: string;
  ticker: string;
  description?: string;
  dexUrl?: string;
  memberCount: number;
  missionCount: number;
  activeMissions24h: number;
  shillCount: number;
  shills24h: number;
  totalPoints: number;
  focusRaidLive: boolean;
  createdAt: string;
};

type LeaderboardEvent = {
  type: "shill" | "proof" | "focus" | "join" | "tick";
  communityId: string;
  ticker: string;
  shills24h: number;
  memberCount: number;
  activeMissions24h: number;
  totalPoints: number;
  focusRaidLive: boolean;
  actor?: { wallet: string; displayName: string | null } | null;
  pointsAwarded?: number;
};

type ActivityItem = {
  id: string;
  type: LeaderboardEvent["type"];
  communityId: string;
  ticker: string;
  actor?: string | null;
  pointsAwarded?: number;
  ts: number;
};

const SORT_OPTIONS: { key: SortKey; label: string; desc: string }[] = [
  { key: "shills",   label: "🔥 Hottest",     desc: "Shills in 24h" },
  { key: "members",  label: "👥 Biggest",      desc: "Most members"  },
  { key: "points",   label: "🏆 Most Earned",  desc: "Total points"  },
  { key: "missions", label: "⚡ Most Active",  desc: "Missions 48h"  }
];

const EVENT_ICONS: Record<LeaderboardEvent["type"], string> = {
  shill: "🎯",
  proof: "✅",
  focus: "🔴",
  join:  "👋",
  tick:  "⏱"
};

const EVENT_LABELS: Record<LeaderboardEvent["type"], (e: ActivityItem) => string> = {
  shill: (e) => `${e.actor || "Someone"} shilled $${e.ticker}`,
  proof: (e) => `${e.actor || "Someone"} proved a $${e.ticker} shill${e.pointsAwarded ? ` (+${e.pointsAwarded} pts)` : ""}`,
  focus: (e) => `Focus raid called in $${e.ticker}`,
  join:  (e) => `${e.actor || "Someone"} joined $${e.ticker}`,
  tick:  (e) => `$${e.ticker} tick`
};

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

function ActivityTicker({ items }: { items: ActivityItem[] }) {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => forceRender((n) => n + 1), 5_000);
    return () => clearInterval(iv);
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="cl-activity-ticker">
      <div className="cl-activity-label">⚡ Live activity</div>
      <div className="cl-activity-list">
        {items.slice(0, 12).map((item) => (
          <div key={item.id} className={`cl-activity-item cl-activity-${item.type}`}>
            <span className="cl-activity-icon">{EVENT_ICONS[item.type]}</span>
            <span className="cl-activity-text">{EVENT_LABELS[item.type](item)}</span>
            <span className="cl-activity-time">{timeAgo(item.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveDot({ active }: { active: boolean }) {
  return (
    <span className={`cl-live-dot${active ? " cl-live-dot-on" : ""}`} title={active ? "Live" : "Connecting…"} />
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="cl-rank cl-rank-gold">🥇</span>;
  if (rank === 2) return <span className="cl-rank cl-rank-silver">🥈</span>;
  if (rank === 3) return <span className="cl-rank cl-rank-bronze">🥉</span>;
  return <span className="cl-rank">#{rank}</span>;
}

function ActivityBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="cl-bar-track">
      <div className="cl-bar-fill" style={{ width: `${Math.max(pct, 2)}%` }} />
    </div>
  );
}

function JoinButton({ communityId, onJoined }: { communityId: string; onJoined: (id: string) => void }) {
  const [loading, setLoading] = useState(false);
  const handleJoin = async () => {
    if (!getStoredWallet()) { alert("Connect your wallet first (top right)."); return; }
    setLoading(true);
    try {
      await fetch(`${API_BASE}/communities/${communityId}/join`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({})
      });
      localStorage.setItem("shillops.communityId", communityId);
      onJoined(communityId);
    } catch { alert("Failed to join. Make sure you're signed in."); }
    setLoading(false);
  };
  return (
    <button className="btn cl-join-btn" onClick={handleJoin} disabled={loading}>
      {loading ? "Joining…" : "Join & Raid"}
    </button>
  );
}

export default function CommunityLeaderboardPage() {
  const [rows, setRows] = useState<CommunityRow[]>([]);
  const [sort, setSort] = useState<SortKey>("shills");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [joined, setJoined] = useState<string | null>(null);
  const actIdCounter = useRef(0);
  const sseRef = useRef<EventSource | null>(null);

  // Initial full load
  const loadFull = useCallback(async (s: SortKey) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/communities/leaderboard?sort=${s}&limit=20`);
      if (res.ok) setRows(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // Apply a leaderboard event to the rows in-place
  const applyEvent = useCallback((evt: LeaderboardEvent) => {
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== evt.communityId) return r;
        return {
          ...r,
          shills24h: evt.shills24h,
          memberCount: evt.memberCount,
          activeMissions24h: evt.activeMissions24h,
          totalPoints: evt.totalPoints,
          focusRaidLive: evt.focusRaidLive
        };
      });
      return updated;
    });

    // Flash the updated row
    setFlashIds((prev) => {
      const next = new Set(prev);
      next.add(evt.communityId);
      return next;
    });
    setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        next.delete(evt.communityId);
        return next;
      });
    }, 1200);

    // Prepend to activity ticker
    if (evt.type !== "tick") {
      const item: ActivityItem = {
        id: `${Date.now()}-${actIdCounter.current++}`,
        type: evt.type,
        communityId: evt.communityId,
        ticker: evt.ticker,
        actor: evt.actor?.displayName || (evt.actor?.wallet ? evt.actor.wallet.slice(0, 6) + "…" : null),
        pointsAwarded: evt.pointsAwarded,
        ts: Date.now()
      };
      setActivity((prev) => [item, ...prev].slice(0, 30));
    }
  }, []);

  // Connect SSE
  const connectSSE = useCallback(() => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    const es = new EventSource(`${API_BASE}/communities/leaderboard/live`);
    sseRef.current = es;

    es.addEventListener("hello", () => setConnected(true));
    es.addEventListener("lb", (e) => {
      try { applyEvent(JSON.parse((e as MessageEvent).data)); } catch { /* ignore */ }
    });
    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 3s
      setTimeout(() => connectSSE(), 3_000);
    };
    return () => { es.close(); sseRef.current = null; };
  }, [applyEvent]);

  useEffect(() => {
    void loadFull(sort);
  }, [sort, loadFull]);

  useEffect(() => {
    const cleanup = connectSSE();
    return cleanup;
  }, [connectSSE]);

  // Re-sort rows whenever sort changes
  const sortedRows = [...rows].sort((a, b) => {
    const val = (r: CommunityRow) =>
      sort === "members"  ? r.memberCount :
      sort === "points"   ? r.totalPoints :
      sort === "missions" ? r.activeMissions24h :
      r.shills24h;
    return val(b) - val(a) || b.shillCount - a.shillCount;
  }).map((r, i) => ({ ...r, rank: i + 1 }));

  const maxVal = sortedRows.reduce((m, r) => {
    const v = sort === "members" ? r.memberCount
      : sort === "points" ? r.totalPoints
      : sort === "missions" ? r.activeMissions24h
      : r.shills24h;
    return Math.max(m, v);
  }, 1);

  const activeCommunity = typeof window !== "undefined"
    ? localStorage.getItem("shillops.communityId") : null;

  const totalShills24h = rows.reduce((s, r) => s + r.shills24h, 0);
  const liveRaids = rows.filter((r) => r.focusRaidLive).length;

  return (
    <main className="container">
      {/* Header */}
      <div className="cl-header">
        <div>
          <div className="kicker">Community Leaderboard</div>
          <h1 className="cl-h1">
            Find your raid community
            <LiveDot active={connected} />
          </h1>
          <p className="muted cl-sub">
            Every shill, proof, and focus raid updates this board instantly.
            Join the most active community — raid their coin, earn points, redeem your bag.
          </p>
        </div>
        <div className="cl-stats-strip">
          <div className="cl-stat">
            <span className="cl-stat-num">{rows.length}</span>
            <span className="cl-stat-label">Communities</span>
          </div>
          <div className="cl-stat">
            <span className="cl-stat-num">{rows.reduce((s, r) => s + r.memberCount, 0).toLocaleString()}</span>
            <span className="cl-stat-label">Raiders</span>
          </div>
          <div className="cl-stat">
            <span className="cl-stat-num cl-stat-orange">{totalShills24h.toLocaleString()}</span>
            <span className="cl-stat-label">Shills today</span>
          </div>
          <div className="cl-stat">
            <span className={`cl-stat-num${liveRaids > 0 ? " cl-stat-red" : ""}`}>{liveRaids}</span>
            <span className="cl-stat-label">Live raids</span>
          </div>
          <div className="cl-stat">
            <span className={`cl-stat-num cl-stat-live ${connected ? "cl-connected" : "cl-disconnected"}`}>
              {connected ? "LIVE" : "…"}
            </span>
            <span className="cl-stat-label">Updates</span>
          </div>
        </div>
      </div>

      {/* Live activity ticker */}
      <ActivityTicker items={activity} />

      {/* Sort tabs */}
      <div className="cl-sort-tabs">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            className={`cl-tab${sort === opt.key ? " active" : ""}`}
            onClick={() => setSort(opt.key)}
          >
            {opt.label}
            <span className="cl-tab-desc">{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* Community rows */}
      {loading && sortedRows.length === 0 ? (
        <div className="cl-loading">Loading communities…</div>
      ) : sortedRows.length === 0 ? (
        <div className="card">
          <p>No communities yet. <Link href="/app">Be the first to create one.</Link></p>
        </div>
      ) : (
        <div className="cl-list">
          {sortedRows.map((row) => {
            const metricVal =
              sort === "members"  ? row.memberCount :
              sort === "points"   ? row.totalPoints :
              sort === "missions" ? row.activeMissions24h :
              row.shills24h;
            const isCurrent = row.id === activeCommunity;
            const isJoined  = row.id === joined;
            const isFlashing = flashIds.has(row.id);

            return (
              <div
                key={row.id}
                className={[
                  "cl-row",
                  isCurrent ? "cl-row-current" : "",
                  isFlashing ? "cl-row-flash" : ""
                ].filter(Boolean).join(" ")}
              >
                <div className="cl-row-rank"><RankBadge rank={row.rank} /></div>

                <div className="cl-row-identity">
                  <div className="cl-row-top">
                    <span className="cl-ticker">${row.ticker}</span>
                    <span className="cl-name">{row.name}</span>
                    {row.focusRaidLive && <span className="cl-live-badge">🔴 LIVE RAID</span>}
                    {isCurrent && <span className="cl-current-badge">✓ Your community</span>}
                  </div>
                  {row.description && (
                    <div className="cl-description">{row.description}</div>
                  )}
                  <div className="cl-row-meta">
                    <span>👥 {row.memberCount.toLocaleString()}</span>
                    <span>⚡ {row.activeMissions24h} missions</span>
                    <span className="cl-meta-shills">🎯 {row.shills24h} shills today</span>
                    <span>🏆 {row.totalPoints.toLocaleString()} pts</span>
                    {row.dexUrl && (
                      <a href={row.dexUrl} target="_blank" rel="noopener noreferrer" className="cl-dex-link">
                        DexScreener ↗
                      </a>
                    )}
                  </div>
                </div>

                <div className="cl-row-metric">
                  <div className="cl-metric-val">{metricVal.toLocaleString()}</div>
                  <div className="cl-metric-label">
                    {sort === "members"  ? "members"   :
                     sort === "points"   ? "total pts" :
                     sort === "missions" ? "missions"  : "shills 24h"}
                  </div>
                  <ActivityBar value={metricVal} max={maxVal} />
                </div>

                <div className="cl-row-actions">
                  {isJoined || isCurrent ? (
                    <div className="cl-joined-actions">
                      <Link
                        href="/app/feed"
                        className="btn cl-join-btn"
                        onClick={() => localStorage.setItem("shillops.communityId", row.id)}
                      >Open Raid Feed</Link>
                      <Link href="/app" className="btn secondary cl-missions-btn">Missions</Link>
                    </div>
                  ) : (
                    <JoinButton communityId={row.id} onJoined={setJoined} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom CTA */}
      <div className="cl-cta-box">
        <div className="cl-cta-icon">⚡</div>
        <div>
          <div className="cl-cta-title">Don't see your coin?</div>
          <div className="cl-cta-sub">Search by contract address or ticker to find or create a community for any token.</div>
        </div>
        <Link href="/" className="btn cl-cta-btn">Search by contract</Link>
      </div>
    </main>
  );
}
