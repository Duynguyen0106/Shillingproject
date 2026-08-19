import { API_BASE } from "./config";
import { authHeaders, getStoredWallet, notifyOps } from "./session";

export const SHILL_EVENT = "shillops-shill";
export const RAID_EVENT = "shillops-raid";
export const FOCUS_EVENT = "shillops-focus";
export const PROOF_EVENT = "shillops-proof";

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
  missionId?: string | null;
  youShilled?: boolean;
  youProved?: boolean;
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
  missionId?: string | null;
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
  if (!res.ok) {
    if (body.focus) dispatchFocus(input.communityId, body.focus);
    return { ok: false, error: body.error || "Could not claim this post.", focus: body.focus ?? null, missionId: body.missionId ?? null };
  }
  const focus = body.focus
    ? { ...body.focus, youShilled: body.focus.postId === input.postId ? true : body.focus.youShilled }
    : null;
  if (focus) dispatchFocus(input.communityId, focus);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SHILL_EVENT, {
      detail: { postId: input.postId, reshill: Boolean(input.reshill), kit: body.kit, missionId: body.missionId, alreadyShilled: Boolean(body.alreadyShilled) }
    }));
  }
  if (body.alreadyShilled && !input.reshill) {
    return { ok: true, alreadyShilled: true, kit: body.kit, url: body.url, youShillCount: body.youShillCount, focus, missionId: body.missionId ?? null };
  }
  await applyShillKit(body.kit, body.url);
  notifyOps();
  return {
    ok: true,
    alreadyShilled: Boolean(body.alreadyShilled),
    reshill: Boolean(body.reshill),
    kit: body.kit,
    url: body.url,
    liveRaiderCount: body.liveRaiderCount,
    youShillCount: body.youShillCount,
    focus,
    missionId: body.missionId ?? null
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

export type ProofResult = {
  ok: boolean;
  error?: string;
  alreadyProved?: boolean;
  pointsAwarded?: number;
  missionId?: string | null;
};

export function dispatchProof(communityId: string, postId: string, pointsAwarded?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROOF_EVENT, { detail: { communityId, postId, pointsAwarded } }));
}

export async function runProof(input: {
  communityId: string;
  postId: string;
  proofUrl: string;
  proofText?: string;
}): Promise<ProofResult> {
  const wallet = getStoredWallet();
  if (!wallet) return { ok: false, error: "Connect a wallet to score this reply." };
  const res = await fetch(`${API_BASE}/communities/${input.communityId}/feed/${input.postId}/proof`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ wallet, proofUrl: input.proofUrl, proofText: input.proofText })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body.alreadyProved) dispatchProof(input.communityId, input.postId, body.pointsAwarded);
    return {
      ok: false,
      error: body.error || "Could not score this reply.",
      alreadyProved: Boolean(body.alreadyProved),
      missionId: body.missionId ?? null
    };
  }
  notifyOps();
  dispatchProof(input.communityId, input.postId, body.pointsAwarded);
  return {
    ok: true,
    alreadyProved: Boolean(body.alreadyProved),
    pointsAwarded: body.pointsAwarded,
    missionId: body.missionId ?? null
  };
}
