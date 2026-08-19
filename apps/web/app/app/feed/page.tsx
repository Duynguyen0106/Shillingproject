"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ConnectWalletButton from "../../ConnectWalletButton";
import { API_BASE } from "../../../lib/config";
import { getStoredCommunityId } from "../../../lib/community";
import { LIVE_POST_EVENT, compactCount, type LiveFeedEvent, type LiveKol } from "../../../lib/liveFeed";
import { authHeaders, getStoredWallet, shortAddress } from "../../../lib/session";
import { copyText, FOCUS_EVENT, PROOF_EVENT, RAID_EVENT, clearFocus, runFocus, runShill, type FocusRaid } from "../../../lib/shillAction";
import { useConnectedWallet } from "../../../lib/useConnectedWallet";
import ProofPaste from "../../ProofPaste";
import RaidScoreboard from "../../RaidScoreboard";

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
  createdAt?: string;
  missionId?: string | null;
  mission?: { id: string; status: string; title: string } | null;
  kol?: LiveKol | null;
  shillCount?: number;
  raiderCount?: number;
  youShilled?: boolean;
  youShillCount?: number;
  youLastShilledAt?: string | null;
  youProved?: boolean;
  provedCount?: number;
  liveProvedCount?: number;
  liveProved?: Array<{ wallet: string; displayName?: string | null; you?: boolean }>;
  lastShilledAt?: string | null;
  liveRaiderCount?: number;
  liveRaiders?: Array<{ wallet: string; displayName?: string | null; at: string; you?: boolean }>;
  recentShills?: Array<{ wallet: string; displayName?: string | null; reshill?: boolean; at: string; you?: boolean }>;
  focused?: boolean;
};

type ShillHistoryItem = {
  id?: string;
  feedPostId: string;
  at: string;
  reshill: boolean;
  wallet: string;
  displayName?: string | null;
  you: boolean;
  post?: { id?: string; url?: string; authorHandle?: string; text?: string; kind?: string };
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
  talkTrack?: string | null;
  shillCopy?: string;
  focus?: FocusRaid | null;
  you?: { isLead?: boolean; canSteerFocus?: boolean };
  kols: KolWatch[];
  posts: FeedPost[];
  shillHistory?: ShillHistoryItem[];
};

function timeAgo(value: string): string {
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function compact(value?: number | null): string {
  return compactCount(value);
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
  const [freshIds, setFreshIds] = useState<string[]>([]);

  const markFresh = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setFreshIds((current) => [...ids, ...current.filter((id) => !ids.includes(id))].slice(0, 20));
    window.setTimeout(() => {
      setFreshIds((current) => current.filter((id) => !ids.includes(id)));
    }, 12_000);
  }, []);

  const load = useCallback(async () => {
    const communityId = getStoredCommunityId();
    const params = new URLSearchParams();
    if (kind !== "all") params.set("kind", kind);
    if (kolFilter) params.set("handle", kolFilter);
    if (minFollowers) params.set("minFollowers", String(minFollowers));
    if (minEngagement) params.set("minEngagement", String(minEngagement));
    if (sort !== "new") params.set("sort", sort);
    const wallet = getStoredWallet();
    if (wallet) params.set("wallet", wallet);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/communities/${communityId}/feed${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
      headers: authHeaders()
    });
    if (!res.ok) {
      setFeed(null);
      setStatus("Bind a mint first, then open the raid feed.");
      return;
    }
    setFeed(await res.json());
    setStatus("");
  }, [kind, kolFilter, minFollowers, minEngagement, sort, wallet]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 8_000);
    window.addEventListener("shillops-community", load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("shillops-community", load);
    };
  }, [load]);

  useEffect(() => {
    const onLive = (message: Event) => {
      const event = (message as CustomEvent<LiveFeedEvent>).detail;
      if (!event?.post || event.communityId !== getStoredCommunityId()) return;
      setFeed((current) => {
        if (!current) return current;
        if (current.posts.some((post) => post.id === event.post.id)) return current;
        if (kolFilter && event.post.authorHandle !== kolFilter) return current;
        if (kind !== "all" && event.post.kind !== kind) return current;
        const post = { ...event.post, kol: event.kol, kind: event.post.kind === "MENTION" ? "MENTION" : "KOL_POST" } as FeedPost;
        return { ...current, posts: [post, ...current.posts].slice(0, 50) };
      });
      markFresh([event.post.id]);
    };
    window.addEventListener(LIVE_POST_EVENT, onLive);
    return () => window.removeEventListener(LIVE_POST_EVENT, onLive);
  }, [kolFilter, kind, markFresh]);

  useEffect(() => {
    const onRaid = (message: Event) => {
      const event = (message as CustomEvent<{
        communityId: string;
        postId: string;
        liveRaiderCount?: number;
        raiderCount?: number;
        raider?: { wallet: string; displayName: string | null };
        reshill?: boolean;
      }>).detail;
      if (!event?.postId || event.communityId !== getStoredCommunityId()) return;
      const mine = Boolean(wallet && event.raider?.wallet && event.raider.wallet.toLowerCase() === wallet.toLowerCase());
      setFeed((current) => {
        if (!current) return current;
        return {
          ...current,
          posts: current.posts.map((post) => {
            if (post.id !== event.postId) return post;
            const liveRaiders = [...(post.liveRaiders ?? [])];
            if (event.raider && !liveRaiders.some((row) => row.wallet === event.raider!.wallet)) {
              liveRaiders.unshift({ wallet: event.raider.wallet, displayName: event.raider.displayName, at: new Date().toISOString(), you: mine });
            }
            return {
              ...post,
              liveRaiderCount: event.liveRaiderCount ?? (post.liveRaiderCount ?? 0) + (mine || event.raider ? 1 : 0),
              raiderCount: event.raiderCount ?? post.raiderCount,
              youShilled: post.youShilled || mine,
              youShillCount: mine ? (post.youShillCount ?? 0) + 1 : post.youShillCount,
              liveRaiders: liveRaiders.slice(0, 6)
            };
          }),
          focus: current.focus && current.focus.postId === event.postId
            ? {
              ...current.focus,
              youShilled: current.focus.youShilled || mine,
              liveRaiderCount: event.liveRaiderCount ?? current.focus.liveRaiderCount,
              raiderCount: event.raiderCount ?? current.focus.raiderCount
            }
            : current.focus
        };
      });
    };
    window.addEventListener(RAID_EVENT, onRaid);
    return () => window.removeEventListener(RAID_EVENT, onRaid);
  }, [wallet]);

  useEffect(() => {
    const onFocus = (message: Event) => {
      const event = (message as CustomEvent<{ communityId?: string; focus?: FocusRaid | null }>).detail;
      if (event?.communityId && event.communityId !== getStoredCommunityId()) return;
      setFeed((current) => current ? {
        ...current,
        focus: event?.focus
          ? {
            ...event.focus,
            youShilled: Boolean(event.focus.youShilled || current.posts.find((post) => post.id === event.focus!.postId)?.youShilled),
            youProved: Boolean(event.focus.youProved || current.posts.find((post) => post.id === event.focus!.postId)?.youProved)
          }
          : null,
        posts: current.posts.map((post) => ({ ...post, focused: event?.focus?.postId === post.id }))
      } : current);
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    const onProof = (message: Event) => {
      const event = (message as CustomEvent<{ communityId?: string; postId?: string; provedCount?: number; liveProvedCount?: number; you?: boolean }>).detail;
      if (event?.communityId && event.communityId !== getStoredCommunityId()) return;
      if (!event?.postId) return;
      setFeed((current) => current ? {
        ...current,
        focus: current.focus && current.focus.postId === event.postId
          ? {
            ...current.focus,
            youProved: current.focus.youProved || Boolean(event.you),
            provedCount: event.provedCount ?? current.focus.provedCount,
            liveProvedCount: event.liveProvedCount ?? current.focus.liveProvedCount
          }
          : current.focus,
        posts: current.posts.map((post) => post.id === event.postId
          ? {
            ...post,
            youProved: post.youProved || Boolean(event.you),
            provedCount: event.provedCount ?? post.provedCount,
            liveProvedCount: event.liveProvedCount ?? post.liveProvedCount
          }
          : post)
      } : current);
    };
    window.addEventListener(PROOF_EVENT, onProof);
    return () => {
      window.removeEventListener(FOCUS_EVENT, onFocus);
      window.removeEventListener(PROOF_EVENT, onProof);
    };
  }, []);

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

  async function shill(post: FeedPost, reshill = false) {
    if (!wallet) {
      setStatus("Connect a wallet to claim the raid.");
      return;
    }
    if (post.youShilled && !reshill) {
      setStatus("You already shilled this post. Use Reshill if you want another reply.");
      return;
    }
    setBusy(true);
    const result = await runShill({ communityId: getStoredCommunityId(), postId: post.id, reshill });
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error || "Could not claim this post.");
      await load();
      return;
    }
    if (result.alreadyShilled && !reshill) {
      setStatus("You already shilled this post. Use Reshill if you want another reply.");
      await load();
      return;
    }
    setStatus(result.missionId
      ? "Talk track copied. Reply on X, then paste YOUR reply URL here."
      : "Talk track copied. Reply composer is open.");
    await load();
  }

  async function focusRaid(post: FeedPost) {
    if (!wallet) {
      setStatus("Connect a wallet to call the raid.");
      return;
    }
    setBusy(true);
    const result = await runFocus({ communityId: getStoredCommunityId(), postId: post.id });
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error || "Could not call the focus raid.");
      return;
    }
    setStatus(`Everyone reply to @${post.authorHandle} — do not split across other tweets.`);
    await load();
  }

  async function stopFocus() {
    if (!wallet) return;
    setBusy(true);
    const result = await clearFocus(getStoredCommunityId());
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error || "Could not clear the focus raid.");
      return;
    }
    setStatus("Focus raid cleared.");
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
        New KOL posts pop in live. First shill locks the room onto one tweet. Other posts stay readable but cannot be shilled until the CTO lead moves the focus. After you reply, paste YOUR status URL on the raid — not the KOL tweet.
      </p>
      {feed && (
        <div className="row">
          <span className="badge">{feed.ticker}</span>
          {feed.contractAddress && <span className="badge">{feed.contractAddress.slice(0, 10)}…</span>}
          <span className={`badge ${feed.provider === "none" ? "caution" : "ok"}`}>
            {feed.provider === "none" ? "Live X off" : `Live via ${feed.provider}`}
          </span>
          <span className="badge ok">Popups on</span>
        </div>
      )}
      {feed?.shillCopy && (
        <div className="card">
          <h3>Talk track</h3>
          <p>{feed.shillCopy}</p>
          <button className="btn secondary" type="button" onClick={() => void copyText(feed.shillCopy || "").then((ok) => setStatus(ok ? "Talk track copied." : "Copy failed."))}>
            Copy talk track
          </button>
        </div>
      )}
      {feed?.focus && (
        <div className="card focus-raid">
          <div className="kicker">Focus raid — everyone here</div>
          <h3>Reply to @{feed.focus.authorHandle}</h3>
          <p>{feed.focus.text}</p>
          <p className="muted">Same tweet, many replies. Other posts cannot be shilled until the CTO lead moves this. After you reply, paste YOUR status URL here — not the KOL tweet.</p>
          <RaidScoreboard
            provedCount={feed.focus.provedCount ?? feed.posts.find((post) => post.id === feed.focus!.postId)?.provedCount}
            liveRaiderCount={feed.focus.liveRaiderCount ?? feed.posts.find((post) => post.id === feed.focus!.postId)?.liveRaiderCount}
            until={feed.focus.until}
          />
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => void runShill({
              communityId: getStoredCommunityId(),
              postId: feed.focus!.postId
            }).then((result) => {
              if (!result.ok) setStatus(result.error || "Could not claim this post.");
              else setStatus("Everyone is on this tweet. Talk track copied — reply here, then paste YOUR reply URL.");
              return load();
            })}>
              Shill this tweet
            </button>
            <a className="btn secondary" href={feed.focus.url} target="_blank" rel="noreferrer">Open on X</a>
            {feed.you?.canSteerFocus && (
              <button className="btn secondary" disabled={busy} onClick={() => void stopFocus()}>Clear focus</button>
            )}
          </div>
          <ProofPaste
            communityId={getStoredCommunityId()}
            postId={feed.focus.postId}
            youShilled={Boolean(feed.focus.youShilled || feed.posts.find((post) => post.id === feed.focus!.postId)?.youShilled)}
            youProved={Boolean(feed.focus.youProved || feed.posts.find((post) => post.id === feed.focus!.postId)?.youProved)}
            onStatus={setStatus}
          />
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
      <div className="card">
        <h3>Coin shill history</h3>
        <p className="muted">Who already hit each post on this mint. Your rows are marked so you can skip or reshill.</p>
        {(feed?.shillHistory?.length ?? 0) === 0 && <p className="muted">No shills recorded yet. Shill a post to start the log.</p>}
        {feed?.shillHistory?.map((item) => (
          <div key={item.id || `${item.feedPostId}-${item.at}`} className="row" style={{ marginBottom: 8 }}>
            {item.you && <span className="badge ok">You</span>}
            {item.reshill && <span className="badge">Reshill</span>}
            <strong>{item.displayName || (item.wallet ? shortAddress(item.wallet) : "Raider")}</strong>
            <span className="muted">
              {item.reshill ? "reshilled" : "shilled"} @{item.post?.authorHandle ?? "post"} · {timeAgo(item.at)}
            </span>
            {item.post?.url && <a href={item.post.url} target="_blank" rel="noreferrer">Post</a>}
          </div>
        ))}
      </div>
      {(feed?.posts.length ?? 0) === 0 && (
        <div className="card">
          <p>No posts match these filters. Watch KOLs, pull live, or loosen followers/interaction.</p>
        </div>
      )}
      {feed?.posts.map((post) => {
        const kol = post.kol ?? feed.kols.find((item) => item.handle === post.authorHandle) ?? null;
        const focused = Boolean(post.focused || feed.focus?.postId === post.id);
        const dim = Boolean(feed.focus && !focused);
        return (
        <div key={post.id} className={`card${post.kind === "MENTION" ? " next-play" : ""}${freshIds.includes(post.id) ? " live-new" : ""}${focused ? " focus-raid" : ""}${dim ? " dim" : ""}`}>
          <div className="row">
            {kol?.profileImageUrl
              ? <img src={kol.profileImageUrl} alt="" className="kol-avatar" />
              : <span className="kol-avatar fallback">@{post.authorHandle.slice(0, 1)}</span>}
            <span className={`badge ${post.kind === "MENTION" ? "high" : "ok"}`}>
              {post.kind === "MENTION" ? "Mention" : "KOL"}
            </span>
            {freshIds.includes(post.id) && <span className="badge high">New</span>}
            {focused && <span className="badge high">Everyone here</span>}
            <strong>@{post.authorHandle}</strong>
            {kol?.verified && <span className="badge ok">Verified</span>}
            {typeof (kol?.followers ?? post.authorFollowers) === "number" && (kol?.followers ?? post.authorFollowers ?? 0) > 0 && (
              <span className="muted">{compact(kol?.followers ?? post.authorFollowers)} followers</span>
            )}
            <span className="muted">{timeAgo(post.postedAt)}</span>
          </div>
          {kol?.displayName && <p className="muted">{kol.displayName}{kol.bio ? ` · ${kol.bio}` : ""}</p>}
          <p>{post.text}</p>
          <p className="muted">
            {compact(post.likeCount)} likes · {compact(post.replyCount)} replies · {compact(post.retweetCount)} reposts · {compact(post.quoteCount)} quotes · {compact(post.viewCount)} views
          </p>
          <p className="muted">
            {post.youShilled
              ? `You shilled this${post.youShillCount && post.youShillCount > 1 ? ` ${post.youShillCount}×` : ""}${post.youLastShilledAt ? ` · ${timeAgo(post.youLastShilledAt)}` : ""}`
              : "You have not shilled this post yet"}
            {post.youProved ? " · reply scored" : ""}
            {(post.provedCount ?? 0) > 0 ? ` · ${post.provedCount} scored` : ""}
            {(post.liveRaiderCount ?? 0) > 0 ? ` · ${post.liveRaiderCount} on this now` : ""}
            {(post.raiderCount ?? 0) > 0 ? ` · ${post.raiderCount} raider${post.raiderCount === 1 ? "" : "s"}` : ""}
          </p>
          {(post.liveRaiders?.length ?? 0) > 0 && (
            <p className="muted">
              Live: {post.liveRaiders?.map((raider) => raider.you ? "you" : (raider.displayName || shortAddress(raider.wallet))).join(" · ")}
            </p>
          )}
          <div className="row">
            <a className="btn" href={post.url} target="_blank" rel="noreferrer">Open on X</a>
            {dim ? (
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => void runShill({
                  communityId: getStoredCommunityId(),
                  postId: feed.focus!.postId
                }).then((result) => {
                  setStatus(result.ok
                    ? "Talk track copied. Reply to the focus tweet, then paste YOUR reply URL here."
                    : (result.error || "Could not claim this post."));
                  return load();
                })}
              >
                Shill @{feed.focus?.authorHandle}
              </button>
            ) : post.youShilled ? (
              <button className="btn secondary" disabled={busy} onClick={() => void shill(post, true)}>
                Reshill
              </button>
            ) : (
              <button className="btn secondary" disabled={busy} onClick={() => void shill(post)}>
                {focused ? "Shill this tweet" : "Shill this"}
              </button>
            )}
            {connected && !focused && (!feed.focus || feed.you?.canSteerFocus) && (
              <button className="btn secondary" disabled={busy} onClick={() => void focusRaid(post)}>
                Everyone here
              </button>
            )}
            {connected && focused && feed.you?.canSteerFocus && (
              <button className="btn secondary" disabled={busy} onClick={() => void stopFocus()}>
                Clear focus
              </button>
            )}
            {post.youShilled && <span className="badge ok">Already shilled</span>}
            {post.youProved && <span className="badge ok">Reply scored</span>}
            {post.missionId && (
              <Link href={`/app/missions/${post.missionId}`}>{focused ? "Other plays" : "Mission"}</Link>
            )}
          </div>
          {!dim && (
            <ProofPaste
              communityId={getStoredCommunityId()}
              postId={post.id}
              youShilled={Boolean(post.youShilled)}
              youProved={Boolean(post.youProved)}
              onStatus={setStatus}
            />
          )}
        </div>
        );
      })}
      {status && <p>{status}</p>}
    </main>
  );
}
