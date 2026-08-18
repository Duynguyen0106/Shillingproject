"use client";

import { useEffect, useState } from "react";
import ConnectWalletButton from "./ConnectWalletButton";
import { API_BASE, COMMUNITY_ID } from "../lib/config";
import { getStoredDisplayName, getStoredWallet, storeSession } from "../lib/session";

export default function JoinCta() {
  const [wallet, setWallet] = useState("");
  const [displayName, setDisplayName] = useState("Raider");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const sync = () => {
      setWallet(getStoredWallet());
      setDisplayName(getStoredDisplayName());
    };
    sync();
    window.addEventListener("shillops-session", sync);
    return () => window.removeEventListener("shillops-session", sync);
  }, []);

  async function join() {
    if (!wallet) {
      setStatus("Connect a wallet first, or paste an address for demo mode.");
      return;
    }
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
      <h3>Connect wallet and join</h3>
      <p className="muted">
        Use MetaMask or another injected wallet. You will sign a SIWE message; the API recovers your address.
      </p>
      <ConnectWalletButton />
      <br />
      <label>
        Display name
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label>
        Wallet (filled by connect, or paste for demo)
        <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x..." />
      </label>
      <button className="btn" onClick={join}>Join community</button>
      <p>{status}</p>
    </div>
  );
}
