"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "../lib/config";

export default function ContractSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function search() {
    const q = query.trim();
    if (q.length < 3) {
      setStatus("Paste a contract, DexScreener URL, or ticker.");
      return;
    }
    setBusy(true);
    setStatus("Looking up on DexScreener...");
    try {
      const res = await fetch(`${API_BASE}/tokens/lookup?q=${encodeURIComponent(q)}`);
      if (res.status === 404) {
        setStatus("No DexScreener market found for that query. Use the contract from the token page.");
        return;
      }
      if (!res.ok) {
        setStatus("Lookup failed. Is the API running?");
        return;
      }
      const data = await res.json();
      const chain = data.token?.chainId;
      const address = data.token?.address;
      if (!chain || !address) {
        setStatus("Could not resolve a contract from that search.");
        return;
      }
      router.push(`/c/${chain}/${address}`);
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
    </div>
  );
}
