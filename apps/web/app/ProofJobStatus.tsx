"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../lib/config";
import { authHeaders } from "../lib/session";

type ProofJob = {
  id: string;
  feedPostId: string;
  status: "PENDING" | "CHECKING" | "SCORED" | "FAILED";
  proofUrl?: string | null;
  pointsAwarded?: number | null;
  failReason?: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<ProofJob["status"], string> = {
  PENDING: "Queued",
  CHECKING: "Checking X…",
  SCORED: "Scored",
  FAILED: "Not found"
};

const STATUS_CLASS: Record<ProofJob["status"], string> = {
  PENDING: "",
  CHECKING: "caution",
  SCORED: "ok",
  FAILED: "high"
};

export default function ProofJobStatus({ communityId }: { communityId: string }) {
  const [jobs, setJobs] = useState<ProofJob[]>([]);

  useEffect(() => {
    if (!communityId) return;
    const load = () => {
      fetch(`${API_BASE}/me/proof-jobs?communityId=${communityId}`, { headers: authHeaders() })
        .then((r) => r.ok ? r.json() : [])
        .then(setJobs)
        .catch(() => undefined);
    };
    load();
    // Poll every 15s for live updates
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [communityId]);

  const pending = jobs.filter((j) => j.status === "PENDING" || j.status === "CHECKING");
  const recent = jobs.filter((j) => j.status === "SCORED" || j.status === "FAILED").slice(0, 3);

  if (jobs.length === 0) return null;

  return (
    <div className="card">
      <div className="kicker">Auto-score status</div>
      {pending.length > 0 && (
        <p className="muted">{pending.length} reply{pending.length !== 1 ? "s" : ""} being checked…</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[...pending, ...recent].map((job) => (
          <div key={job.id} className="row">
            <span className={`badge ${STATUS_CLASS[job.status]}`}>{STATUS_LABEL[job.status]}</span>
            {job.status === "SCORED" && job.pointsAwarded !== null && (
              <span className="badge ok">+{job.pointsAwarded} pts</span>
            )}
            {job.status === "SCORED" && job.proofUrl && (
              <a href={job.proofUrl} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 13 }}>View reply</a>
            )}
            {job.status === "FAILED" && (
              <span className="muted" style={{ fontSize: 13 }}>{job.failReason ?? "Reply not found in time window"}</span>
            )}
            <span className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>
              {new Date(job.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
