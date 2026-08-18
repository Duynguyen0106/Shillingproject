"use client";

import { useEffect, useMemo, useState } from "react";
import ConnectWalletButton from "../../../ConnectWalletButton";
import { API_BASE } from "../../../../lib/config";
import { authHeaders, getStoredWallet, shortAddress } from "../../../../lib/session";
import { useConnectedWallet } from "../../../../lib/useConnectedWallet";

export type WarRoomData = {
  closed: boolean;
  pin: { body: string; at?: string | null; wallet?: string | null; displayName?: string | null } | null;
  checkIns: { wallet: string; displayName?: string | null }[];
  checkInCount: number;
  claimsCount: number;
  proofCount: number;
  clickCount: number;
};

export default function WarRoom({
  missionId,
  communityId,
  initial
}: {
  missionId: string;
  communityId?: string;
  initial: WarRoomData;
}) {
  const { connected, wallet } = useConnectedWallet();
  const [room, setRoom] = useState(initial);
  const [pinBody, setPinBody] = useState(initial.pin?.body ?? "");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [isLead, setIsLead] = useState(false);

  const checkedIn = useMemo(() => {
    if (!wallet) return false;
    return room.checkIns.some((entry) => entry.wallet.toLowerCase() === wallet.toLowerCase());
  }, [room.checkIns, wallet]);

  useEffect(() => {
    if (!communityId || !wallet) {
      setIsLead(false);
      return;
    }
    const load = async () => {
      const res = await fetch(`${API_BASE}/communities/${communityId}`);
      if (!res.ok) return;
      const body = (await res.json()) as { lead?: { vacant?: boolean; wallet?: string | null } };
      setIsLead(Boolean(body.lead && !body.lead.vacant && body.lead.wallet && body.lead.wallet.toLowerCase() === wallet.toLowerCase()));
    };
    void load();
  }, [communityId, wallet]);
  async function pin() {
    if (!pinBody.trim()) {
      setStatus("Write the one line raiders should push.");
      return;
    }
    setBusy(true);
    const res = await fetch(`${API_BASE}/missions/${missionId}/pin`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ body: pinBody.trim(), wallet: getStoredWallet() })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(body.error || "Could not pin.");
      setBusy(false);
      return;
    }
    setRoom((current) => ({ ...current, pin: body.pin }));
    setStatus("Narrative pinned. Raiders should copy that onto X.");
    setBusy(false);
  }

  async function checkIn() {
    setBusy(true);
    const res = await fetch(`${API_BASE}/missions/${missionId}/check-in`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ wallet: getStoredWallet() })
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 403) {
      setStatus(body.error || "Join this mint first.");
      setBusy(false);
      return;
    }
    if (!res.ok) {
      setStatus(body.error || "Check-in failed.");
      setBusy(false);
      return;
    }
    const me = wallet || getStoredWallet();
    setRoom((current) => ({
      ...current,
      checkInCount: body.checkInCount ?? current.checkInCount + 1,
      checkIns: current.checkIns.some((entry) => entry.wallet.toLowerCase() === me.toLowerCase())
        ? current.checkIns
        : [{ wallet: me, displayName: "You" }, ...current.checkIns]
    }));
    setStatus("You're in. Copy the pin onto X — hype lives there.");
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="kicker">Mission war room</div>
      <h3>Coordinate the raid</h3>
      <p className="muted">
        No chat. Pin one line, tap I&apos;m in, then post on X/Telegram. This room closes when the mission expires.
      </p>
      <div className="row">
        <span className="badge">{room.checkInCount} in</span>
        <span className="badge">{room.claimsCount} claimed</span>
        <span className="badge">{room.proofCount} proofs</span>
        <span className="badge">{room.clickCount} clicks</span>
      </div>
      {room.pin ? (
        <div className="card">
          <strong>Push this</strong>
          <p>{room.pin.body}</p>
          <p className="muted">
            Pinned by {room.pin.displayName || (room.pin.wallet ? shortAddress(room.pin.wallet) : "CTO")}
          </p>
        </div>
      ) : (
        <p className="muted">No narrative pinned yet. CTO lead sets the one line everyone copies.</p>
      )}
      {room.closed ? (
        <p className="muted">Raid closed. Check-ins and pins are locked.</p>
      ) : (
        <>
          {isLead && (
            <label>
              Pin the talk track (max 280)
              <input
                value={pinBody}
                maxLength={280}
                onChange={(e) => setPinBody(e.target.value)}
                placeholder="PEPE whale buy is real. Quote this and drop your CTA."
              />
            </label>
          )}
          <div className="row">
            {!connected && <ConnectWalletButton />}
            {connected && isLead && (
              <button className="btn" disabled={busy} onClick={() => void pin()}>Pin narrative</button>
            )}
            {connected && (
              <button className="btn secondary" disabled={busy || checkedIn} onClick={() => void checkIn()}>
                {checkedIn ? "You're in" : "I'm in"}
              </button>
            )}
          </div>
        </>
      )}
      {room.checkIns.length > 0 && (
        <div className="checkin-list">
          {room.checkIns.slice(0, 24).map((entry) => (
            <span key={entry.wallet} className="badge">
              {entry.displayName || shortAddress(entry.wallet)}
            </span>
          ))}
        </div>
      )}
      {status && <p>{status}</p>}
    </div>
  );
}
