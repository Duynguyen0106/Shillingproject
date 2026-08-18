"use client";

import { useState } from "react";
import { API_BASE, COMMUNITY_ID } from "../../../../lib/config";

const SIGNAL_TYPES = ["KOL_POST", "MENTION_SPIKE", "WHALE_BUY", "VOLUME_SPIKE"] as const;

export default function SignalIngestForm() {
  const [type, setType] = useState<(typeof SIGNAL_TYPES)[number]>("MENTION_SPIKE");
  const [severity, setSeverity] = useState(80);
  const [sourceRef, setSourceRef] = useState(`demo-${Date.now()}`);
  const [ticker, setTicker] = useState("PEPE");
  const [spikePct, setSpikePct] = useState("28");
  const [token, setToken] = useState("PEPE");
  const [status, setStatus] = useState("");

  async function ingest() {
    setStatus("Ingesting...");
    const metadata =
      type === "WHALE_BUY"
        ? { token }
        : type === "MENTION_SPIKE"
          ? { ticker, spikePct: Number(spikePct) }
          : { ticker };

    const res = await fetch(`${API_BASE}/signals/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        communityId: COMMUNITY_ID,
        type,
        severity,
        sourceRef,
        metadata
      })
    });
    if (!res.ok) {
      setStatus("Ingest failed. Check API is running.");
      return;
    }
    const data = await res.json();
    setStatus(`Signal stored. Mission ${data.mission?.id ? "created/linked" : "not created"}.`);
    window.location.reload();
  }

  return (
    <div className="card">
      <h3>Ingest mock signal</h3>
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
      <button className="btn" onClick={ingest}>Create mission from signal</button>
      <p>{status}</p>
    </div>
  );
}
