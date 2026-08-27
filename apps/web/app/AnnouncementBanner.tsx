"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../lib/config";

type Announcement = {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: string;
  author?: { wallet: string; displayName?: string | null } | null;
};

export default function AnnouncementBanner({ communityId }: { communityId: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!communityId) return;
    fetch(`${API_BASE}/communities/${communityId}/announcements`)
      .then((r) => r.ok ? r.json() : [])
      .then(setAnnouncements)
      .catch(() => undefined);
  }, [communityId]);

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="announcement-stack">
      {visible.map((ann) => (
        <div key={ann.id} className={`announcement-banner${ann.pinned ? " pinned" : ""}`}>
          <span className="kicker" style={{ marginBottom: 0 }}>📢</span>
          <span style={{ flex: 1 }}>{ann.text}</span>
          <button
            className="btn secondary small"
            onClick={() => setDismissed((prev) => new Set([...prev, ann.id]))}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
