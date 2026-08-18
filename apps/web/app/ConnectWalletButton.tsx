"use client";

import { useEffect, useState } from "react";
import { API_BASE, COMMUNITY_ID } from "../lib/config";
import { clearSession, getStoredWallet, shortAddress, storeSession } from "../lib/session";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getEthereum(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

export default function ConnectWalletButton() {
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWallet(getStoredWallet());
  }, []);

  async function connect() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setStatus("No browser wallet found. Install MetaMask or Rabby.");
      return;
    }
    setBusy(true);
    setStatus("Connecting...");
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("No account selected");

      const start = await fetch(`${API_BASE}/auth/siwe/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: address })
      });
      if (!start.ok) throw new Error("Could not start SIWE");
      const { message } = await start.json();

      const signature = await ethereum.request({
        method: "personal_sign",
        params: [message, address]
      });

      const verify = await fetch(`${API_BASE}/auth/siwe/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature })
      });
      if (!verify.ok) throw new Error("Signature verification failed");
      const { token, user } = await verify.json();

      await fetch(`${API_BASE}/communities/${COMMUNITY_ID}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: user.wallet, displayName: user.displayName })
      });

      storeSession(user.wallet, user.displayName || "Raider", token);
      setWallet(user.wallet);
      setStatus("Wallet connected.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Connect failed.");
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    clearSession();
    setWallet("");
    setStatus("Disconnected.");
  }

  if (wallet) {
    return (
      <span className="row" style={{ marginLeft: "auto" }}>
        <span className="badge">{shortAddress(wallet)}</span>
        <button className="btn secondary" onClick={disconnect}>Disconnect</button>
      </span>
    );
  }

  return (
    <span className="row" style={{ marginLeft: "auto" }}>
      <button className="btn" disabled={busy} onClick={connect}>
        {busy ? "Connecting..." : "Connect wallet"}
      </button>
      {status && <span className="muted">{status}</span>}
    </span>
  );
}
