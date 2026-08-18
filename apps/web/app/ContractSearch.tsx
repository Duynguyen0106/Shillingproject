"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "../lib/config";

type Listing = {
  chainId: string;
  address: string;
  name: string;
  symbol: string;
  liquidityUsd: number;
  dexUrl: string;
};

type LookupResponse = {
  token?: { chainId: string; address: string; name: string; symbol: string };
  listings?: Listing[];
  ambiguous?: boolean;
  warning?: string;
};

export default function ContractSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<Listing[]>([]);

  async function search() {
    const q = query.trim();
    if (q.length < 3) {
      setStatus("Paste a contract or DexScreener URL. Tickers are ambiguous.");
      return;
    }
    setBusy(true);
    setStatus("Looking up on DexScreener...");
    setMatches([]);
    try {
      const res = await fetch(`${API_BASE}/tokens/lookup?q=${encodeURIComponent(q)}`);
      if (res.status === 404) {
        setStatus("No DexScreener market found. Use the contract from the token page.");
        return;
      }
      if (!res.ok) {
        setStatus("Lookup failed. Is the API running?");
        return;
      }
      const data = (await res.json()) as LookupResponse;
      const listings = data.listings?.length
        ? data.listings
        : data.token
          ? [{
              chainId: data.token.chainId,
              address: data.token.address,
              name: data.token.name,
              symbol: data.token.symbol,
              liquidityUsd: 0,
              dexUrl: ""
            }]
          : [];
      if (listings.length === 0) {
        setStatus("Could not resolve a contract from that search.");
        return;
      }
      if (data.ambiguous || listings.length > 1) {
        setMatches(listings);
        setStatus(data.ambiguous
          ? "Ticker search matched multiple markets. Pick the exact contract from DexScreener."
          : "This contract trades on multiple chains. Pick the market you verified.");
        return;
      }
      router.push(`/c/${listings[0].chainId}/${listings[0].address}`);
    } catch {
      setStatus("Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Find a coin by contract</h3>
      <p className="muted">
        Paste the DexScreener link or token contract. We open the Shill Ops community bound to that mint —
        not a Telegram name that can be cloned by a scam CTO.
      </p>
      <label>
        Contract or DexScreener URL
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder="0x… or https://dexscreener.com/ethereum/…"
        />
      </label>
      <button className="btn" disabled={busy} onClick={() => void search()}>Search token</button>
      <p>{status}</p>
      {matches.map((match) => (
        <div key={`${match.chainId}-${match.address}`} className="card">
          <strong>{match.name} ({match.symbol})</strong>
          <p className="muted">{match.chainId} · {match.address} · liq ${Math.round(match.liquidityUsd).toLocaleString()}</p>
          <Link className="btn secondary" href={`/c/${match.chainId}/${match.address}`}>Open this mint</Link>
        </div>
      ))}
    </div>
  );
}
