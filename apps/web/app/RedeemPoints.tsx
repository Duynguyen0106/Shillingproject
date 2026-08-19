"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../lib/config";
import { authHeaders } from "../lib/session";
import { getStoredCommunityId } from "../lib/community";

type RedeemData = {
  total: number;
  burned: number;
  available: number;
  history: { id: string; pointsBurned: number; status: string; createdAt: string; txHash?: string | null }[];
};

const MIN_REDEEM = 100;

export default function RedeemPoints() {
  const [data, setData] = useState<RedeemData | null>(null);
  const [amount, setAmount] = useState(MIN_REDEEM);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const communityId = getStoredCommunityId();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const res = await fetch(`${API_BASE}/me/redeem?communityId=${communityId}`, { headers: authHeaders() });
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
  }

  async function redeem() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`${API_BASE}/me/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ communityId, points: amount })
      });
      const result = await res.json();
      if (!res.ok) { setNote(result.error ?? "Failed"); return; }
      setNote(`Redemption queued! ${amount} points burned. You'll receive tokens when the operator processes it.`);
      await loadData();
    } catch {
      setNote("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  if (data.available < MIN_REDEEM) {
    return (
      <div className="card">
        <div className="kicker">Coin redemption</div>
        <p className="muted">You need at least {MIN_REDEEM} redeemable points to redeem for coin. You have {data.available}.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="kicker">Coin redemption</div>
      <div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)", margin: "12px 0" }}>
        <div className="stat"><span className="muted">Total earned</span><strong>{data.total}</strong></div>
        <div className="stat"><span className="muted">Already burned</span><strong>{data.burned}</strong></div>
        <div className="stat"><span className="muted">Available</span><strong>{data.available}</strong></div>
      </div>
      <label>
        Redeem points
        <input
          type="number"
          min={MIN_REDEEM}
          max={data.available}
          step={MIN_REDEEM}
          value={amount}
          onChange={(e) => setAmount(Math.max(MIN_REDEEM, Math.min(data.available, Number(e.target.value))))}
        />
      </label>
      {note && <p className="muted">{note}</p>}
      <button className="btn" onClick={() => void redeem()} disabled={busy || amount > data.available}>
        {busy ? "Processing…" : `Redeem ${amount} points`}
      </button>
      {data.history.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary className="muted">Redemption history</summary>
          {data.history.map((r) => (
            <div key={r.id} className="row" style={{ marginTop: 8 }}>
              <span className="badge">{r.status}</span>
              <span>{r.pointsBurned} pts</span>
              <span className="muted">{new Date(r.createdAt).toLocaleDateString()}</span>
              {r.txHash && <a href={`https://solscan.io/tx/${r.txHash}`} target="_blank" rel="noreferrer">Tx</a>}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
