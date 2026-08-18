"use client";

import { useState } from "react";
import ConnectWalletButton from "../../../ConnectWalletButton";
import { API_BASE } from "../../../../lib/config";
import { authHeaders, notifyOps } from "../../../../lib/session";
import { proofPlaceholder } from "../../../../lib/playbook";
import { useContributorProfile } from "../../../../lib/useContributorProfile";

export default function SubmissionForm({
  taskId,
  missionId,
  taskDetails
}: {
  taskId: string;
  missionId: string;
  taskDetails?: string | null;
}) {
  const { wallet, label, connected, profile } = useContributorProfile();
  const xCommunityId = taskDetails?.startsWith("x-community:") ? taskDetails.slice("x-community:".length).split("\n")[0] : null;
  const [proofUrl, setProofUrl] = useState(proofPlaceholder(taskDetails));
  const [proofText, setProofText] = useState("");
  const [status, setStatus] = useState("");
  const [points, setPoints] = useState<number | null>(null);
  const claimed = Boolean(profile?.claimedMissionIds?.includes(missionId));

  async function submit() {
    if (!wallet) {
      setStatus("Connect a wallet first.");
      return;
    }
    setStatus("Submitting...");
    const res = await fetch(`${API_BASE}/tasks/${taskId}/submissions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ wallet, proofUrl, proofText, engagementValue: 25 })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus(typeof body.error === "string" ? body.error : "Submission failed.");
      return;
    }
    const data = await res.json();
    setPoints(data.pointsAwarded ?? 0);
    setStatus("Submitted and scored.");
    notifyOps();
  }

  if (!connected) {
    return (
      <div className="card">
        <h4>Submit proof</h4>
        <p className="muted">Connect a wallet to submit proof for this task.</p>
        <ConnectWalletButton />
      </div>
    );
  }

  if (!claimed) {
    return (
      <div className="card">
        <h4>Submit proof</h4>
        <p className="muted">Claim this mission first, then submit proof to earn points.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h4>Submit proof</h4>
      <p className="muted">
        Scoring as {label ? `${label} · ` : ""}
        <code>{wallet}</code>
      </p>
      <label>
        Proof URL
        <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />
      </label>
      {xCommunityId && (
        <p className="muted">
          Bonus task: paste a post from{" "}
          <a href={`https://x.com/i/communities/${xCommunityId}`} target="_blank" rel="noreferrer">the linked X Community</a>.
          Reply/KOL tasks on this mission still accept any x.com status URL.
        </p>
      )}
      <label>
        Proof text
        <textarea value={proofText} onChange={(e) => setProofText(e.target.value)} />
      </label>
      <button className="btn" onClick={() => void submit()}>Submit</button>
      <p>{status}{points !== null ? ` Awarded ${points} pts.` : ""}</p>
    </div>
  );
}
