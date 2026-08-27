"use client";

import { useState } from "react";
import ConnectWalletButton from "../../../ConnectWalletButton";
import CopyLink from "../../../CopyLink";
import { API_BASE } from "../../../../lib/config";
import { authHeaders, notifyOps } from "../../../../lib/session";
import { useContributorProfile } from "../../../../lib/useContributorProfile";

export default function ClaimButton({ missionId }: { missionId: string }) {
  const { wallet, label, connected, profile } = useContributorProfile();
  const [status, setStatus] = useState("");
  const claimed = Boolean(profile?.claimedMissionIds?.includes(missionId));
  const myLink = profile?.links?.find((link) => link.missionId === missionId);

  async function claim() {
    if (!wallet) {
      setStatus("Connect a wallet first.");
      return;
    }
    setStatus("Claiming...");
    const res = await fetch(`${API_BASE}/missions/${missionId}/claim`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ wallet })
    });
    if (res.ok) {
      notifyOps();
      setStatus("Mission claimed. Share your tracked CTA, then submit proof.");
    } else {
      setStatus("Claim failed.");
    }
  }

  if (!connected) {
    return (
      <div className="card">
        <h3>Claim this mission</h3>
        <p className="muted">Connect a wallet, then claim with that address.</p>
        <ConnectWalletButton />
        {status && <p>{status}</p>}
      </div>
    );
  }

  if (claimed) {
    return (
      <div className="card">
        <h3>Mission claimed</h3>
        <p className="muted">
          {label ? `${label} · ` : ""}
          <code>{wallet}</code> is on this mission. Share your unique CTA so clicks count as your impact.
        </p>
        {myLink ? (
          <CopyLink code={myLink.code} clicks={myLink.clicks} />
        ) : (
          <button className="btn secondary" onClick={() => void claim()}>Create my tracked CTA</button>
        )}
        <p>{status}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Claim this mission</h3>
      <p className="muted">
        Claiming as {label ? `${label} · ` : ""}
        <code>{wallet}</code>
      </p>
      <button className="btn" onClick={() => void claim()}>Claim</button>
      <p>{status}</p>
    </div>
  );
}
