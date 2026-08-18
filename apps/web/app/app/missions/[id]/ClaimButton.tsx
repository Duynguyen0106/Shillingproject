"use client";

import { useState } from "react";
import { API_BASE } from "../../../../lib/config";

export default function ClaimButton({ missionId }: { missionId: string }) {
  const [wallet, setWallet] = useState("0xdemo");
  const [status, setStatus] = useState("");

  async function claim() {
    setStatus("Claiming...");
    const res = await fetch(`${API_BASE}/missions/${missionId}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet })
    });
    setStatus(res.ok ? "Mission claimed." : "Claim failed.");
  }

  return (
    <div className="card">
      <h3>Claim this mission</h3>
      <label>
        Wallet
        <input value={wallet} onChange={(e) => setWallet(e.target.value)} />
      </label>
      <button className="btn" onClick={claim}>Claim</button>
      <p>{status}</p>
    </div>
  );
}
