"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../lib/config";
import { authHeaders } from "../lib/session";

type Achievement = {
  slug: string;
  title: string;
  description: string;
  icon?: string | null;
  earnedAt?: string;
};

export default function AchievementBadges({ earned }: { earned?: Achievement[] }) {
  if (!earned || earned.length === 0) return null;

  return (
    <div className="achievement-badges">
      <div className="kicker">Achievements</div>
      <div className="achievement-grid">
        {earned.map((ach) => (
          <div key={ach.slug} className="achievement-badge" title={ach.description}>
            <span className="achievement-icon">{ach.icon ?? "🎖️"}</span>
            <span className="achievement-title">{ach.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function useAchievements() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/me/achievements`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then(setAchievements)
      .catch(() => undefined);
  }, []);

  return achievements;
}
