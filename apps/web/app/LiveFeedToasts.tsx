"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../lib/config";
import { getStoredCommunityId } from "../lib/community";
import { compactCount, dispatchLivePost, type LiveFeedEvent, type LiveKol, type LivePost } from "../lib/liveFeed";
import { RAID_EVENT, runShill } from "../lib/shillAction";
import { getStoredWallet } from "../lib/session";
import { useConnectedWallet } from "../lib/useConnectedWallet";

type Toast = LiveFeedEvent & { toastId: string; youShilled?: boolean };

function kolFrom(event: LiveFeedEvent): LiveKol | null {
  return event.kol ?? event.post.kol ?? null;
}

export default function LiveFeedToasts() {
  const { connected } = useConnectedWallet();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [live, setLive] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState("");
  const seen = useRef(new Set<string>());
  const since = useRef<string | null>(null);
  const primed = useRef(false);
  const shilled = useRef(new Set<string>());

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
      const toast: Toast = {
        ...event,
        toastId: `${event.post.id}-${Date.now()}`,
        youShilled: shilled.current.has(event.post.id)
      };
      setToasts((current) => [toast, ...current].slice(0, 3));
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.toastId !== toast.toastId));
      }, 14_000);
    }

    async function pull(popup: boolean) {
      const communityId = getStoredCommunityId();
      const params = new URLSearchParams();
      if (since.current) params.set("since", since.current);
      const stored = getStoredWallet();
      if (stored) params.set("wallet", stored);
      const qs = params.toString();
      const res = await fetch(`${API_BASE}/communities/${communityId}/feed${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json() as { serverTime?: string; posts?: Array<LivePost & { kol?: LiveKol | null; youShilled?: boolean }> };
      if (body.serverTime && !since.current) since.current = body.serverTime;
      for (const post of body.posts ?? []) {
        if (post.youShilled) shilled.current.add(post.id);
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
      source.addEventListener("shill", (message) => {
        try {
          const event = JSON.parse((message as MessageEvent).data);
          window.dispatchEvent(new CustomEvent(RAID_EVENT, { detail: event }));
        } catch {
          /* ignore */
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
      shilled.current = new Set();
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

  async function shillToast(toast: Toast, reshill = false) {
    if (!connected) {
      setNote("Connect a wallet to shill.");
      return;
    }
    setBusyId(toast.post.id);
    const result = await runShill({ communityId: toast.communityId, postId: toast.post.id, reshill });
    setBusyId("");
    if (!result.ok) {
      setNote(result.error || "Shill failed.");
      return;
    }
    if (result.alreadyShilled && !reshill) {
      shilled.current.add(toast.post.id);
      setToasts((current) => current.map((item) => item.post.id === toast.post.id ? { ...item, youShilled: true } : item));
      setNote("You already shilled this. Reshill if you want another reply.");
      return;
    }
    shilled.current.add(toast.post.id);
    setToasts((current) => current.map((item) => item.post.id === toast.post.id ? { ...item, youShilled: true } : item));
    setNote("Talk track copied. Reply composer is open.");
  }

  return (
    <div className="live-toasts" aria-live="polite">
      {live && <span className="sr-only">Raid feed is live</span>}
      {note && <p className="live-toast-note">{note}</p>}
      {toasts.map((toast) => {
        const kol = kolFrom(toast);
        const already = toast.youShilled || shilled.current.has(toast.post.id);
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
                {already && <span className="badge ok">Already shilled</span>}
              </div>
              {kol && (
                <small>
                  {kol.displayName ? `${kol.displayName} · ` : ""}
                  {compactCount(kol.followers ?? toast.post.authorFollowers)} followers
                </small>
              )}
              <p>{toast.post.text.slice(0, 160)}</p>
              <div className="row">
                {already ? (
                  <button className="btn" disabled={busyId === toast.post.id} onClick={() => void shillToast(toast, true)}>
                    Reshill
                  </button>
                ) : (
                  <button className="btn" disabled={busyId === toast.post.id} onClick={() => void shillToast(toast)}>
                    Shill this
                  </button>
                )}
                <Link className="btn secondary" href="/app/feed">Feed</Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
