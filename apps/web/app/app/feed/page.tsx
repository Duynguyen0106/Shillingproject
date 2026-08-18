"use client";

import { useCallback, useEffect, useState } from "react";
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
  text: string;
  postedAt: string;
  missionId?: string | null;
  mission?: { id: string; status: string; title: string } | null;
};

type KolWatch = {
  id: string;
  handle: string;
  lastFetchedAt?: string | null;
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

export default function RaidFeedPage() {
  const { connected, wallet } = useConnectedWallet();
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [handle, setHandle] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState<"all" | "KOL_POST" | "MENTION">("all");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const communityId = getStoredCommunityId();
    const res = await fetch(`${API_BASE}/communities/${communityId}/feed`, { cache: "no-store" });
    if (!res.ok) {
      setFeed(null);
      setStatus("Bind a mint first, then open the raid feed.");
      return;
    }
    setFeed(await res.json());
    setStatus("");
  }, []);

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
    setStatus(`Watching @${body.watch.handle}`);
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

  const posts = (feed?.posts ?? []).filter((post) => filter === "all" || post.kind === filter);

  return (
    <main className="container">
      <div className="kicker">Do not hunt on X</div>
      <h1>Raid Feed</h1>
      <p className="muted">
        Click a post to shill it. KOL timelines and ticker/CA mentions land here. Mentions notify Telegram/Discord so the whole room piles on.
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
            Set <code>TWITTERAPI_IO_KEY</code> or <code>X_BEARER_TOKEN</code> on the API so this feed pulls by itself.
            Until then the lead can watch KOL handles and the poller will start on next boot.
          </p>
        </div>
      )}
      <div className="card">
        <h3>Watched KOLs</h3>
        <p className="muted">CTO lead adds handles. The app pulls their posts so raiders do not search X.</p>
        {(feed?.kols.length ?? 0) === 0 && <p className="muted">No KOLs watched yet.</p>}
        <div className="row">
          {feed?.kols.map((kol) => (
            <span key={kol.id} className="badge">@{kol.handle}</span>
          ))}
        </div>
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
      <div className="row">
        <button className={`btn secondary`} type="button" onClick={() => setFilter("all")}>All</button>
        <button className="btn secondary" type="button" onClick={() => setFilter("KOL_POST")}>KOL posts</button>
        <button className="btn secondary" type="button" onClick={() => setFilter("MENTION")}>Mentions</button>
      </div>
      {posts.length === 0 && (
        <div className="card">
          <p>No posts in the feed yet. Watch KOLs and pull live, or wait for a ticker/CA mention.</p>
        </div>
      )}
      {posts.map((post) => (
        <div key={post.id} className={`card${post.kind === "MENTION" ? " next-play" : ""}`}>
          <div className="row">
            <span className={`badge ${post.kind === "MENTION" ? "high" : "ok"}`}>
              {post.kind === "MENTION" ? "Mention" : "KOL"}
            </span>
            <strong>@{post.authorHandle}</strong>
            <span className="muted">{timeAgo(post.postedAt)}</span>
          </div>
          <p>{post.text}</p>
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
