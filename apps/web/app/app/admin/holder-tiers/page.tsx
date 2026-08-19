"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../../../../lib/config";
import { authHeaders } from "../../../../lib/session";
import { getStoredCommunityId } from "../../../../lib/community";
import ConnectWalletButton from "../../../ConnectWalletButton";
import Link from "next/link";

interface Tier {
  id: string;
  minTokens: number;
  multiplier: number;
  label: string;
}

export default function HolderTiersPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newMin, setNewMin] = useState("");
  const [newMult, setNewMult] = useState("1.5");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const communityId = getStoredCommunityId();

  const load = useCallback(() => {
    if (!communityId) { setLoading(false); return; }
    fetch(`${API_BASE}/communities/${communityId}/holder-tiers`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setTiers(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newLabel || !newMin || !newMult) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch(`${API_BASE}/communities/${communityId}/holder-tiers`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ label: newLabel, minTokens: Number(newMin), multiplier: Number(newMult) })
    });
    if (res.ok) {
      setMsg("Tier added!");
      setNewLabel(""); setNewMin(""); setNewMult("1.5");
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(e.error || "Failed");
    }
    setSaving(false);
  };

  const remove = async (id: string) => {
    await fetch(`${API_BASE}/communities/${communityId}/holder-tiers/${id}`, {
      method: "DELETE", headers: authHeaders()
    });
    setTiers((t) => t.filter((x) => x.id !== id));
  };

  return (
    <main className="container">
      <div className="kicker">Lead tools</div>
      <h1>Holder Tier Multipliers</h1>
      <p className="muted">Reward holders with boosted points. Raiders holding more tokens earn multiplied points on submissions.</p>

      {loading && <p className="muted">Loading…</p>}

      {!loading && tiers.length === 0 && (
        <div className="card"><p className="muted">No tiers configured. Add tiers below.</p></div>
      )}

      {tiers.map((t) => (
        <div key={t.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>{t.label}</strong>
            <p className="muted">≥ {t.minTokens.toLocaleString()} tokens → {t.multiplier}× points</p>
          </div>
          <button className="btn" style={{ background: "#3f0000" }} onClick={() => remove(t.id)}>Remove</button>
        </div>
      ))}

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Add Tier</h2>
        <div className="form-group">
          <label>Label (e.g. "Whale 🐋")</label>
          <input className="input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Tier name" />
        </div>
        <div className="form-group">
          <label>Min tokens held</label>
          <input className="input" type="number" min={0} value={newMin} onChange={(e) => setNewMin(e.target.value)} placeholder="e.g. 1000000" />
        </div>
        <div className="form-group">
          <label>Multiplier (1–3×)</label>
          <input className="input" type="number" min={1} max={3} step={0.1} value={newMult} onChange={(e) => setNewMult(e.target.value)} />
        </div>
        <button className="btn" onClick={add} disabled={saving}>Add tier</button>
        {msg && <p className="muted" style={{ marginTop: "0.5rem" }}>{msg}</p>}
      </div>

      <div className="card" style={{ marginTop: "1.5rem", background: "#0d0d14" }}>
        <h3>How it works</h3>
        <p className="muted">
          When a raider submits a verified proof, their <strong>holderMultiplier</strong> is applied to their base score.
          Update a raider&apos;s multiplier via the admin API: <code>PATCH /users/:wallet/holder-multiplier</code>.
          In future, this will auto-update from on-chain balance checks.
        </p>
      </div>

      <p style={{ marginTop: "1.5rem" }}><Link href="/app/admin/dashboard">← Back to admin</Link></p>
    </main>
  );
}
