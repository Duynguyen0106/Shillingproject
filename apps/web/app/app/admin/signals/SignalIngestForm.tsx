"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE } from "../../../../lib/config";
import { getStoredCommunity, getStoredCommunityId } from "../../../../lib/community";

const SIGNAL_TYPES = ["KOL_POST", "MENTION_SPIKE", "WHALE_BUY", "VOLUME_SPIKE"] as const;

export default function SignalIngestForm() {
  const [type, setType] = useState<(typeof SIGNAL_TYPES)[number]>("MENTION_SPIKE");
  const [severity, setSeverity] = useState(80);
  const [sourceRef, setSourceRef] = useState(`demo-${Date.now()}`);
  const [ticker, setTicker] = useState("PEPE");
  const [spikePct, setSpikePct] = useState("28");
  const [token, setToken] = useState("PEPE");
  const [mint, setMint] = useState("");
  const [status, setStatus] = useState("");
  const [bindPath, setBindPath] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredCommunity();
    if (!stored) return;
    if (stored.ticker) {
      setTicker(stored.ticker);
      setToken(stored.ticker);
    }
    if (stored.chainId && stored.contractAddress) {
      setMint(`${stored.chainId}:${stored.contractAddress}`);
    } else if (stored.contractAddress) {
      setMint(stored.contractAddress);
    }
  }, []);

  async function ingest() {
    setStatus("Ingesting...");
    setBindPath(null);
    const metadata =
      type === "WHALE_BUY"
        ? { token }
        : type === "MENTION_SPIKE"
          ? { ticker, spikePct: Number(spikePct) }
          : { ticker };

    const payload = mint.trim()
      ? {
          q: mint.trim(),
          type,
          severity,
          sourceRef,
          metadata
        }
      : {
          communityId: getStoredCommunityId(),
          type,
          severity,
          sourceRef,
          metadata
        };

    const res = await fetch(`${API_BASE}/signals/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.status === 400) {
      const body = await res.json().catch(() => ({ error: "Validation failed" }));
      setStatus(body.error || "Ingest requires a contract, not a ticker.");
      return;
    }
    if (res.status === 404) {
      const body = await res.json().catch(() => ({ error: "No community bound" }));
      setStatus(body.error || "Bind this mint before ingesting signals.");
      setBindPath(body.bindPath || null);
      return;
    }
    if (!res.ok) {
      setStatus("Ingest failed. Check API is running.");
      return;
    }
    const data = await res.json();
    setStatus(`Signal stored on this mint. Mission ${data.mission?.id ? "created/linked" : "not created"}.`);
    window.location.reload();
  }

  return (
    <div className="card">
      <h3>Ingest mock signal</h3>
      <p className="muted">
        Paste the DexScreener URL or `chain:contract`. Tickers are rejected so a cloned CTO cannot steal the raid.
      </p>
      <label>
        Contract or DexScreener URL
        <input
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          placeholder="ethereum:0x… or https://dexscreener.com/…"
        />
      </label>
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as (typeof SIGNAL_TYPES)[number])}>
          {SIGNAL_TYPES.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <label>
        Severity (0-100)
        <input type="number" min={0} max={100} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} />
      </label>
      <label>
        Source ref (idempotency key part)
        <input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} />
      </label>
      {type === "WHALE_BUY" ? (
        <label>
          Token
          <input value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
      ) : (
        <label>
          Ticker
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} />
        </label>
      )}
      {type === "MENTION_SPIKE" && (
        <label>
          Spike %
          <input value={spikePct} onChange={(e) => setSpikePct(e.target.value)} />
        </label>
      )}
      <button className="btn" onClick={() => void ingest()}>Create mission from signal</button>
      <p>{status}</p>
      {bindPath && <Link href={bindPath}>Bind this contract first</Link>}
    </div>
  );
}
