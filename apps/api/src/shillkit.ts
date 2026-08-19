import { parseXStatusUrl } from "./xfeed";
import { playIdFromDetails, targetUrlFromDetails } from "./playbook";

export const LIVE_RAID_MS = 15 * 60 * 1000;

const RAID_REPLY_PLAYS = new Set(["reply-narrative", "quote-signal", "fud-ratio"]);

export type ShillKit = {
  copy: string;
  talkTrack: string | null;
  ticker: string;
  contractAddress: string | null;
  intentUrl: string;
  url: string;
};

export function buildShillCopy(input: {
  ticker?: string | null;
  contractAddress?: string | null;
  pinText?: string | null;
}): string {
  const ticker = (input.ticker || "").replace(/^\$/, "").trim();
  const cashtag = ticker ? `$${ticker}` : "";
  const ca = input.contractAddress?.trim() || "";
  const pin = input.pinText?.trim() || "";
  const parts: string[] = [];
  if (pin) parts.push(pin);
  else if (cashtag) parts.push(`${cashtag} don't fade`);
  if (cashtag && pin && !pin.toUpperCase().includes(cashtag.toUpperCase())) parts.push(cashtag);
  if (ca && !pin.toLowerCase().includes(ca.toLowerCase())) parts.push(ca);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 260);
}

export function xReplyIntentUrl(targetUrl: string, text: string): string {
  const parsed = parseXStatusUrl(targetUrl);
  const params = new URLSearchParams();
  if (text) params.set("text", text);
  if (parsed?.id) params.set("in_reply_to", parsed.id);
  else if (targetUrl) params.set("url", targetUrl);
  return `https://x.com/intent/tweet?${params.toString()}`;
}

export function buildShillKit(input: {
  ticker?: string | null;
  contractAddress?: string | null;
  pinText?: string | null;
  url: string;
}): ShillKit {
  const copy = buildShillCopy(input);
  return {
    copy,
    talkTrack: input.pinText?.trim() || null,
    ticker: (input.ticker || "").replace(/^\$/, ""),
    contractAddress: input.contractAddress ?? null,
    intentUrl: xReplyIntentUrl(input.url, copy),
    url: input.url
  };
}

export function liveRaiderIds(
  rows: Array<{ userId: string; createdAt: Date | string }>,
  now = Date.now(),
  windowMs = LIVE_RAID_MS
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (now - new Date(row.createdAt).getTime() > windowMs) continue;
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    ids.push(row.userId);
  }
  return ids;
}

export function taskNeedsRaidReplyProof(details?: string | null): boolean {
  const playId = playIdFromDetails(details);
  if (!playId || !RAID_REPLY_PLAYS.has(playId)) return false;
  return Boolean(parseXStatusUrl(targetUrlFromDetails(details) || ""));
}

export function proofIsReplyToRaidTarget(proofUrl: string, details?: string | null): { ok: true } | { ok: false; error: string } {
  if (!taskNeedsRaidReplyProof(details)) return { ok: true };
  const target = parseXStatusUrl(targetUrlFromDetails(details) || "");
  const proof = parseXStatusUrl(proofUrl);
  if (!target) return { ok: true };
  if (!proof) {
    return { ok: false, error: "Paste the X status URL of YOUR reply or quote, not a profile or Community link." };
  }
  if (proof.id === target.id) {
    return { ok: false, error: "That is the KOL post. Paste the status URL of YOUR reply or quote on that tweet." };
  }
  return { ok: true };
}
