export const FOCUS_RAID_MS = 2 * 60 * 60 * 1000;

export type FocusCaller = {
  wallet: string;
  displayName?: string | null;
};

export type FocusPost = {
  id: string;
  url: string;
  authorHandle: string;
  text?: string | null;
  kind?: string | null;
};

export type FocusState = {
  postId: string;
  url: string;
  authorHandle: string;
  text: string;
  kind?: string | null;
  at: string;
  until: string;
  by: { wallet: string; displayName: string | null } | null;
};

export function focusUntil(focusAt: Date | string, windowMs = FOCUS_RAID_MS): Date {
  return new Date(new Date(focusAt).getTime() + windowMs);
}

export function isFocusLive(
  input: { focusPostId?: string | null; focusAt?: Date | string | null },
  now = Date.now(),
  windowMs = FOCUS_RAID_MS
): boolean {
  if (!input.focusPostId || !input.focusAt) return false;
  return focusUntil(input.focusAt, windowMs).getTime() >= now;
}

export function focusChangeAllowed(input: {
  action: "set" | "clear";
  isLead: boolean;
  live: boolean;
  currentPostId?: string | null;
  nextPostId?: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (input.action === "clear") {
    if (!input.live) return { ok: true };
    if (!input.isLead) return { ok: false, error: "Only the CTO lead can clear the focus raid." };
    return { ok: true };
  }
  if (!input.live) return { ok: true };
  if (input.nextPostId && input.currentPostId === input.nextPostId) return { ok: true };
  if (!input.isLead) {
    return { ok: false, error: "Only the CTO lead can move the focus raid. Keep shilling the current tweet." };
  }
  return { ok: true };
}

export function serializeFocus(input: {
  focusPostId?: string | null;
  focusAt?: Date | string | null;
  post?: FocusPost | null;
  by?: FocusCaller | null;
}, now = Date.now(), windowMs = FOCUS_RAID_MS): FocusState | null {
  if (!isFocusLive(input, now, windowMs) || !input.post || !input.focusAt) return null;
  return {
    postId: input.post.id,
    url: input.post.url,
    authorHandle: input.post.authorHandle,
    text: input.post.text ?? "",
    kind: input.post.kind ?? null,
    at: new Date(input.focusAt).toISOString(),
    until: focusUntil(input.focusAt, windowMs).toISOString(),
    by: input.by ? { wallet: input.by.wallet, displayName: input.by.displayName ?? null } : null
  };
}
