"use client";

import { useState } from "react";
import ConnectWalletButton from "../../../ConnectWalletButton";
import { API_BASE } from "../../../../lib/config";
import { authHeaders } from "../../../../lib/session";
import { useConnectedWallet } from "../../../../lib/useConnectedWallet";

export default function SubmissionForm({ taskId }: { taskId: string }) {
  const { wallet, label, connected } = useConnectedWallet();
  const [proofUrl, setProofUrl] = useState("https://x.com/example/post");
  const [proofText, setProofText] = useState("");
  const [status, setStatus] = useState("");
  const [points, setPoints] = useState<number | null>(null);

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
      setStatus("Submission failed.");
      return;
    }
    const data = await res.json();
    setPoints(data.pointsAwarded ?? 0);
    setStatus("Submitted and scored.");
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
      <label>
        Proof text
        <textarea value={proofText} onChange={(e) => setProofText(e.target.value)} />
      </label>
      <button className="btn" onClick={() => void submit()}>Submit</button>
      <p>{status}{points !== null ? ` Awarded ${points} pts.` : ""}</p>
    </div>
  );
}
