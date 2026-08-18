"use client";

import { useEffect, useState } from "react";
import { API_BASE, COMMUNITY_ID } from "../lib/config";
import { clearSession, getStoredWallet, shortAddress, storeSession } from "../lib/session";

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type DiscoveredWallet = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  provider: WalletProvider;
};

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

function utf8ToHex(value: string): string {
  return `0x${Array.from(new TextEncoder().encode(value)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function discoverInjectedWallets(): Promise<DiscoveredWallet[]> {
  return new Promise((resolve) => {
    const wallets = new Map<string, DiscoveredWallet>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<{
        info: { uuid: string; name: string; icon: string; rdns: string };
        provider: WalletProvider;
      }>).detail;
      if (!detail?.info?.uuid || !detail.provider) return;
      wallets.set(detail.info.uuid, { ...detail.info, provider: detail.provider });
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve(Array.from(wallets.values()).sort((a, b) => a.name.localeCompare(b.name)));
    }, 150);
  });
}

async function siweLogin(address: string, provider: WalletProvider) {
  const start = await fetch(`${API_BASE}/auth/siwe/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: address })
  });
  if (!start.ok) throw new Error("Could not start SIWE");
  const { message } = await start.json();
  let signature: string;
  try {
    signature = (await provider.request({
      method: "personal_sign",
      params: [message, address]
    })) as string;
  } catch {
    signature = (await provider.request({
      method: "personal_sign",
      params: [utf8ToHex(message), address]
    })) as string;
  }
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
  return user.wallet as string;
}

export default function ConnectWalletButton() {
  const [wallet, setWallet] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [injected, setInjected] = useState<DiscoveredWallet[]>([]);

  useEffect(() => {
    setWallet(getStoredWallet());
    const sync = () => setWallet(getStoredWallet());
    window.addEventListener("shillops-session", sync);
    return () => window.removeEventListener("shillops-session", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    void discoverInjectedWallets().then(setInjected);
  }, [open]);

  async function connectInjected(item: DiscoveredWallet) {
    setBusy(true);
    setStatus(`Connecting ${item.name}...`);
    try {
      const accounts = (await item.provider.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("No account selected");
      const connected = await siweLogin(address, item.provider);
      setWallet(connected);
      setOpen(false);
      setStatus("Wallet connected.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Connect failed.");
    } finally {
      setBusy(false);
    }
  }

  async function connectWalletConnect() {
    if (!PROJECT_ID || PROJECT_ID.startsWith("placeholder")) {
      setStatus("Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to enable Trust/Phantom mobile QR.");
      return;
    }
    setBusy(true);
    setStatus("Opening WalletConnect...");
    try {
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      const provider = await EthereumProvider.init({
        projectId: PROJECT_ID,
        chains: [1],
        optionalChains: [56, 137, 8453, 42161],
        showQrModal: true,
        metadata: {
          name: "Shill Ops",
          description: "Memecoin community missions",
          url: window.location.origin,
          icons: ["https://avatars.githubusercontent.com/u/37784886"]
        }
      });
      await provider.connect();
      const address = provider.accounts[0];
      if (!address) throw new Error("No WalletConnect account");
      const connected = await siweLogin(address, provider);
      setWallet(connected);
      setOpen(false);
      setStatus("Wallet connected.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "WalletConnect failed.");
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
      <button className="btn" disabled={busy} onClick={() => setOpen(true)}>Connect wallet</button>
      {status && <span className="muted">{status}</span>}
      {open && (
        <div className="modal-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h3>Connect a wallet</h3>
            <p className="muted">Installed wallets appear first. WalletConnect covers Trust, Phantom, and 300+ mobile wallets.</p>
            <div className="wallet-grid">
              {injected.map((item) => (
                <button key={item.uuid} className="wallet-option" disabled={busy} onClick={() => void connectInjected(item)}>
                  <img src={item.icon} alt="" width={28} height={28} />
                  <span>{item.name}</span>
                </button>
              ))}
              <button className="wallet-option" disabled={busy} onClick={() => void connectWalletConnect()}>
                <span>WalletConnect</span>
                <small>Trust, Phantom, Rainbow, OKX, Ledger…</small>
              </button>
            </div>
            {injected.length === 0 && (
              <p className="muted">No browser wallets detected. Use WalletConnect QR or install Phantom, Trust, or MetaMask.</p>
            )}
            <button className="btn secondary" onClick={() => setOpen(false)}>Close</button>
            <p>{status}</p>
          </div>
        </div>
      )}
    </span>
  );
}
