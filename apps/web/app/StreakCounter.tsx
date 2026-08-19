"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../lib/config";
import { authHeaders } from "../lib/session";

type StreakData = {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate?: string | null;
};

export default function StreakCounter() {
  const [streak, setStreak] = useState<StreakData | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/me/streak`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then(setStreak)
      .catch(() => undefined);
  }, []);

  if (!streak || streak.currentStreak === 0) return null;

  const emoji = streak.currentStreak >= 30 ? "💎" : streak.currentStreak >= 7 ? "🏆" : streak.currentStreak >= 3 ? "🔥" : "⚡";

  return (
    <div className="streak-counter">
      <span className="streak-icon">{emoji}</span>
      <div>
        <strong>{streak.currentStreak}-day streak</strong>
        {streak.longestStreak > streak.currentStreak && (
          <span className="muted"> · best: {streak.longestStreak}</span>
        )}
      </div>
    </div>
  );
}
