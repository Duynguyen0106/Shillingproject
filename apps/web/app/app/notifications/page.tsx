"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../../../lib/config";
import { authHeaders, getStoredToken } from "../../../lib/session";
import { getStoredCommunityId } from "../../../lib/community";
import ConnectWalletButton from "../../ConnectWalletButton";
import Link from "next/link";

type NotifKind = "achievement" | "proof_scored" | "alliance" | "announcement" | "season" | "quest" | "referral";

interface Notif {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  url?: string;
  read: boolean;
  createdAt: string;
}

const KIND_ICONS: Record<NotifKind, string> = {
  achievement:  "🏅",
  proof_scored: "✅",
  alliance:     "⚔️",
  announcement: "📢",
  season:       "🏆",
  quest:        "⚡",
  referral:     "🔗",
};

// We synthesise notifications client-side from existing API data
// since there's no separate notifications table yet.
async function fetchNotifications(communityId: string, headers: Record<string, string>): Promise<Notif[]> {
  const [me, achievements, announcements] = await Promise.all([
    fetch(`${API_BASE}/me?communityId=${communityId}`, { headers }).then((r) => r.ok ? r.json() : null) as Promise<any>,
    fetch(`${API_BASE}/me/achievements`, { headers }).then((r) => r.ok ? r.json() : []) as Promise<any[]>,
    fetch(`${API_BASE}/communities/${communityId}/announcements`).then((r) => r.ok ? r.json() : []) as Promise<any[]>,
  ]);

  const notifs: Notif[] = [];

  // Achievements
  for (const a of (achievements || [])) {
    notifs.push({
      id: `ach-${a.achievementId}`,
      kind: "achievement",
      title: `Achievement unlocked: ${a.achievement?.title || "Badge"}`,
      body: a.achievement?.description || "",
      read: true,
      createdAt: a.earnedAt,
    });
  }

  // Recent submissions (proof scored)
  for (const s of ((me?.submissions as any[]) || []).slice(0, 5)) {
    notifs.push({
      id: `sub-${s.id}`,
      kind: "proof_scored",
      title: `Proof scored: +${s.pointsAwarded} pts`,
      body: `${s.missionTitle} · ${s.taskTitle}`,
      url: s.proofUrl,
      read: true,
      createdAt: s.submittedAt || new Date().toISOString(),
    });
  }

  // Announcements
  for (const a of (announcements || []).slice(0, 3)) {
    notifs.push({
      id: `ann-${a.id}`,
      kind: "announcement",
      title: a.pinned ? "📌 Pinned announcement" : "Community announcement",
      body: a.text,
      read: true,
      createdAt: a.createdAt,
    });
  }

  // Sort newest first
  return notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const connected = Boolean(getStoredToken());
  const communityId = getStoredCommunityId();

  const load = useCallback(async () => {
    if (!connected || !communityId) { setLoading(false); return; }
    try {
      const data = await fetchNotifications(communityId, authHeaders());
      setNotifs(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [connected, communityId]);

  useEffect(() => { load(); }, [load]);

  if (!connected) return (
    <main className="container">
      <h1>Notifications</h1>
      <div className="card"><p className="muted">Connect wallet to see your notifications.</p><ConnectWalletButton /></div>
    </main>
  );

  return (
    <main className="container">
      <div className="kicker">Stay informed</div>
      <h1>Notifications</h1>

      {loading && <p className="muted">Loading…</p>}
      {!loading && notifs.length === 0 && (
        <div className="card">
          <p className="muted">No notifications yet. Complete missions, earn achievements, and participate in raids to see activity here.</p>
          <Link href="/app/feed">Open raid feed</Link>
        </div>
      )}

      <div className="notif-list">
        {notifs.map((n) => (
          <div key={n.id} className={`card notif-card notif-${n.kind}`}>
            <div className="notif-icon">{KIND_ICONS[n.kind] || "🔔"}</div>
            <div className="notif-body">
              <div className="notif-title">{n.title}</div>
              <div className="notif-text muted">{n.body}</div>
              <div className="notif-time muted">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
            {n.url && (
              <a href={n.url} target="_blank" rel="noreferrer" className="notif-link">View ↗</a>
            )}
          </div>
        ))}
      </div>

      <p style={{ marginTop: "1.5rem" }}><Link href="/app/me">← Back to My Ops</Link></p>
    </main>
  );
}
