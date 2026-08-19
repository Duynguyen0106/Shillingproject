"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE } from "../../../../lib/config";
import { storeCommunity } from "../../../../lib/community";
import { formatRemaining } from "../../../../lib/missionTime";
import { authHeaders, getStoredWallet, shortAddress } from "../../../../lib/session";
import { useConnectedWallet } from "../../../../lib/useConnectedWallet";
import ConnectWalletButton from "../../../ConnectWalletButton";
import FocusRaidCard from "../../../FocusRaidCard";
import type { FocusRaid } from "../../../../lib/shillAction";

type TrustReport = {
  level: "ok" | "caution" | "high-risk";
  reasons: string[];
};

type TokenProof = {
  paidProfile: boolean;
  communityTakeover: boolean;
  ads: boolean;
};

type Listing = {
  chainId: string;
  address: string;
  name: string;
  symbol: string;
  liquidityUsd: number;
};

type LeadSeat = {
  vacant: boolean;
  reason: "occupied" | "resigned" | "inactive";
  wallet: string | null;
  displayName: string | null;
  lastActiveAt: string | null;
  remainingMs: number | null;
};

type Membership = {
  role: string;
  isLead: boolean;
};

type Mission = {
  id: string;
  title: string;
  description: string;
  priority: string;
  remainingMs?: number | null;
  claimsCount?: number;
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
  proof?: TokenProof | null;
  trust?: TrustReport | null;
  community: {
    id: string;
    name: string;
    ticker: string;
    chainId?: string | null;
    contractAddress?: string | null;
    dexUrl?: string | null;
    description?: string | null;
    xCommunityUrl?: string | null;
    xCommunityId?: string | null;
  } | null;
  lead?: LeadSeat | null;
  you?: Membership | null;
  focus?: FocusRaid | null;
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
  const [missions, setMissions] = useState<Mission[]>([]);
  const [status, setStatus] = useState("Loading DexScreener…");
  const [busy, setBusy] = useState(false);
  const [xUrl, setXUrl] = useState("");

  useEffect(() => {
    const load = async () => {
      const walletQs = getStoredWallet() ? `&wallet=${encodeURIComponent(getStoredWallet())}` : "";
      const res = await fetch(`${API_BASE}/tokens/lookup?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}${walletQs}`);
      if (!res.ok) {
        setStatus("Token not found on DexScreener. Check the chain and contract.");
        return;
      }
      const body = (await res.json()) as LookupResponse;
      setData(body);
      if (body.community?.xCommunityUrl) setXUrl(body.community.xCommunityUrl);
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
  }, [chain, address, wallet]);

  useEffect(() => {
    const communityId = data?.community?.id;
    if (!communityId) {
      setMissions([]);
      return;
    }
    const loadMissions = async () => {
      const res = await fetch(`${API_BASE}/communities/${communityId}/missions?status=active`);
      if (!res.ok) return;
      const body = (await res.json()) as Mission[];
      setMissions(Array.isArray(body) ? body : []);
    };
    void loadMissions();
  }, [data?.community?.id]);

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
    setData((current) => ({
      token: current?.token ?? body.token,
      community: body.community,
      warning: current?.warning,
      trust: current?.trust,
      listings: current?.listings,
      proof: current?.proof,
      lead: body.lead ?? current?.lead,
      you: body.you ?? current?.you
    }));
    setStatus(body.created ? "Community created and you are the CTO lead." : "Joined the existing community for this contract.");
    setBusy(false);
  }

  async function claimLead() {
    const communityId = data?.community?.id;
    if (!wallet || !communityId) {
      setStatus("Connect a wallet first.");
      return;
    }
    setBusy(true);
    setStatus("Claiming the CTO lead seat...");
    const res = await fetch(`${API_BASE}/communities/${communityId}/lead/claim`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ wallet: getStoredWallet() })
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) {
      setStatus(body.error || "An active CTO already holds this mint.");
      if (body.lead) setData((current) => current ? { ...current, lead: body.lead } : current);
      setBusy(false);
      return;
    }
    if (!res.ok) {
      setStatus(body.error || "Could not claim lead.");
      setBusy(false);
      return;
    }
    setData((current) => current ? { ...current, lead: body.lead, you: body.you } : current);
    setStatus("You are the CTO lead for this mint. The community stays on this contract.");
    setBusy(false);
  }

  async function resignLead() {
    const communityId = data?.community?.id;
    if (!wallet || !communityId) return;
    setBusy(true);
    setStatus("Resigning CTO lead...");
    const res = await fetch(`${API_BASE}/communities/${communityId}/lead/resign`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ wallet: getStoredWallet() })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(body.error || "Could not resign.");
      setBusy(false);
      return;
    }
    setData((current) => current ? { ...current, lead: body.lead, you: body.you } : current);
    setStatus("You resigned. Another joined wallet can claim CTO on this same mint.");
    setBusy(false);
  }

  async function bindXCommunity() {
    const communityId = data?.community?.id;
    if (!wallet || !communityId) {
      setStatus("Connect as CTO lead first.");
      return;
    }
    setBusy(true);
    setStatus("Binding X Community to this mint...");
    const res = await fetch(`${API_BASE}/communities/${communityId}/x-community`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url: xUrl, wallet: getStoredWallet() })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(body.error || "Could not bind that X Community.");
      setBusy(false);
      return;
    }
    setData((current) => current ? {
      ...current,
      community: { ...current.community!, xCommunityUrl: body.xCommunity?.url, xCommunityId: body.xCommunity?.id }
    } : current);
    setXUrl(body.xCommunity?.url || xUrl);
    setStatus("X Community linked to this mint. New missions get a bonus post-in-community task.");
    setBusy(false);
  }

  const token = data?.token;
  const community = data?.community;
  const trust = data?.trust;
  const proof = data?.proof;
  const lead = data?.lead;
  const you = data?.you;
  const otherChains = (data?.listings ?? []).filter((listing) => listing.chainId !== chain);
  const isYouLead = Boolean(you?.isLead || (wallet && lead?.wallet && wallet.toLowerCase() === lead.wallet.toLowerCase()));

  return (
    <main className="container">
      <div className="kicker">Contract-verified community</div>
      <h1>{token ? `${token.name} (${token.symbol})` : "Token lookup"}</h1>
      {token && (
        <div className="card">
          <div className="row">
            {token.imageUrl && <img src={token.imageUrl} alt="" width={40} height={40} style={{ borderRadius: 8 }} />}
            <span className="badge">{token.chainId}</span>
            {proof?.communityTakeover && <span className="badge paid">Dex CTO</span>}
            {proof?.paidProfile && <span className="badge ok">Paid profile</span>}
            {trust && (
              <span className={`badge ${trust.level === "high-risk" ? "high" : trust.level === "caution" ? "caution" : "ok"}`}>
                {trust.level}
              </span>
            )}
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
          <div className="card">
            <h3>X Community</h3>
            {community.xCommunityUrl ? (
              <p>
                <a href={community.xCommunityUrl} target="_blank" rel="noreferrer">Open the linked X Community</a>
              </p>
            ) : (
              <p className="muted">
                Talk happens on X. The CTO lead can bind the official X Community URL for this mint.
                Raid proofs are still any X post; posting in that Community is a bonus task.
              </p>
            )}
            {connected && isYouLead && !lead?.vacant && (
              <label>
                X Community URL
                <input
                  value={xUrl}
                  onChange={(e) => setXUrl(e.target.value)}
                  placeholder="https://x.com/i/communities/…"
                />
              </label>
            )}
            {connected && isYouLead && !lead?.vacant && (
              <button className="btn secondary" disabled={busy} onClick={() => void bindXCommunity()}>
                {community.xCommunityUrl ? "Update X Community" : "Bind X Community"}
              </button>
            )}
          </div>
          {lead && (
            <div className="card">
              <h3>CTO lead</h3>
              {lead.reason === "occupied" && lead.wallet && (
                <p>
                  {lead.displayName || "Lead"} · <code>{shortAddress(lead.wallet)}</code>
                  {typeof lead.remainingMs === "number" ? ` · seat opens in ${formatRemaining(lead.remainingMs)} if they go quiet` : ""}
                </p>
              )}
              {lead.reason === "inactive" && (
                <p className="muted">
                  Previous lead {lead.wallet ? shortAddress(lead.wallet) : ""} went quiet for 48h. The seat is open on this same mint — not a new community.
                </p>
              )}
              {lead.reason === "resigned" && (
                <p className="muted">No CTO lead. A joined wallet can claim the seat. The contract binding does not change.</p>
              )}
              <div className="row">
                {!connected && <ConnectWalletButton />}
                {connected && !you && (
                  <button className="btn secondary" disabled={busy} onClick={() => void bindCommunity()}>Join this mint</button>
                )}
                {connected && lead.vacant && (
                  <button className="btn" disabled={busy} onClick={() => void claimLead()}>
                    {isYouLead ? "Keep CTO lead" : "Claim CTO lead"}
                  </button>
                )}
                {connected && isYouLead && lead.reason !== "resigned" && (
                  <button className="btn secondary" disabled={busy} onClick={() => void resignLead()}>Resign CTO</button>
                )}
              </div>
            </div>
          )}
          <div className="row">
            <Link className="btn" href="/app/feed">Open raid feed</Link>
            <Link className="btn secondary" href="/app">Missions</Link>
            <Link className="btn secondary" href="/app/admin/signals">Ingest signal</Link>
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
      {data?.focus && <FocusRaidCard focus={data.focus} />}
      {community && (
        <div className="card">
          <h3>Live missions for this mint</h3>
          {missions.length === 0 ? (
            <p className="muted">No active missions yet. Ingest a signal against this contract to open one.</p>
          ) : (
            missions.map((mission) => (
              <p key={mission.id}>
                <Link href={`/app/missions/${mission.id}`}>{mission.title}</Link>
                {" "}· {mission.priority}
                {typeof mission.remainingMs === "number" ? ` · ${formatRemaining(mission.remainingMs)}` : ""}
                {typeof mission.claimsCount === "number" ? ` · ${mission.claimsCount} claims` : ""}
              </p>
            ))
          )}
        </div>
      )}
      <p>{status}</p>
    </main>
  );
}
