"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { API_BASE } from "../../../lib/config";
import { authHeaders } from "../../../lib/session";
import { storeCommunity } from "../../../lib/community";
import EmptyState from "../../EmptyState";
import Link from "next/link";

interface Community {
  id: string;
  name: string;
  ticker: string;
  description: string | null;
  chainId: string | null;
  contractAddress: string | null;
  dexUrl: string | null;
  // from leaderboard
  rank?: number;
  shills24h?: number;
  memberCount?: number;
  totalPoints?: number;
  activeMissions24h?: number;
  focusRaidLive?: boolean;
  healthScore?: number;
}

function calcHealth(c: Community): number {
  const shillScore  = Math.min((c.shills24h   || 0) / 50,  1) * 40;
  const memberScore = Math.min((c.memberCount  || 0) / 100, 1) * 20;
  const missionScore= Math.min((c.activeMissions24h || 0) / 5, 1) * 25;
  const pointScore  = Math.min((c.totalPoints  || 0) / 5000, 1) * 15;
  return Math.round(shillScore + memberScore + missionScore + pointScore);
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#f87171";
  return (
    <div className="health-bar-wrap">
      <div className="health-bar-track">
        <div className="health-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="health-score" style={{ color }}>{score}</span>
    </div>
  );
}

export default function DiscoverPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"shills" | "members" | "points" | "health">("shills");

  useEffect(() => {
    fetch(`${API_BASE}/communities/leaderboard?limit=50`)
      .then((r) => r.ok ? r.json() : [])
      .then((rows: Community[]) => {
        setCommunities(rows.map((c) => ({ ...c, healthScore: calcHealth(c) })));
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return communities
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === "shills")   return (b.shills24h   || 0) - (a.shills24h   || 0);
        if (sort === "members")  return (b.memberCount  || 0) - (a.memberCount  || 0);
        if (sort === "points")   return (b.totalPoints  || 0) - (a.totalPoints  || 0);
        if (sort === "health")   return (b.healthScore  || 0) - (a.healthScore  || 0);
        return 0;
      });
  }, [communities, query, sort]);

  const join = (c: Community) => {
    storeCommunity({ id: c.id, ticker: c.ticker, name: c.name });
    window.location.href = "/app/feed";
  };

  return (
    <main className="container">
      <div className="kicker">Find your tribe</div>
      <h1>Discover Communities</h1>
      <p className="muted">Browse all active ShillOps communities. Join one and start earning points raiding for your coin.</p>

      <div className="discover-controls">
        <input
          className="input discover-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by ticker or name…"
        />
        <div className="discover-sort">
          {(["shills", "members", "points", "health"] as const).map((s) => (
            <button key={s} className={`btn secondary ${sort === s ? "active" : ""}`} onClick={() => setSort(s)}>
              {s === "shills" ? "📣 Shills" : s === "members" ? "👥 Members" : s === "points" ? "⭐ Points" : "❤️ Health"}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="muted">Loading communities…</p>}
      {!loading && filtered.length === 0 && (
        <div className="card">
          <EmptyState
            icon="🔍"
            title={query ? "No matches" : "No communities yet"}
            description={query
              ? `Nothing matched "${query}". Try another ticker or clear search.`
              : "Communities appear here once coins are bound on ShillOps. Be the first — search by contract address."}
            actionHref="/app/onboarding"
            actionLabel="Find a coin →"
          />
        </div>
      )}

      <div className="discover-grid">
        {filtered.map((c) => (
          <div key={c.id} className="card discover-card">
            <div className="discover-header">
              <div>
                <span className="discover-ticker">${c.ticker}</span>
                {c.focusRaidLive && <span className="live-badge">LIVE</span>}
              </div>
              {c.rank && <span className="discover-rank">#{c.rank}</span>}
            </div>
            <div className="discover-name">{c.name}</div>
            {c.description && <p className="muted discover-desc">{c.description.slice(0, 100)}{c.description.length > 100 ? "…" : ""}</p>}

            <div className="discover-stats">
              <span><strong>{c.shills24h || 0}</strong><span className="muted"> shills/24h</span></span>
              <span><strong>{c.memberCount || 0}</strong><span className="muted"> members</span></span>
              <span><strong>{(c.totalPoints || 0).toLocaleString()}</strong><span className="muted"> pts</span></span>
            </div>

            <div className="discover-health">
              <span className="muted" style={{ fontSize: "0.75rem" }}>Health</span>
              <HealthBar score={c.healthScore || 0} />
            </div>

            <div className="discover-actions">
              {c.contractAddress && c.chainId && (
                <Link href={`/c/${c.chainId}/${c.contractAddress}`} className="btn secondary">View</Link>
              )}
              <button className="btn" onClick={() => join(c)}>Join →</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: "2rem", textAlign: "center" }}>
        <p className="muted">Don't see your coin?</p>
        <Link href="/app/onboarding" className="btn">Search by contract address →</Link>
      </div>
    </main>
  );
}
