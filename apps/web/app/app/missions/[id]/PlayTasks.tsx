"use client";

import { useEffect, useState } from "react";
import SubmissionForm from "./SubmissionForm";
import { API_BASE } from "../../../../lib/config";
import { playMeta, targetCtaLabel, targetUrlFromDetails } from "../../../../lib/playbook";
import { authHeaders } from "../../../../lib/session";
import { useConnectedWallet } from "../../../../lib/useConnectedWallet";

type Submission = {
  id: string;
  proofUrl: string;
  pointsAwarded: number;
  user?: { wallet: string; displayName?: string | null };
};

export type PlayTask = {
  id: string;
  title: string;
  details?: string | null;
  actionType: string;
  platform: string;
  basePoints: number;
  submissions?: Submission[];
};

type NextPlay = {
  taskId: string;
  taskTitle: string;
  playId?: string | null;
} | null;

export default function PlayTasks({
  missionId,
  tasks,
  closed
}: {
  missionId: string;
  tasks: PlayTask[];
  closed: boolean;
}) {
  const { wallet } = useConnectedWallet();
  const [nextPlay, setNextPlay] = useState<NextPlay>(null);

  useEffect(() => {
    if (!wallet) {
      setNextPlay(null);
      return;
    }
    const load = async () => {
      const res = await fetch(`${API_BASE}/missions/${missionId}?wallet=${encodeURIComponent(wallet)}`, {
        headers: authHeaders(),
        cache: "no-store"
      });
      if (!res.ok) return;
      const body = (await res.json()) as { nextPlay?: NextPlay };
      setNextPlay(body.nextPlay ?? null);
    };
    void load();
  }, [missionId, wallet]);

  return (
    <>
      {nextPlay && !closed && (
        <div className="card next-play">
          <div className="kicker">Your next play</div>
          <h3>{nextPlay.taskTitle}</h3>
          <p className="muted">Personal order for this wallet. Standing plays are always here; quote/KOL overlays appear only when that signal is ingested.</p>
        </div>
      )}
      {tasks.map((task) => {
        const meta = playMeta(task.details);
        const isNext = nextPlay?.taskId === task.id;
        return (
          <div key={task.id} className={`card${isNext ? " next-play" : ""}`}>
            <div className="row">
              <h3>{task.title}</h3>
              {isNext && <span className="badge high">Your next play</span>}
              <span className={`badge ${meta.kind === "triggered" ? "caution" : "ok"}`}>{meta.label}</span>
            </div>
            <p>{task.actionType} on {task.platform} · Base points {task.basePoints}</p>
            {(() => {
              const target = targetUrlFromDetails(task.details);
              if (target) {
                return (
                  <p>
                    <a href={target} target="_blank" rel="noreferrer">{targetCtaLabel(task.details)}</a>
                  </p>
                );
              }
              if (meta.id === "invite-raider") {
                return <p className="muted">Share your personal CTA from this mission. Clicks on that link count as impact.</p>;
              }
              if (meta.id === "share-telegram" || meta.id === "discord-boost") {
                return <p className="muted">No channel URL was ingested. Paste one on the signal or drop it in the war-room pin.</p>;
              }
              return (
                <p className="muted">
                  No post is linked. The app does not scrape X — ingest the tweet URL or pin the thread in the war room.
                </p>
              );
            })()}
            {(task.submissions?.length ?? 0) > 0 && (
              <div>
                <p className="muted">Recent proofs</p>
                {task.submissions?.map((submission) => (
                  <p key={submission.id}>
                    {submission.user?.displayName || submission.user?.wallet || "Contributor"} · {submission.pointsAwarded} pts ·{" "}
                    <a href={submission.proofUrl} target="_blank" rel="noreferrer">proof</a>
                  </p>
                ))}
              </div>
            )}
            {!closed && <SubmissionForm taskId={task.id} missionId={missionId} taskDetails={task.details} />}
          </div>
        );
      })}
    </>
  );
}
