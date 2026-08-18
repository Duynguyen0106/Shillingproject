"use client";

import { useEffect, useState } from "react";
import { API_BASE, COMMUNITY_ID } from "../lib/config";
import { getStoredDisplayName, getStoredWallet, storeSession } from "../lib/session";

export default function JoinCta() {
  const [wallet, setWallet] = useState("0xdemo");
  const [displayName, setDisplayName] = useState("Raider");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setWallet(getStoredWallet());
    setDisplayName(getStoredDisplayName());
  }, []);

  async function join() {
    setStatus("Joining...");
    const res = await fetch(`${API_BASE}/communities/${COMMUNITY_ID}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet, displayName })
    });
    if (res.ok) {
      storeSession(wallet, displayName);
      setStatus("Joined demo community. Open the mission board.");
    } else {
      setStatus("Join failed. Is the API running?");
    }
  }

  return (
    <div className="card">
      <h3>Join the demo community</h3>
      <p className="muted">Uses a mock wallet for Phase 1. SIWE verify is stubbed on the API.</p>
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
