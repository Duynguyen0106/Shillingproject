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

export function isRaidReplyPlay(details?: string | null): boolean {
  const playId = playIdFromDetails(details);
  return Boolean(playId && RAID_REPLY_PLAYS.has(playId));
}

export function taskNeedsRaidReplyProof(details?: string | null): boolean {
  if (!isRaidReplyPlay(details)) return false;
  return Boolean(parseXStatusUrl(targetUrlFromDetails(details) || ""));
}

export function pickRaidReplyTask<T extends { id: string; details?: string | null }>(
  tasks: T[],
  targetUrl: string,
  submittedTaskIds: Iterable<string> = []
): T | null {
  const done = new Set(submittedTaskIds);
  const open = tasks.filter((task) => !done.has(task.id));
  const target = parseXStatusUrl(targetUrl);
  const raidTasks = open.filter((task) => isRaidReplyPlay(task.details));
  if (target) {
    const matched = raidTasks.find((task) => parseXStatusUrl(targetUrlFromDetails(task.details) || "")?.id === target.id);
    if (matched) return matched;
    return raidTasks.find((task) => playIdFromDetails(task.details) === "reply-narrative" && !targetUrlFromDetails(task.details)) ?? null;
  }
  return raidTasks.find((task) => playIdFromDetails(task.details) === "reply-narrative") ?? raidTasks[0] ?? null;
}

export function raidReplyAlreadyScored<T extends { id: string; details?: string | null }>(
  tasks: T[],
  targetUrl: string,
  submittedTaskIds: Iterable<string>
): boolean {
  const done = new Set(submittedTaskIds);
  const want = parseXStatusUrl(targetUrl)?.id;
  return tasks.some((task) => {
    if (!done.has(task.id) || !isRaidReplyPlay(task.details)) return false;
    const got = parseXStatusUrl(targetUrlFromDetails(task.details) || "")?.id;
    if (want && got) return got === want;
    return !got && playIdFromDetails(task.details) === "reply-narrative";
  });
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

export type ProofRow = {
  userId: string;
  submittedAt?: Date | string;
  createdAt?: Date | string;
  task: { missionId: string; details?: string | null };
  user?: { wallet: string; displayName?: string | null } | null;
};

export function attachProofState<T extends { id: string; missionId?: string | null }>(
  posts: T[],
  rows: ProofRow[],
  viewerUserId?: string | null,
  now = Date.now()
) {
  const raidRows = rows.filter((row) => isRaidReplyPlay(row.task.details));
  const byMission = new Map<string, ProofRow[]>();
  for (const row of raidRows) {
    const list = byMission.get(row.task.missionId) ?? [];
    list.push(row);
    byMission.set(row.task.missionId, list);
  }
  return posts.map((post) => {
    const list = post.missionId ? byMission.get(post.missionId) ?? [] : [];
    const unique = new Set(list.map((row) => row.userId));
    const liveIds = liveRaiderIds(
      list.map((row) => ({ userId: row.userId, createdAt: row.submittedAt ?? row.createdAt ?? new Date().toISOString() })),
      now
    );
    const yours = viewerUserId ? list.filter((row) => row.userId === viewerUserId) : [];
    return {
      ...post,
      provedCount: unique.size,
      liveProvedCount: liveIds.length,
      youProved: yours.length > 0,
      liveProved: liveIds.slice(0, 6).map((userId) => {
        const row = list.find((item) => item.userId === userId);
        return {
          wallet: row?.user?.wallet ?? "",
          displayName: row?.user?.displayName ?? null,
          you: Boolean(viewerUserId && userId === viewerUserId)
        };
      })
    };
  });
}
