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
  if (details.startsWith("x-community:")) return "x-community";
  if (!details.startsWith("play:")) return null;
  return details.slice("play:".length).split(";")[0] as PlayId;
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
  if (id === "x-community") {
    const communityId = details?.slice("x-community:".length);
    return communityId ? `https://x.com/i/communities/${communityId}` : "https://x.com/i/communities/";
  }
  if (id === "dex-comment") return "https://dexscreener.com/";
  if (id === "share-telegram") return "https://t.me/";
  if (id === "discord-boost") return "https://discord.com/";
  return "https://x.com/example/status/1";
}
