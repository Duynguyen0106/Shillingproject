"use client";

import { useState } from "react";
import { API_BASE } from "../../../lib/config";
import { authHeaders, getStoredToken } from "../../../lib/session";
import { getStoredCommunityId } from "../../../lib/community";
import ConnectWalletButton from "../../ConnectWalletButton";
import Link from "next/link";

interface ClaimResult {
  claimId: string;
  amount: string;
  signature: string;
  nonce: string;
  expiresAt: string;
  contractAddress: string | null;
}

export default function RedeemOnChainPage() {
  const [points, setPoints] = useState(500);
  const [loading, setLoading] = useState(false);
  const [claim, setClaim] = useState<ClaimResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState("");
  const [confirming, setConfirming] = useState(false);
  const connected = Boolean(getStoredToken());
  const communityId = getStoredCommunityId();

  const generate = async () => {
    if (points < 100) { setMsg("Minimum 100 points required."); return; }
    setLoading(true); setMsg(null); setClaim(null);
    const res = await fetch(`${API_BASE}/communities/${communityId}/redemption-claim`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ points })
    });
    if (res.ok) {
      const data = await res.json();
      setClaim(data);
      setMsg(null);
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(e.error || "Failed to generate claim.");
    }
    setLoading(false);
  };

  const confirm = async () => {
    if (!claim || !txHash) return;
    setConfirming(true);
    const res = await fetch(`${API_BASE}/redemption-claims/${claim.nonce}/confirm`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ txHash })
    });
    if (res.ok) {
      setMsg("✅ Redemption confirmed! Your transaction has been recorded.");
      setClaim(null); setTxHash("");
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(e.error || "Confirmation failed.");
    }
    setConfirming(false);
  };

  const fmtAmount = (amt: string) => {
    try { return (BigInt(amt) / BigInt("1000000000000000000")).toString(); } catch { return amt; }
  };

  if (!connected) return (
    <main className="container">
      <h1>Redeem Tokens</h1>
      <div className="card"><p className="muted">Connect wallet to redeem your points for tokens.</p><ConnectWalletButton /></div>
    </main>
  );

  return (
    <main className="container">
      <div className="kicker">Points → Tokens</div>
      <h1>Redeem Tokens On-Chain</h1>
      <p className="muted">
        Convert your ShillOps points into community tokens. A signed claim is generated server-side — use it to call the redemption contract within 24 hours.
      </p>

      {!claim && (
        <div className="card">
          <div className="form-group">
            <label>Points to redeem (min 100)</label>
            <input className="input" type="number" min={100} step={100} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
            <p className="muted" style={{ marginTop: "0.3rem", fontSize: "0.8rem" }}>= {points.toLocaleString()} tokens (1 pt = 1 token)</p>
          </div>
          <button className="btn" onClick={generate} disabled={loading}>{loading ? "Generating claim…" : "Generate claim signature"}</button>
          {msg && <p className="muted" style={{ marginTop: "0.5rem" }}>{msg}</p>}
        </div>
      )}

      {claim && (
        <div className="card redeem-claim-card">
          <h2>Claim Ready ✅</h2>
          <p className="muted">Use this signature to call the on-chain claim function. Expires: {new Date(claim.expiresAt).toLocaleString()}</p>

          <div className="claim-field">
            <span className="claim-label">Amount</span>
            <span className="claim-value">{fmtAmount(claim.amount)} tokens</span>
          </div>
          {claim.contractAddress && (
            <div className="claim-field">
              <span className="claim-label">Contract</span>
              <code className="claim-value">{claim.contractAddress}</code>
            </div>
          )}
          <div className="claim-field">
            <span className="claim-label">Nonce</span>
            <code className="claim-value mono-small">{claim.nonce}</code>
          </div>
          <div className="claim-field">
            <span className="claim-label">Signature</span>
            <code className="claim-value mono-small" style={{ wordBreak: "break-all" }}>{claim.signature}</code>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <p className="muted" style={{ fontSize: "0.85rem" }}>After calling the contract, paste your transaction hash below to confirm:</p>
            <div className="ref-input-row" style={{ marginTop: "0.5rem" }}>
              <input className="input" value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x…" />
              <button className="btn" onClick={confirm} disabled={confirming || !txHash}>{confirming ? "Confirming…" : "Confirm tx"}</button>
            </div>
          </div>
          {msg && <p className="muted" style={{ marginTop: "0.5rem" }}>{msg}</p>}
        </div>
      )}

      <div className="card" style={{ marginTop: "1.5rem", background: "#0d0d14" }}>
        <h3>How it works</h3>
        <ol className="redeem-steps">
          <li>Generate a claim signature above (burns your points)</li>
          <li>Call <code>claim(amount, nonce, signature)</code> on the community token contract</li>
          <li>Paste the tx hash to confirm on ShillOps</li>
        </ol>
        <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>The claim signature is signed by the ShillOps server key. The contract verifies it to prevent unauthorized claims.</p>
      </div>

      <p style={{ marginTop: "1.5rem" }}><Link href="/app/me">← Back to My Ops</Link></p>
    </main>
  );
}
