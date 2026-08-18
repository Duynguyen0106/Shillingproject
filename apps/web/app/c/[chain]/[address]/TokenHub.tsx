"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE } from "../../../../lib/config";
import { storeCommunity } from "../../../../lib/community";
import { authHeaders, getStoredWallet, shortAddress } from "../../../../lib/session";
import { useConnectedWallet } from "../../../../lib/useConnectedWallet";
import ConnectWalletButton from "../../../ConnectWalletButton";

type TrustReport = {
  level: "ok" | "caution" | "high-risk";
  reasons: string[];
};

type Listing = {
  chainId: string;
  address: string;
  name: string;
  symbol: string;
  liquidityUsd: number;
};

type LookupResponse = {
  token: {
    chainId: string;
    address: string;
    name: string;
    symbol: string;
    priceUsd: string | null;
    liquidityUsd: number;
    volume24hUsd?: number;
    pairCreatedAt?: number | null;
    dexUrl: string;
    chartUrl?: string | null;
    imageUrl: string | null;
    pairAddress?: string | null;
    websites?: string[];
    socials?: { type: string; url: string }[];
  } | null;
  listings?: Listing[];
  trust?: TrustReport | null;
  community: {
    id: string;
    name: string;
    ticker: string;
    chainId?: string | null;
    contractAddress?: string | null;
    dexUrl?: string | null;
    description?: string | null;
  } | null;
  ambiguous?: boolean;
  warning?: string;
};

function pairAge(createdAt?: number | null): string | null {
  if (!createdAt) return null;
  const hours = Math.floor((Date.now() - createdAt) / 3_600_000);
  if (hours < 24) return `${hours}h old`;
  const days = Math.floor(hours / 24);
  return `${days}d old`;
}

export default function TokenHub({ chain, address }: { chain: string; address: string }) {
  const { connected, wallet } = useConnectedWallet();
  const [data, setData] = useState<LookupResponse | null>(null);
  const [status, setStatus] = useState("Loading DexScreener…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`${API_BASE}/tokens/lookup?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}`);
      if (!res.ok) {
        setStatus("Token not found on DexScreener. Check the chain and contract.");
        return;
      }
      const body = (await res.json()) as LookupResponse;
      setData(body);
      if (body.community) {
        storeCommunity({
          id: body.community.id,
          name: body.community.name,
          ticker: body.community.ticker,
          chainId: body.community.chainId,
          contractAddress: body.community.contractAddress,
          dexUrl: body.community.dexUrl
        });
      }
      setStatus("");
    };
    void load();
  }, [chain, address]);

  async function bindCommunity() {
    if (!wallet) {
      setStatus("Connect a wallet first.");
      return;
    }
    setBusy(true);
    setStatus("Binding this contract to a Shill Ops community...");
    const res = await fetch(`${API_BASE}/communities/from-token`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        chainId: chain,
        contractAddress: address,
        wallet: getStoredWallet()
      })
    });
    if (!res.ok) {
      setStatus("Could not create the community. Connect and try again.");
      setBusy(false);
      return;
    }
    const body = await res.json();
    storeCommunity({
      id: body.community.id,
      name: body.community.name,
      ticker: body.community.ticker,
      chainId: body.community.chainId,
      contractAddress: body.community.contractAddress,
      dexUrl: body.community.dexUrl
    });
    setData((current) => ({ token: current?.token ?? body.token, community: body.community, warning: current?.warning, trust: current?.trust, listings: current?.listings }));
    setStatus(body.created ? "Community created and bound to this contract." : "Opened the existing community for this contract.");
    setBusy(false);
  }

  const token = data?.token;
  const community = data?.community;
  const trust = data?.trust;
  const otherChains = (data?.listings ?? []).filter((listing) => listing.chainId !== chain);

  return (
    <main className="container">
      <div className="kicker">Contract-verified community</div>
      <h1>{token ? `${token.name} (${token.symbol})` : "Token lookup"}</h1>
      {token && (
        <div className="card">
          <div className="row">
            {token.imageUrl && <img src={token.imageUrl} alt="" width={40} height={40} style={{ borderRadius: 8 }} />}
            <span className="badge">{token.chainId}</span>
            {trust && <span className={`badge ${trust.level === "high-risk" ? "high" : ""}`}>{trust.level}</span>}
            <code>{shortAddress(token.address)}</code>
          </div>
          <p className="muted">
            Liquidity ${Math.round(token.liquidityUsd).toLocaleString()}
            {token.volume24hUsd ? ` · vol $${Math.round(token.volume24hUsd).toLocaleString()}` : ""}
            {token.priceUsd ? ` · $${token.priceUsd}` : ""}
            {pairAge(token.pairCreatedAt) ? ` · ${pairAge(token.pairCreatedAt)}` : ""}
          </p>
          <p className="muted">{token.address}</p>
          <div className="row">
            <a href={token.dexUrl} target="_blank" rel="noreferrer">Open DexScreener</a>
            {(token.websites ?? []).map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">Website</a>
            ))}
            {(token.socials ?? []).map((social) => (
              <a key={social.url} href={social.url} target="_blank" rel="noreferrer">{social.type}</a>
            ))}
          </div>
        </div>
      )}
      {token?.chartUrl && (
        <div className="card">
          <iframe
            className="dex-chart"
            src={token.chartUrl}
            title="DexScreener chart"
            allow="clipboard-write"
          />
        </div>
      )}
      {trust && (
        <div className="card">
          <h3>Trust checks</h3>
          <p className="muted">These are market signals from DexScreener, not a guarantee. Always match the contract yourself.</p>
          <ul>
            {trust.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {otherChains.length > 0 && (
        <div className="card">
          <h3>Same ticker on other chains</h3>
          <p className="muted">Scam CTOs often point you at a copy on another chain. Open only the mint you verified.</p>
          {otherChains.map((listing) => (
            <p key={listing.chainId}>
              <Link href={`/c/${listing.chainId}/${listing.address}`}>{listing.chainId}</Link>
              {" "}· liq ${Math.round(listing.liquidityUsd).toLocaleString()}
            </p>
          ))}
        </div>
      )}
      <div className="card">
        <p className="muted">
          {data?.warning || "A scam CTO can clone a Telegram name. They cannot clone this contract. Join only the community bound to the mint you verified on DexScreener."}
        </p>
      </div>
      {community ? (
        <div className="card">
          <h3>Verified Shill Ops community</h3>
          <p>
            <strong>{community.name}</strong> · {community.ticker}
          </p>
          <p className="muted">{community.description}</p>
          <div className="row">
            <Link className="btn" href="/app">Open missions</Link>
            <Link className="btn secondary" href="/app/me">My Ops</Link>
          </div>
        </div>
      ) : (
        <div className="card">
          <h3>No community bound yet</h3>
          <p className="muted">
            First connected wallet to bind this contract creates the only Shill Ops community for it.
            Later groups using the same ticker in Telegram are not this community.
          </p>
          {connected ? (
            <button className="btn" disabled={busy} onClick={() => void bindCommunity()}>Bind contract and open community</button>
          ) : (
            <ConnectWalletButton />
          )}
        </div>
      )}
      <p>{status}</p>
    </main>
  );
}
