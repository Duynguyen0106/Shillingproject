"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ConnectWalletButton from "../../ConnectWalletButton";
import { API_BASE } from "../../../lib/config";
import { getStoredCommunityId } from "../../../lib/community";
import { authHeaders, getStoredWallet, notifyOps } from "../../../lib/session";
import { useConnectedWallet } from "../../../lib/useConnectedWallet";

type FeedPost = {
  id: string;
  kind: "KOL_POST" | "MENTION";
  url: string;
  authorHandle: string;
  authorName?: string | null;
  authorFollowers?: number;
  text: string;
  likeCount?: number;
  replyCount?: number;
  retweetCount?: number;
  quoteCount?: number;
  viewCount?: number;
  heat?: number;
  postedAt: string;
  missionId?: string | null;
  mission?: { id: string; status: string; title: string } | null;
};

type KolWatch = {
  id: string;
  handle: string;
  displayName?: string | null;
  bio?: string | null;
  profileImageUrl?: string | null;
  followers?: number | null;
  following?: number | null;
  statusesCount?: number | null;
  verified?: boolean;
  lastFetchedAt?: string | null;
  _count?: { posts: number };
  stats?: { posts: number; heat: number; lastHeat: number; lastPostedAt?: string | null };
};

type FeedResponse = {
  provider: "twitterapi.io" | "x" | "none";
  ticker: string;
  contractAddress?: string | null;
  kols: KolWatch[];
  posts: FeedPost[];
};

function timeAgo(value: string): string {
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function compact(value?: number | null): string {
  const n = value ?? 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function RaidFeedPage() {
  const { connected, wallet } = useConnectedWallet();
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [handle, setHandle] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState<"all" | "KOL_POST" | "MENTION">("all");
  const [kolFilter, setKolFilter] = useState("");
  const [kolQuery, setKolQuery] = useState("");
  const [minFollowers, setMinFollowers] = useState(0);
  const [minEngagement, setMinEngagement] = useState(0);
  const [sort, setSort] = useState<"new" | "hot">("new");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const communityId = getStoredCommunityId();
    const params = new URLSearchParams();
    if (kind !== "all") params.set("kind", kind);
    if (kolFilter) params.set("handle", kolFilter);
    if (minFollowers) params.set("minFollowers", String(minFollowers));
    if (minEngagement) params.set("minEngagement", String(minEngagement));
    if (sort !== "new") params.set("sort", sort);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/communities/${communityId}/feed${qs ? `?${qs}` : ""}`, { cache: "no-store" });
    if (!res.ok) {
      setFeed(null);
      setStatus("Bind a mint first, then open the raid feed.");
      return;
    }
    setFeed(await res.json());
    setStatus("");
  }, [kind, kolFilter, minFollowers, minEngagement, sort]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    window.addEventListener("shillops-community", load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("shillops-community", load);
    };
  }, [load]);

  async function addKol() {
    if (!wallet) return;
    setBusy(true);
    const res = await fetch(`${API_BASE}/communities/${getStoredCommunityId()}/kols`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ wallet: getStoredWallet(), handle })
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(body.error || "Could not add KOL.");
      return;
    }
    setHandle("");
    setStatus(`Watching @${body.watch.handle}${body.watch.followers ? ` · ${compact(body.watch.followers)} followers` : ""}`);
    await load();
  }

  async function refresh() {
    if (!wallet) return;
    setBusy(true);
    setStatus("Pulling live posts…");
    const res = await fetch(`${API_BASE}/communities/${getStoredCommunityId()}/feed/refresh`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ wallet: getStoredWallet() })
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(body.error || "Refresh failed.");
      return;
    }
    if (body.provider === "none") {
      setStatus(body.message || "Add TWITTERAPI_IO_KEY or X_BEARER_TOKEN to pull live X posts.");
    } else {
      setStatus(`Live pull: +${body.added ?? 0} posts, ${body.mentions ?? 0} mentions.`);
    }
    await load();
  }

  async function shill(post: FeedPost) {
    if (!wallet) {
      setStatus("Connect a wallet to claim the raid.");
      return;
    }
    setBusy(true);
    const res = await fetch(`${API_BASE}/communities/${getStoredCommunityId()}/feed/${post.id}/shill`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ wallet: getStoredWallet() })
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(body.error || "Could not claim this post.");
      return;
    }
    notifyOps();
    window.open(body.url || post.url, "_blank", "noopener,noreferrer");
    setStatus("Raid claimed. Reply on that X post, then submit proof on the mission.");
    await load();
  }

  const selectedKol = useMemo(
    () => feed?.kols.find((kol) => kol.handle === kolFilter) ?? null,
    [feed?.kols, kolFilter]
  );
  const visibleKols = useMemo(() => {
    const q = kolQuery.replace(/^@/, "").toLowerCase().trim();
    if (!q) return feed?.kols ?? [];
    return (feed?.kols ?? []).filter(
      (kol) => kol.handle.toLowerCase().includes(q) || (kol.displayName || "").toLowerCase().includes(q)
    );
  }, [feed?.kols, kolQuery]);

  return (
    <main className="container">
      <div className="kicker">Do not hunt on X</div>
      <h1>Raid Feed</h1>
      <p className="muted">
        Filter KOLs by followers and post interaction, then click a post to shill it. Mentions of the ticker or CA still notify the whole room.
      </p>
      {feed && (
        <div className="row">
          <span className="badge">{feed.ticker}</span>
          {feed.contractAddress && <span className="badge">{feed.contractAddress.slice(0, 10)}…</span>}
          <span className={`badge ${feed.provider === "none" ? "caution" : "ok"}`}>
            {feed.provider === "none" ? "Live X off" : `Live via ${feed.provider}`}
          </span>
        </div>
      )}
      {feed?.provider === "none" && (
        <div className="card">
          <p>
            Set <code>TWITTERAPI_IO_KEY</code> or <code>X_BEARER_TOKEN</code> to refresh followers, bios, and likes automatically.
          </p>
        </div>
      )}
      <div className="card">
        <h3>Watched KOLs</h3>
        <p className="muted">Members search and filter this list. Tap a card to show only that KOL. Only the CTO lead adds handles.</p>
        <div className="row">
          <input
            value={kolQuery}
            onChange={(e) => setKolQuery(e.target.value)}
            placeholder="Search handle or name"
            style={{ maxWidth: 240 }}
          />
        </div>
        {(visibleKols.length ?? 0) === 0 && <p className="muted">No KOLs match these filters.</p>}
        <div className="kol-grid">
          {visibleKols.map((kol) => (
            <button
              key={kol.id}
              type="button"
              className={`kol-card${kolFilter === kol.handle ? " selected" : ""}`}
              onClick={() => setKolFilter(kolFilter === kol.handle ? "" : kol.handle)}
            >
              {kol.profileImageUrl
                ? <img src={kol.profileImageUrl} alt="" className="kol-avatar" />
                : <span className="kol-avatar fallback">@{kol.handle.slice(0, 1)}</span>}
              <span>
                <strong>@{kol.handle}</strong>
                {kol.verified && <span className="badge ok">Verified</span>}
                {kol.displayName && <small>{kol.displayName}</small>}
                <small>{compact(kol.followers)} followers · {compact(kol.following)} following</small>
                <small>{compact(kol.stats?.heat ?? 0)} interaction · {kol.stats?.posts ?? kol._count?.posts ?? 0} posts</small>
              </span>
            </button>
          ))}
        </div>
        {selectedKol && (
          <p className="muted">
            {selectedKol.bio || `@${selectedKol.handle}`}
            {typeof selectedKol.statusesCount === "number" ? ` · ${compact(selectedKol.statusesCount)} tweets` : ""}
            {selectedKol.stats?.lastHeat ? ` · last post ${compact(selectedKol.stats.lastHeat)} interaction` : ""}
          </p>
        )}
        {connected ? (
          <div className="row" style={{ marginTop: 12 }}>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@username"
              style={{ maxWidth: 240 }}
            />
            <button className="btn secondary" disabled={busy} onClick={() => void addKol()}>Watch KOL</button>
            <button className="btn" disabled={busy} onClick={() => void refresh()}>Pull live posts</button>
          </div>
        ) : (
          <ConnectWalletButton />
        )}
      </div>
      <div className="card">
        <h3>Filter KOLs and posts</h3>
        <div className="row">
          <button className="btn secondary" type="button" onClick={() => setKind("all")}>All</button>
          <button className="btn secondary" type="button" onClick={() => setKind("KOL_POST")}>KOL posts</button>
          <button className="btn secondary" type="button" onClick={() => setKind("MENTION")}>Mentions</button>
          <label>
            Min followers
            <select value={minFollowers} onChange={(e) => setMinFollowers(Number(e.target.value))}>
              <option value={0}>Any</option>
              <option value={10000}>10k+</option>
              <option value={50000}>50k+</option>
              <option value={100000}>100k+</option>
              <option value={500000}>500k+</option>
            </select>
          </label>
          <label>
            Min interaction
            <select value={minEngagement} onChange={(e) => setMinEngagement(Number(e.target.value))}>
              <option value={0}>Any</option>
              <option value={50}>50+</option>
              <option value={200}>200+</option>
              <option value={1000}>1k+</option>
              <option value={5000}>5k+</option>
            </select>
          </label>
          <label>
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as "new" | "hot")}>
              <option value="new">Newest</option>
              <option value="hot">Most interaction</option>
            </select>
          </label>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              setKind("all");
              setKolFilter("");
              setKolQuery("");
              setMinFollowers(0);
              setMinEngagement(0);
              setSort("new");
            }}
          >
            Clear
          </button>
        </div>
      </div>
      {(feed?.posts.length ?? 0) === 0 && (
        <div className="card">
          <p>No posts match these filters. Watch KOLs, pull live, or loosen followers/interaction.</p>
        </div>
      )}
      {feed?.posts.map((post) => (
        <div key={post.id} className={`card${post.kind === "MENTION" ? " next-play" : ""}`}>
          <div className="row">
            <span className={`badge ${post.kind === "MENTION" ? "high" : "ok"}`}>
              {post.kind === "MENTION" ? "Mention" : "KOL"}
            </span>
            <strong>@{post.authorHandle}</strong>
            {typeof post.authorFollowers === "number" && post.authorFollowers > 0 && (
              <span className="muted">{compact(post.authorFollowers)} followers</span>
            )}
            <span className="muted">{timeAgo(post.postedAt)}</span>
          </div>
          <p>{post.text}</p>
          <p className="muted">
            {compact(post.likeCount)} likes · {compact(post.replyCount)} replies · {compact(post.retweetCount)} reposts · {compact(post.quoteCount)} quotes · {compact(post.viewCount)} views
          </p>
          <div className="row">
            <a className="btn" href={post.url} target="_blank" rel="noreferrer">Open on X</a>
            <button className="btn secondary" disabled={busy} onClick={() => void shill(post)}>
              Shill this
            </button>
            {post.missionId && <Link href={`/app/missions/${post.missionId}`}>Mission</Link>}
          </div>
        </div>
      ))}
      {status && <p>{status}</p>}
    </main>
  );
}
