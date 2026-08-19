export type PlayId =
  | "reply-narrative"
  | "quote-signal"
  | "x-community"
  | "share-telegram"
  | "discord-boost"
  | "dex-comment"
  | "invite-raider"
  | "daily-pulse"
  | "fud-ratio";

export type PlayKind = "standing" | "triggered";

export function playIdFromDetails(details?: string | null): PlayId | null {
  if (!details) return null;
  const head = details.split("\n")[0];
  if (head.startsWith("x-community:")) return "x-community";
  if (!head.startsWith("play:")) return null;
  return head.slice("play:".length).split(";")[0] as PlayId;
}

export function targetUrlFromDetails(details?: string | null): string | null {
  if (!details) return null;
  const head = details.split("\n")[0];
  if (head.startsWith("x-community:")) {
    const id = head.slice("x-community:".length);
    return /^\d+$/.test(id) ? `https://x.com/i/communities/${id}` : null;
  }
  const line = details.split("\n").find((entry) => entry.startsWith("target:"));
  const url = line?.slice("target:".length).trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function playMeta(details?: string | null): { id: PlayId | null; kind: PlayKind; label: string } {
  const id = playIdFromDetails(details);
  const triggered = id === "quote-signal" || id === "fud-ratio" || id === "discord-boost";
  const labels: Record<PlayId, string> = {
    "reply-narrative": "Standing",
    "quote-signal": "Triggered",
    "x-community": "X Community",
    "share-telegram": "Standing",
    "discord-boost": "Triggered",
    "dex-comment": "Standing",
    "invite-raider": "Standing",
    "daily-pulse": "Daily pulse",
    "fud-ratio": "Triggered"
  };
  return {
    id,
    kind: triggered ? "triggered" : "standing",
    label: id ? labels[id] : "Play"
  };
}

export function proofPlaceholder(details?: string | null): string {
  const id = playIdFromDetails(details);
  if (id === "reply-narrative" || id === "quote-signal" || id === "fud-ratio") {
    return "https://x.com/yourhandle/status/";
  }
  const target = targetUrlFromDetails(details);
  if (target) return target;
  if (id === "x-community") return "https://x.com/i/communities/";
  if (id === "dex-comment") return "https://dexscreener.com/";
  if (id === "share-telegram") return "https://t.me/";
  if (id === "discord-boost") return "https://discord.com/";
  return "https://x.com/example/status/1";
}

export function isRaidReplyPlay(details?: string | null): boolean {
  const id = playIdFromDetails(details);
  return id === "reply-narrative" || id === "quote-signal" || id === "fud-ratio";
}

export function targetCtaLabel(details?: string | null): string {
  const id = playIdFromDetails(details);
  if (id === "x-community") return "Open X Community";
  if (id === "dex-comment") return "Open DexScreener pair";
  if (id === "share-telegram") return "Open Telegram";
  if (id === "discord-boost") return "Open Discord";
  return "Open this post";
}
