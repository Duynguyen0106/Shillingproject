"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../../../lib/config";
import { authHeaders } from "../../../lib/session";
import ConnectToContinue, { useAuthedSession } from "../../ConnectToContinue";

interface ReferralData {
  code: string;
  referralUrl: string;
  referralCount: number;
  bonusPoints: number;
  referrals: { wallet: string; displayName: string | null; usedAt: string }[];
}

export default function ReferralPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [useCode, setUseCode] = useState("");
  const [redeemStatus, setRedeemStatus] = useState<string | null>(null);
  const connected = useAuthedSession();

  const load = useCallback(() => {
    if (!connected) { setLoading(false); return; }
    fetch(`${API_BASE}/me/referral-code`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [connected]);

  useEffect(() => { load(); }, [load]);

  const copy = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.referralUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const redeem = async () => {
    if (!useCode.trim()) return;
    setRedeemStatus("loading");
    const res = await fetch(`${API_BASE}/referral/use`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ code: useCode.trim() })
    });
    if (res.ok) {
      setRedeemStatus("success");
      setUseCode("");
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      setRedeemStatus(e.error || "Failed");
    }
  };

  return (
    <ConnectToContinue
      title="Referrals"
      kicker="Earn together"
      description="Invite friends to ShillOps. You earn 5% of all their points as bonus — forever."
      gateDescription="Connect wallet to view your referral code and track bonus points."
      backHref="/app/me"
    >
      {loading && <p className="muted">Loading…</p>}

      {!loading && data && (
        <>
          <div className="card ref-card">
            <div className="ref-code-label">Your invite link</div>
            <div className="ref-url">{data.referralUrl}</div>
            <button className="btn" onClick={copy}>{copied ? "Copied!" : "Copy link"}</button>
          </div>

          <div className="stats" style={{ marginTop: "1rem" }}>
            <div className="stat"><span className="muted">Referrals</span><strong>{data.referralCount}</strong></div>
            <div className="stat"><span className="muted">Bonus points</span><strong>{data.bonusPoints}</strong></div>
          </div>

          {data.referrals.length > 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <h2>Your referrals</h2>
              {data.referrals.map((r, i) => (
                <div key={i} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{r.displayName || r.wallet.slice(0, 10) + "…"}</span>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>{r.usedAt ? new Date(r.usedAt).toLocaleDateString() : "Pending"}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="card" style={{ marginTop: "2rem" }}>
        <h2>Use a referral code</h2>
        <p className="muted">Have a code from a friend? Enter it to give them a bonus.</p>
        <div className="ref-input-row">
          <input
            className="input"
            value={useCode}
            onChange={(e) => setUseCode(e.target.value)}
            placeholder="Enter referral code"
          />
          <button className="btn" onClick={redeem} disabled={redeemStatus === "loading"}>Apply</button>
        </div>
        {redeemStatus && redeemStatus !== "loading" && (
          <p className={redeemStatus === "success" ? "badge" : "muted"} style={{ marginTop: "0.5rem" }}>
            {redeemStatus === "success" ? "✅ Referral applied! Referrer earned bonus." : redeemStatus}
          </p>
        )}
      </div>
    </ConnectToContinue>
  );
}
