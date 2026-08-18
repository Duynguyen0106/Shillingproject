"use client";

import { useState } from "react";
import { API_BASE } from "../../../../lib/config";

export default function SubmissionForm({ taskId }: { taskId: string }) {
  const [wallet, setWallet] = useState("0xdemo");
  const [proofUrl, setProofUrl] = useState("https://x.com/example/post");
  const [proofText, setProofText] = useState("");
  const [status, setStatus] = useState("");
  const [points, setPoints] = useState<number | null>(null);

  async function submit() {
    setStatus("Submitting...");
    const res = await fetch(`${API_BASE}/tasks/${taskId}/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
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

  return (
    <div className="card">
      <h4>Submit proof</h4>
      <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Wallet" />
      <br /><br />
      <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="Proof URL" />
      <br /><br />
      <textarea value={proofText} onChange={(e) => setProofText(e.target.value)} placeholder="Proof text" />
      <br /><br />
      <button className="btn" onClick={submit}>Submit</button>
      <p>{status}{points !== null ? ` Awarded ${points} pts.` : ""}</p>
    </div>
  );
}
