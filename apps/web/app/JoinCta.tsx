"use client";

import { useEffect, useState } from "react";
import ConnectWalletButton from "./ConnectWalletButton";
import { API_BASE } from "../lib/config";
import { getStoredCommunityId } from "../lib/community";
import { authHeaders, getStoredDisplayName, getStoredWallet, storeSession } from "../lib/session";

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
      setStatus("Connect a wallet from the modal first.");
      return;
    }
    setStatus("Joining...");
    const res = await fetch(`${API_BASE}/communities/${getStoredCommunityId()}/join`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ wallet, displayName })
    });
    if (res.ok) {
      storeSession(wallet, displayName);
      setStatus("Joined the contract-bound community. Open the mission board.");
    } else {
      setStatus("Join failed. Is the API running?");
    }
  }

  return (
    <div className="card">
      <h3>Connect any wallet and join</h3>
      <p className="muted">
        Paste the DexScreener contract first so you join the community bound to that mint, not a cloned CTO chat.
        Then connect Phantom, Trust, MetaMask, or WalletConnect and sign SIWE.
      </p>
      <ConnectWalletButton />
      <br />
      <label>
        Display name
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label>
        Connected address
        <input value={wallet} readOnly placeholder="Connect a wallet to fill this" />
      </label>
      <button className="btn" onClick={join}>Join community</button>
      <p>{status}</p>
    </div>
  );
}
