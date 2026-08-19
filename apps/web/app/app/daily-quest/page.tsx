"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../../../lib/config";
import { authHeaders, getStoredToken } from "../../../lib/session";
import { getStoredCommunityId } from "../../../lib/community";
import ConnectWalletButton from "../../ConnectWalletButton";
import Link from "next/link";

interface Quest {
  id: string;
  date: string;
  questType: string;
  description: string;
  pointBonus: number;
  completed: boolean;
}

const QUEST_ICONS: Record<string, string> = {
  shill: "📣",
  proof: "✅",
  focus: "🎯",
  checkin: "📋"
};

export default function DailyQuestPage() {
  const [quest, setQuest] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const connected = Boolean(getStoredToken());
  const communityId = getStoredCommunityId();

  const load = useCallback(() => {
    if (!communityId) { setLoading(false); return; }
    fetch(`${API_BASE}/communities/${communityId}/daily-quest`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setQuest(d))
      .finally(() => setLoading(false));
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const complete = async () => {
    if (!communityId || !connected) return;
    setCompleting(true);
    const res = await fetch(`${API_BASE}/communities/${communityId}/daily-quest/complete`, {
      method: "POST",
      headers: authHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      setMsg(`🎉 Quest complete! +${data.pointsAwarded} pts earned.`);
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(e.error || "Failed to complete quest.");
    }
    setCompleting(false);
  };

  return (
    <main className="container">
      <div className="kicker">Daily grind</div>
      <h1>Daily Quest</h1>
      <p className="muted">Complete today's quest to earn bonus points. Resets at midnight UTC.</p>

      {loading && <p className="muted">Loading…</p>}

      {!loading && !quest && <div className="card"><p className="muted">No quest available for your community.</p></div>}

      {quest && (
        <div className={`card daily-quest-card ${quest.completed ? "completed" : ""}`}>
          <div className="dq-icon">{QUEST_ICONS[quest.questType] || "⚡"}</div>
          <div className="dq-body">
            <div className="dq-type">{(quest.questType || "").toUpperCase()} QUEST</div>
            <div className="dq-description">{quest.description}</div>
            <div className="dq-bonus">+{quest.pointBonus} pts bonus</div>
          </div>
          {quest.completed ? (
            <div className="dq-done">✅ Done for today</div>
          ) : connected ? (
            <button className="btn dq-btn" onClick={complete} disabled={completing}>
              {completing ? "Completing…" : "Mark complete"}
            </button>
          ) : (
            <ConnectWalletButton />
          )}
        </div>
      )}

      {msg && <p className="muted" style={{ marginTop: "0.75rem" }}>{msg}</p>}

      <p style={{ marginTop: "1.5rem" }}><Link href="/app/me">← Back to My Ops</Link></p>
    </main>
  );
}
