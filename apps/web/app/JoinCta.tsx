"use client";

import { useState } from "react";
import { API_BASE, COMMUNITY_ID } from "../lib/config";

export default function JoinCta() {
  const [wallet, setWallet] = useState("0xdemo");
  const [displayName, setDisplayName] = useState("Raider");
  const [status, setStatus] = useState("");

  async function join() {
    setStatus("Joining...");
    const res = await fetch(`${API_BASE}/communities/${COMMUNITY_ID}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet, displayName })
    });
    setStatus(res.ok ? "Joined demo community. Open the mission board." : "Join failed. Is the API running?");
  }

  return (
    <div className="card">
      <h3>Join the demo community</h3>
      <label>
        Wallet
        <input value={wallet} onChange={(e) => setWallet(e.target.value)} />
      </label>
      <label>
        Display name
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <button className="btn" onClick={join}>Join</button>
      <p>{status}</p>
    </div>
  );
}
