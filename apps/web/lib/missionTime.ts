export function formatRemaining(remainingMs?: number | null): string {
  if (remainingMs == null) return "";
  if (remainingMs <= 0) return "Expired";
  const hours = Math.floor(remainingMs / 3_600_000);
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}
