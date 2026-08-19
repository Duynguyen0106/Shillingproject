"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../lib/config";
import { getStoredCommunityId } from "../lib/community";
import { compactCount, dispatchLivePost, type LiveFeedEvent, type LiveKol, type LivePost } from "../lib/liveFeed";
import { FOCUS_EVENT, PROOF_EVENT, RAID_EVENT, dispatchFocus, runShill, type FocusRaid } from "../lib/shillAction";
import { getStoredWallet } from "../lib/session";
import { useConnectedWallet } from "../lib/useConnectedWallet";
import ProofPaste from "./ProofPaste";

type Toast = LiveFeedEvent & { toastId: string; youShilled?: boolean; youProved?: boolean; focused?: boolean };

function kolFrom(event: LiveFeedEvent): LiveKol | null {
  return event.kol ?? event.post.kol ?? null;
}

function toastFromFocus(communityId: string, focus: FocusRaid, youShilled: boolean, youProved: boolean): Toast {
  return {
    type: "post",
    communityId,
    toastId: `focus-${focus.postId}`,
    youShilled,
    youProved,
    focused: true,
    kol: null,
    post: {
      id: focus.postId,
      kind: (focus.kind as LivePost["kind"]) || "KOL_POST",
      url: focus.url,
      authorHandle: focus.authorHandle,
      text: focus.text,
      postedAt: focus.at,
      createdAt: focus.at
    }
  };
}

export default function LiveFeedToasts() {
  const { connected } = useConnectedWallet();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [focus, setFocus] = useState<FocusRaid | null>(null);
  const [live, setLive] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState("");
  const seen = useRef(new Set<string>());
  const since = useRef<string | null>(null);
  const primed = useRef(false);
  const shilled = useRef(new Set<string>());
  const proved = useRef(new Set<string>());
  const focusId = useRef<string | null>(null);

  useEffect(() => {
    let closed = false;
    let source: EventSource | null = null;
    let pollTimer = 0;

    function applyFocus(next: FocusRaid | null, emit = true) {
      const nextId = next?.postId ?? null;
      const changed = nextId !== focusId.current;
      focusId.current = nextId;
      setFocus(next);
      if (!next) {
        setToasts((current) => current.filter((item) => !item.focused));
        if (emit && changed) dispatchFocus(getStoredCommunityId(), null);
        return;
      }
      const sticky = toastFromFocus(
        getStoredCommunityId(),
        next,
        shilled.current.has(next.postId) || Boolean(next.youShilled),
        proved.current.has(next.postId) || Boolean(next.youProved)
      );
      setToasts((current) => [sticky, ...current.filter((item) => !item.focused && item.post.id !== next.postId)].slice(0, 3));
      if (emit && changed) dispatchFocus(getStoredCommunityId(), next);
    }

    function pushEvent(event: LiveFeedEvent, popup: boolean) {
      if (closed || event.communityId !== getStoredCommunityId() || seen.current.has(event.post.id)) return;
      seen.current.add(event.post.id);
      if (event.post.createdAt && (!since.current || event.post.createdAt > since.current)) {
        since.current = event.post.createdAt;
      }
      dispatchLivePost(event);
      if (!popup) return;
      if (focusId.current && event.post.id !== focusId.current) return;
      const toast: Toast = {
        ...event,
        toastId: `${event.post.id}-${Date.now()}`,
        youShilled: shilled.current.has(event.post.id),
        youProved: proved.current.has(event.post.id),
        focused: focusId.current === event.post.id
      };
      setToasts((current) => [toast, ...current.filter((item) => item.focused)].slice(0, 3));
      if (toast.focused) return;
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
      const body = await res.json() as {
        serverTime?: string;
        focus?: FocusRaid | null;
        posts?: Array<LivePost & { kol?: LiveKol | null; youShilled?: boolean; youProved?: boolean }>;
      };
      if (body.focus?.youShilled) shilled.current.add(body.focus.postId);
      if (body.focus?.youProved) proved.current.add(body.focus.postId);
      if ((body.focus?.postId ?? null) !== focusId.current) applyFocus(body.focus ?? null);
      if (body.serverTime && !since.current) since.current = body.serverTime;
      for (const post of body.posts ?? []) {
        if (post.youShilled) shilled.current.add(post.id);
        if (post.youProved) proved.current.add(post.id);
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
      source.addEventListener("focus", (message) => {
        try {
          const event = JSON.parse((message as MessageEvent).data) as { communityId?: string; focus?: FocusRaid | null };
          if (event.communityId && event.communityId !== getStoredCommunityId()) return;
          applyFocus(event.focus ?? null);
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
      proved.current = new Set();
      applyFocus(null);
      void pull(false);
      connect();
    };
    const onFocus = (message: Event) => {
      const event = (message as CustomEvent<{ communityId?: string; focus?: FocusRaid | null }>).detail;
      if (event?.communityId && event.communityId !== getStoredCommunityId()) return;
      applyFocus(event?.focus ?? null, false);
    };
    window.addEventListener("shillops-community", onCommunity);
    window.addEventListener(FOCUS_EVENT, onFocus);
    const onProof = (message: Event) => {
      const event = (message as CustomEvent<{ communityId?: string; postId?: string }>).detail;
      if (event?.communityId && event.communityId !== getStoredCommunityId()) return;
      if (!event?.postId) return;
      proved.current.add(event.postId);
      setToasts((current) => current.map((item) => item.post.id === event.postId ? { ...item, youProved: true } : item));
    };
    window.addEventListener(PROOF_EVENT, onProof);
    return () => {
      closed = true;
      source?.close();
      window.clearInterval(pollTimer);
      window.removeEventListener("shillops-community", onCommunity);
      window.removeEventListener(FOCUS_EVENT, onFocus);
      window.removeEventListener(PROOF_EVENT, onProof);
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
      setNote("You already shilled this. Paste YOUR reply URL, or reshill for another hit.");
      return;
    }
    shilled.current.add(toast.post.id);
    setToasts((current) => current.map((item) => item.post.id === toast.post.id ? { ...item, youShilled: true } : item));
    setNote(toast.focused || focus?.postId === toast.post.id
      ? "Everyone is on this tweet. Talk track copied — reply here, then paste YOUR reply URL."
      : "Talk track copied. Reply composer is open.");
  }

  return (
    <div className="live-toasts" aria-live="polite">
      {live && <span className="sr-only">Raid feed is live</span>}
      {note && <p className="live-toast-note">{note}</p>}
      {toasts.map((toast) => {
        const kol = kolFrom(toast);
        const already = toast.youShilled || shilled.current.has(toast.post.id);
        const scored = toast.youProved || proved.current.has(toast.post.id);
        const focused = Boolean(toast.focused || (focus && focus.postId === toast.post.id));
        return (
          <article key={toast.toastId} className={`live-toast${focused ? " focus" : ""}`}>
            {kol?.profileImageUrl
              ? <img src={kol.profileImageUrl} alt="" className="kol-avatar" />
              : <span className="kol-avatar fallback">@{(toast.post.authorHandle || "?").slice(0, 1)}</span>}
            <div>
              <div className="row">
                <strong>@{toast.post.authorHandle}</strong>
                {kol?.verified && <span className="badge ok">Verified</span>}
                <span className={`badge ${focused ? "high" : toast.post.kind === "MENTION" ? "high" : "ok"}`}>
                  {focused ? "Everyone here" : toast.post.kind === "MENTION" ? "Mention" : "New KOL post"}
                </span>
                {already && <span className="badge ok">Already shilled</span>}
                {scored && <span className="badge ok">Reply scored</span>}
              </div>
              {focused && <small>Reply this tweet — then paste YOUR status URL here, not the KOL post.</small>}
              {kol && !focused && (
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
                    {focused ? "Shill this tweet" : "Shill this"}
                  </button>
                )}
                <Link className="btn secondary" href="/app/feed">Feed</Link>
              </div>
              {already && (
                <ProofPaste
                  compact
                  communityId={toast.communityId}
                  postId={toast.post.id}
                  youShilled
                  youProved={scored}
                  onStatus={setNote}
                />
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
