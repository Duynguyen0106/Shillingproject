"use client";

import { useState } from "react";
import ConnectWalletButton from "../../../ConnectWalletButton";
import { API_BASE } from "../../../../lib/config";
import { authHeaders } from "../../../../lib/session";
import { useConnectedWallet } from "../../../../lib/useConnectedWallet";

export default function ClaimButton({ missionId }: { missionId: string }) {
  const { wallet, label, connected } = useConnectedWallet();
  const [status, setStatus] = useState("");

  async function claim() {
    if (!wallet) {
      setStatus("Connect a wallet first.");
      return;
    }
    setStatus("Claiming...");
    const res = await fetch(`${API_BASE}/missions/${missionId}/claim`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ wallet })
    });
    setStatus(res.ok ? "Mission claimed." : "Claim failed.");
  }

  if (!connected) {
    return (
      <div className="card">
        <h3>Claim this mission</h3>
        <p className="muted">Connect a wallet, then claim with that address.</p>
        <ConnectWalletButton />
        {status && <p>{status}</p>}
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Claim this mission</h3>
      <p className="muted">
        Claiming as {label ? `${label} · ` : ""}
        <code>{wallet}</code>
      </p>
      <button className="btn" onClick={() => void claim()}>Claim</button>
      <p>{status}</p>
    </div>
  );
}
