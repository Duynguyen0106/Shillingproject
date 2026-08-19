"use client";

import { useEffect, useState } from "react";
import { formatRemaining, remainingUntil } from "../lib/missionTime";

export default function RaidScoreboard({
  provedCount,
  liveRaiderCount,
  until,
  compact = false
}: {
  provedCount?: number;
  liveRaiderCount?: number;
  until?: string | null;
  compact?: boolean;
}) {
  const [left, setLeft] = useState(() => remainingUntil(until));

  useEffect(() => {
    setLeft(remainingUntil(until));
    if (!until) return;
    const timer = window.setInterval(() => setLeft(remainingUntil(until)), 30_000);
    return () => window.clearInterval(timer);
  }, [until]);

  const scored = provedCount ?? 0;
  const live = liveRaiderCount ?? 0;
  const time = formatRemaining(left);
  if (scored === 0 && live === 0 && !time) return null;
  const text = [
    `${scored} scored`,
    live > 0 ? `${live} on this now` : null,
    time || null
  ].filter(Boolean).join(" · ");
  return compact ? <span className="muted">{text}</span> : <p className="muted">{text}</p>;
}
