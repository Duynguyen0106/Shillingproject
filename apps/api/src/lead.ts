export const LEAD_INACTIVE_MS = 48 * 60 * 60 * 1000;

export type LeadReason = "occupied" | "resigned" | "inactive";

export type LeadMember = {
  role: string;
  lastActiveAt: Date | string;
  user: { wallet: string; displayName: string | null };
};

export type LeadSeat = {
  vacant: boolean;
  reason: LeadReason;
  wallet: string | null;
  displayName: string | null;
  lastActiveAt: string | null;
  remainingMs: number | null;
  inactiveAfterMs: number;
};

export function evaluateLeadSeat(lead: LeadMember | null, now = Date.now()): LeadSeat {
  if (!lead || lead.role !== "lead") {
    return {
      vacant: true,
      reason: "resigned",
      wallet: lead?.user.wallet ?? null,
      displayName: lead?.user.displayName ?? null,
      lastActiveAt: lead ? new Date(lead.lastActiveAt).toISOString() : null,
      remainingMs: null,
      inactiveAfterMs: LEAD_INACTIVE_MS
    };
  }
  const lastActiveAt = new Date(lead.lastActiveAt);
  const remainingMs = lastActiveAt.getTime() + LEAD_INACTIVE_MS - now;
  if (remainingMs <= 0) {
    return {
      vacant: true,
      reason: "inactive",
      wallet: lead.user.wallet,
      displayName: lead.user.displayName,
      lastActiveAt: lastActiveAt.toISOString(),
      remainingMs: 0,
      inactiveAfterMs: LEAD_INACTIVE_MS
    };
  }
  return {
    vacant: false,
    reason: "occupied",
    wallet: lead.user.wallet,
    displayName: lead.user.displayName,
    lastActiveAt: lastActiveAt.toISOString(),
    remainingMs,
    inactiveAfterMs: LEAD_INACTIVE_MS
  };
}

export function sameWallet(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
