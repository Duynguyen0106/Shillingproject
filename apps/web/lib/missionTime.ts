export function formatRemaining(remainingMs?: number | null): string {
  if (remainingMs == null) return "";
  if (remainingMs <= 0) return "Expired";
  const hours = Math.floor(remainingMs / 3_600_000);
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return "under a minute left";
}

export function remainingUntil(until?: string | null, now = Date.now()): number | null {
  if (!until) return null;
  const ms = new Date(until).getTime() - now;
  return Number.isNaN(ms) ? null : Math.max(0, ms);
}
