"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { authHeaders, getStoredWallet, storeSession } from "../../../lib/session";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

type SortKey = "shills" | "members" | "points" | "missions";

type CommunityRow = {
  rank: number;
  id: string;
  name: string;
  ticker: string;
  description?: string;
  imageUrl?: string;
  chainId?: string;
  contractAddress?: string;
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

const SORT_OPTIONS: { key: SortKey; label: string; desc: string }[] = [
  { key: "shills", label: "🔥 Hottest", desc: "Most shills in last 24h" },
  { key: "members", label: "👥 Biggest", desc: "Most members" },
  { key: "points", label: "🏆 Most Earned", desc: "Total points distributed" },
  { key: "missions", label: "⚡ Most Active", desc: "Missions launched in 48h" }
];

function ActivityBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="cl-bar-track">
      <div className="cl-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function JoinButton({ communityId, onJoined }: { communityId: string; onJoined: (id: string) => void }) {
  const [loading, setLoading] = useState(false);
  const wallet = getStoredWallet();

  const handleJoin = async () => {
    if (!wallet) {
      alert("Connect your wallet first (top right).");
      return;
    }
    setLoading(true);
    try {
      await fetch(`${API_BASE}/communities/${communityId}/join`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({})
      });
      // Store this community as current
      localStorage.setItem("shillops.communityId", communityId);
      onJoined(communityId);
    } catch {
      alert("Failed to join. Make sure you're signed in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button className="btn cl-join-btn" onClick={handleJoin} disabled={loading}>
      {loading ? "Joining…" : "Join & Raid"}
    </button>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="cl-rank cl-rank-gold">🥇 #1</span>;
  if (rank === 2) return <span className="cl-rank cl-rank-silver">🥈 #2</span>;
  if (rank === 3) return <span className="cl-rank cl-rank-bronze">🥉 #3</span>;
  return <span className="cl-rank">#{rank}</span>;
}

export default function CommunityLeaderboardPage() {
  const [rows, setRows] = useState<CommunityRow[]>([]);
  const [sort, setSort] = useState<SortKey>("shills");
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState<string | null>(null);

  const load = useCallback(async (s: SortKey) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/communities/leaderboard?sort=${s}&limit=20`);
      if (res.ok) setRows(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(sort);
    const iv = setInterval(() => void load(sort), 30_000);
    return () => clearInterval(iv);
  }, [sort, load]);

  const maxVal = rows.reduce((m, r) => {
    const v = sort === "members" ? r.memberCount
      : sort === "points" ? r.totalPoints
      : sort === "missions" ? r.activeMissions24h
      : r.shills24h;
    return Math.max(m, v);
  }, 1);

  const activeCommunity = typeof window !== "undefined"
    ? localStorage.getItem("shillops.communityId")
    : null;

  return (
    <main className="container">
      {/* Header */}
      <div className="cl-header">
        <div>
          <div className="kicker">Community Leaderboard</div>
          <h1 className="cl-h1">Find your raid community</h1>
          <p className="muted cl-sub">
            Pick the most active community to join, shill their coin, and earn points.
            The more you contribute, the higher your rank — and the more coin you can redeem.
          </p>
        </div>
        <div className="cl-stats-strip">
          <div className="cl-stat">
            <span className="cl-stat-num">{rows.length}</span>
            <span className="cl-stat-label">Communities</span>
          </div>
          <div className="cl-stat">
            <span className="cl-stat-num">{rows.reduce((s, r) => s + r.memberCount, 0).toLocaleString()}</span>
            <span className="cl-stat-label">Total raiders</span>
          </div>
          <div className="cl-stat">
            <span className="cl-stat-num">{rows.reduce((s, r) => s + r.shills24h, 0).toLocaleString()}</span>
            <span className="cl-stat-label">Shills today</span>
          </div>
          <div className="cl-stat">
            <span className="cl-stat-num">{rows.filter((r) => r.focusRaidLive).length}</span>
            <span className="cl-stat-label">Live raids</span>
          </div>
        </div>
      </div>

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

      {/* Table */}
      {loading && rows.length === 0 ? (
        <div className="cl-loading">Loading communities…</div>
      ) : rows.length === 0 ? (
        <div className="card">
          <p>No communities yet. <Link href="/app">Be the first to create one.</Link></p>
        </div>
      ) : (
        <div className="cl-list">
          {rows.map((row) => {
            const metricVal = sort === "members" ? row.memberCount
              : sort === "points" ? row.totalPoints
              : sort === "missions" ? row.activeMissions24h
              : row.shills24h;
            const isCurrent = row.id === activeCommunity;
            const isJoined = row.id === joined;

            return (
              <div key={row.id} className={`cl-row${isCurrent ? " cl-row-current" : ""}`}>
                {/* Rank */}
                <div className="cl-row-rank">
                  <RankBadge rank={row.rank} />
                </div>

                {/* Identity */}
                <div className="cl-row-identity">
                  <div className="cl-row-top">
                    <span className="cl-ticker">${row.ticker}</span>
                    <span className="cl-name">{row.name}</span>
                    {row.focusRaidLive && (
                      <span className="cl-live-badge">🔴 LIVE RAID</span>
                    )}
                    {isCurrent && (
                      <span className="cl-current-badge">✓ Your community</span>
                    )}
                  </div>
                  {row.description && (
                    <div className="cl-description">{row.description}</div>
                  )}
                  <div className="cl-row-meta">
                    <span>👥 {row.memberCount.toLocaleString()} members</span>
                    <span>⚡ {row.activeMissions24h} active missions</span>
                    <span>🎯 {row.shills24h} shills today</span>
                    <span>🏆 {row.totalPoints.toLocaleString()} pts total</span>
                    {row.dexUrl && (
                      <a href={row.dexUrl} target="_blank" rel="noopener noreferrer" className="cl-dex-link">
                        DexScreener ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* Bar + metric */}
                <div className="cl-row-metric">
                  <div className="cl-metric-val">{metricVal.toLocaleString()}</div>
                  <div className="cl-metric-label">
                    {sort === "members" ? "members"
                      : sort === "points" ? "total pts"
                      : sort === "missions" ? "missions 48h"
                      : "shills 24h"}
                  </div>
                  <ActivityBar value={metricVal} max={maxVal} />
                </div>

                {/* Actions */}
                <div className="cl-row-actions">
                  {isJoined || isCurrent ? (
                    <div className="cl-joined-actions">
                      <Link
                        href="/app/feed"
                        className="btn cl-join-btn"
                        onClick={() => localStorage.setItem("shillops.communityId", row.id)}
                      >
                        Open Raid Feed
                      </Link>
                      <Link href="/app" className="btn secondary cl-missions-btn">
                        Missions
                      </Link>
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

      {/* CTA for new raiders */}
      <div className="cl-cta-box">
        <div className="cl-cta-icon">⚡</div>
        <div>
          <div className="cl-cta-title">Don't see your coin?</div>
          <div className="cl-cta-sub">
            Search by contract address or ticker to find or create a community for any token.
          </div>
        </div>
        <Link href="/" className="btn cl-cta-btn">Search by contract</Link>
      </div>
    </main>
  );
}
