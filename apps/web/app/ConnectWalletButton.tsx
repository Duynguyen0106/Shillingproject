"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../lib/config";
import { getStoredCommunityId } from "../lib/community";
import { clearSession, getStoredWallet, getStoredWalletLabel, shortAddress, storeSession } from "../lib/session";
import { FEATURED_WALLETS, matchFeatured } from "../lib/wallets";

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  disconnect?: () => Promise<void>;
  accounts?: string[];
  session?: { peer?: { metadata?: { name?: string } } };
};

type DiscoveredWallet = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  provider: WalletProvider;
};

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

let walletConnectProvider: WalletProvider | null = null;

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

async function siweLogin(address: string, provider: WalletProvider, walletLabel?: string) {
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
  await fetch(`${API_BASE}/communities/${getStoredCommunityId()}/join`, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${token}` },
    body: JSON.stringify({ displayName: user.displayName })
  });
  storeSession(user.wallet, user.displayName || "Raider", token, walletLabel);
  return user.wallet as string;
}

export default function ConnectWalletButton({ compact = false }: { compact?: boolean }) {
  const [wallet, setWallet] = useState("");
  const [label, setLabel] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [injected, setInjected] = useState<DiscoveredWallet[]>([]);

  useEffect(() => {
    const sync = () => {
      setWallet(getStoredWallet());
      setLabel(getStoredWalletLabel());
    };
    sync();
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
      const connected = await siweLogin(address, item.provider, item.name);
      setWallet(connected);
      setLabel(item.name);
      setOpen(false);
      setStatus("Wallet connected.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Connect failed.");
    } finally {
      setBusy(false);
    }
  }

  async function connectWalletConnect(preferredName?: string) {
    if (!PROJECT_ID || PROJECT_ID.startsWith("placeholder")) {
      setStatus("Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to enable Trust/Phantom mobile QR.");
      return;
    }
    setBusy(true);
    setStatus(preferredName ? `Opening ${preferredName} via WalletConnect...` : "Opening WalletConnect...");
    try {
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      if (walletConnectProvider?.disconnect) {
        try {
          await walletConnectProvider.disconnect();
        } catch {
          /* already disconnected */
        }
      }
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
      walletConnectProvider = provider;
      await provider.connect();
      const address = provider.accounts[0];
      if (!address) throw new Error("No WalletConnect account");
      const peerName = provider.session?.peer?.metadata?.name || preferredName || "WalletConnect";
      const connected = await siweLogin(address, provider, peerName);
      setWallet(connected);
      setLabel(peerName);
      setOpen(false);
      setStatus("Wallet connected.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "WalletConnect failed.");
    } finally {
      setBusy(false);
    }
  }

  async function connectFeatured(walletId: string) {
    const featured = FEATURED_WALLETS.find((item) => item.id === walletId);
    if (!featured) return;
    const detected = injected.find((item) => matchFeatured(item.rdns, item.name)?.id === featured.id);
    if (detected) {
      await connectInjected(detected);
      return;
    }
    if (PROJECT_ID && !PROJECT_ID.startsWith("placeholder")) {
      await connectWalletConnect(featured.name);
      return;
    }
    window.open(featured.installUrl, "_blank", "noopener,noreferrer");
    setStatus(`Install ${featured.name}, then return and connect. WalletConnect QR needs NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.`);
  }

  async function disconnect() {
    if (walletConnectProvider?.disconnect) {
      try {
        await walletConnectProvider.disconnect();
      } catch {
        /* ignore */
      }
    }
    walletConnectProvider = null;
    clearSession();
    setWallet("");
    setLabel("");
    setStatus("Disconnected.");
  }

  if (wallet) {
    return (
      <span className={`row wallet-connected${compact ? " wallet-connected-compact" : ""}`} style={{ marginLeft: compact ? 0 : "auto" }}>
        <span className="badge wallet-badge">{label ? `${compact ? label.split(" ")[0] : label} · ${shortAddress(wallet)}` : shortAddress(wallet)}</span>
        {!compact && <button className="btn secondary" onClick={() => void disconnect()}>Disconnect</button>}
        {compact && (
          <button className="btn secondary wallet-disconnect-compact" type="button" onClick={() => void disconnect()} aria-label="Disconnect wallet">
            ✕
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="row" style={{ marginLeft: compact ? 0 : "auto" }}>
      <button className={`btn${compact ? " btn-compact" : ""}`} disabled={busy} onClick={() => setOpen(true)}>
        {compact ? "Connect" : "Connect wallet"}
      </button>
      {status && !open && <span className="muted">{status}</span>}
      {open && (
        <div className="modal-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h3>Connect a wallet</h3>
            <p className="muted">Installed extensions connect directly. WalletConnect QR covers 300+ mobile wallets including Trust and Phantom.</p>
            {injected.length > 0 && (
              <>
                <h4>Detected in this browser</h4>
                <div className="wallet-grid">
                  {injected.map((item) => (
                    <button key={item.uuid} className="wallet-option" disabled={busy} onClick={() => void connectInjected(item)}>
                      {item.icon && /^(data:image\/|https:\/\/)/.test(item.icon) && (
                        <img src={item.icon} alt="" width={28} height={28} />
                      )}
                      <span>{item.name}</span>
                      <small>Installed</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            <h4>Popular wallets</h4>
            <div className="wallet-grid">
              {FEATURED_WALLETS.map((item) => {
                const detected = injected.some((inj) => matchFeatured(inj.rdns, inj.name)?.id === item.id);
                return (
                  <button key={item.id} className="wallet-option" disabled={busy} onClick={() => void connectFeatured(item.id)}>
                    <span className="wallet-meta">
                      <span>{item.name}</span>
                      <small>{detected ? "Detected" : item.hint}</small>
                    </span>
                    <small>{detected ? "Connect" : "WalletConnect / Install"}</small>
                  </button>
                );
              })}
              <button className="wallet-option" disabled={busy} onClick={() => void connectWalletConnect()}>
                <span className="wallet-meta">
                  <span>WalletConnect</span>
                  <small>QR for any mobile wallet</small>
                </span>
                <small>300+ wallets</small>
              </button>
            </div>
            {injected.length === 0 && (
              <p className="muted">No browser wallets detected. Pick a popular wallet or scan a WalletConnect QR.</p>
            )}
            <button className="btn secondary" onClick={() => setOpen(false)}>Close</button>
            <p>{status}</p>
          </div>
        </div>
      )}
    </span>
  );
}
