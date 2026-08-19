import { API_BASE } from "./config";
import { authHeaders, getStoredWallet, notifyOps } from "./session";

export const SHILL_EVENT = "shillops-shill";
export const RAID_EVENT = "shillops-raid";
export const FOCUS_EVENT = "shillops-focus";

export type ShillKit = {
  copy: string;
  talkTrack?: string | null;
  ticker?: string;
  contractAddress?: string | null;
  intentUrl: string;
  url: string;
};

export type FocusRaid = {
  postId: string;
  url: string;
  authorHandle: string;
  text: string;
  kind?: string | null;
  at: string;
  until: string;
  by: { wallet: string; displayName: string | null } | null;
};

export type ShillResult = {
  ok: boolean;
  alreadyShilled?: boolean;
  reshill?: boolean;
  error?: string;
  kit?: ShillKit;
  url?: string;
  liveRaiderCount?: number;
  youShillCount?: number;
  focus?: FocusRaid | null;
};

export function dispatchFocus(communityId: string, focus: FocusRaid | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { communityId, focus } }));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function applyShillKit(kit?: ShillKit | null, fallbackUrl?: string) {
  if (kit?.copy) await copyText(kit.copy);
  const openUrl = kit?.intentUrl || kit?.url || fallbackUrl;
  if (openUrl) window.open(openUrl, "_blank", "noopener,noreferrer");
}

export async function runShill(input: { communityId: string; postId: string; reshill?: boolean }): Promise<ShillResult> {
  const wallet = getStoredWallet();
  if (!wallet) return { ok: false, error: "Connect a wallet to claim the raid." };
  const res = await fetch(`${API_BASE}/communities/${input.communityId}/feed/${input.postId}/shill`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ wallet, reshill: Boolean(input.reshill) })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error || "Could not claim this post." };
  if (body.focus) dispatchFocus(input.communityId, body.focus);
  if (body.alreadyShilled && !input.reshill) {
    return { ok: true, alreadyShilled: true, kit: body.kit, url: body.url, youShillCount: body.youShillCount, focus: body.focus ?? null };
  }
  await applyShillKit(body.kit, body.url);
  notifyOps();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SHILL_EVENT, { detail: { postId: input.postId, reshill: Boolean(input.reshill), kit: body.kit } }));
  }
  return {
    ok: true,
    alreadyShilled: Boolean(body.alreadyShilled),
    reshill: Boolean(body.reshill),
    kit: body.kit,
    url: body.url,
    liveRaiderCount: body.liveRaiderCount,
    youShillCount: body.youShillCount,
    focus: body.focus ?? null
  };
}

export async function runFocus(input: { communityId: string; postId: string }): Promise<{ ok: boolean; error?: string; focus?: FocusRaid | null }> {
  const wallet = getStoredWallet();
  if (!wallet) return { ok: false, error: "Connect a wallet to call the raid." };
  const res = await fetch(`${API_BASE}/communities/${input.communityId}/feed/${input.postId}/focus`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ wallet })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error || "Could not call the focus raid." };
  dispatchFocus(input.communityId, body.focus ?? null);
  notifyOps();
  return { ok: true, focus: body.focus ?? null };
}

export async function clearFocus(communityId: string): Promise<{ ok: boolean; error?: string }> {
  const wallet = getStoredWallet();
  if (!wallet) return { ok: false, error: "Connect a wallet first." };
  const res = await fetch(`${API_BASE}/communities/${communityId}/feed/focus/clear`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ wallet })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error || "Could not clear the focus raid." };
  dispatchFocus(communityId, null);
  return { ok: true };
}
