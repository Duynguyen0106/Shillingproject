"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../lib/config";
import { getStoredCommunityId } from "../lib/community";
import { compactCount, dispatchLivePost, type LiveFeedEvent, type LiveKol, type LivePost } from "../lib/liveFeed";

type Toast = LiveFeedEvent & { toastId: string };

function kolFrom(event: LiveFeedEvent): LiveKol | null {
  return event.kol ?? event.post.kol ?? null;
}

export default function LiveFeedToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [live, setLive] = useState(false);
  const seen = useRef(new Set<string>());
  const since = useRef<string | null>(null);
  const primed = useRef(false);

  useEffect(() => {
    let closed = false;
    let source: EventSource | null = null;
    let pollTimer = 0;

    function pushEvent(event: LiveFeedEvent, popup: boolean) {
      if (closed || event.communityId !== getStoredCommunityId() || seen.current.has(event.post.id)) return;
      seen.current.add(event.post.id);
      if (event.post.createdAt && (!since.current || event.post.createdAt > since.current)) {
        since.current = event.post.createdAt;
      }
      if (!popup) return;
      dispatchLivePost(event);
      const toast: Toast = { ...event, toastId: `${event.post.id}-${Date.now()}` };
      setToasts((current) => [toast, ...current].slice(0, 3));
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.toastId !== toast.toastId));
      }, 12_000);
    }

    async function pull(popup: boolean) {
      const communityId = getStoredCommunityId();
      const params = new URLSearchParams();
      if (since.current) params.set("since", since.current);
      const qs = params.toString();
      const res = await fetch(`${API_BASE}/communities/${communityId}/feed${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json() as { serverTime?: string; posts?: Array<LivePost & { kol?: LiveKol | null }> };
      if (body.serverTime && !since.current) since.current = body.serverTime;
      for (const post of body.posts ?? []) {
        pushEvent({
          type: "post",
          communityId,
          post,
          kol: post.kol ?? null
        }, popup && primed.current);
      }
      if (!primed.current) {
        primed.current = true;
        if (body.serverTime) since.current = body.serverTime;
      }
    }

    function connect() {
      const communityId = getStoredCommunityId();
      source?.close();
      try {
        source = new EventSource(`${API_BASE}/communities/${communityId}/feed/live`);
      } catch {
        setLive(false);
        return;
      }
      source.addEventListener("hello", () => setLive(true));
      source.addEventListener("post", (message) => {
        try {
          pushEvent(JSON.parse((message as MessageEvent).data) as LiveFeedEvent, true);
        } catch {
          /* ignore bad payloads */
        }
      });
      source.onerror = () => setLive(false);
    }

    void pull(false).then(() => {
      if (closed) return;
      connect();
      pollTimer = window.setInterval(() => void pull(true), 8_000);
    });
    const onCommunity = () => {
      seen.current = new Set();
      since.current = null;
      primed.current = false;
      void pull(false);
      connect();
    };
    window.addEventListener("shillops-community", onCommunity);
    return () => {
      closed = true;
      source?.close();
      window.clearInterval(pollTimer);
      window.removeEventListener("shillops-community", onCommunity);
    };
  }, []);

  return (
    <div className="live-toasts" aria-live="polite">
      {live && <span className="sr-only">Raid feed is live</span>}
      {toasts.map((toast) => {
        const kol = kolFrom(toast);
        return (
          <article key={toast.toastId} className="live-toast">
            {kol?.profileImageUrl
              ? <img src={kol.profileImageUrl} alt="" className="kol-avatar" />
              : <span className="kol-avatar fallback">@{(toast.post.authorHandle || "?").slice(0, 1)}</span>}
            <div>
              <div className="row">
                <strong>@{toast.post.authorHandle}</strong>
                {kol?.verified && <span className="badge ok">Verified</span>}
                <span className={`badge ${toast.post.kind === "MENTION" ? "high" : "ok"}`}>
                  {toast.post.kind === "MENTION" ? "Mention" : "New KOL post"}
                </span>
              </div>
              {kol && (
                <small>
                  {kol.displayName ? `${kol.displayName} · ` : ""}
                  {compactCount(kol.followers ?? toast.post.authorFollowers)} followers
                </small>
              )}
              <p>{toast.post.text.slice(0, 160)}</p>
              <div className="row">
                <Link className="btn" href="/app/feed">Open in feed</Link>
                <a className="btn secondary" href={toast.post.url} target="_blank" rel="noreferrer">Open on X</a>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
