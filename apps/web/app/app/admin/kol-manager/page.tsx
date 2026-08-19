"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../../../../lib/config";
import { authHeaders, getStoredToken } from "../../../../lib/session";
import { getStoredCommunityId } from "../../../../lib/community";
import ConnectWalletButton from "../../../ConnectWalletButton";
import Link from "next/link";

interface KOL {
  id: string;
  handle: string;
  displayName: string | null;
  followers: number | null;
  verified: boolean;
  lastFetchedAt: string | null;
}

export default function KolManagerPage() {
  const [kols, setKols] = useState<KOL[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHandle, setNewHandle] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const connected = Boolean(getStoredToken());
  const communityId = getStoredCommunityId();

  const load = useCallback(() => {
    if (!communityId) { setLoading(false); return; }
    fetch(`${API_BASE}/communities/${communityId}/kols/manage`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setKols(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [communityId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newHandle) return;
    setAdding(true); setMsg(null);
    const res = await fetch(`${API_BASE}/communities/${communityId}/kols/manage`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ handle: newHandle, displayName: newName || undefined })
    });
    if (res.ok) {
      setMsg("KOL added! Their posts will appear in the feed when detected.");
      setNewHandle(""); setNewName("");
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(e.error || "Failed");
    }
    setAdding(false);
  };

  const remove = async (handle: string) => {
    await fetch(`${API_BASE}/communities/${communityId}/kols/manage/${handle}`, {
      method: "DELETE", headers: authHeaders()
    });
    setKols((k) => k.filter((x) => x.handle !== handle));
  };

  if (!connected) return (
    <main className="container">
      <h1>KOL Watch Manager</h1>
      <div className="card"><ConnectWalletButton /></div>
    </main>
  );

  return (
    <main className="container">
      <div className="kicker">Lead tools</div>
      <h1>KOL Watch Manager</h1>
      <p className="muted">
        Track X accounts (KOLs, whale wallets, CT influencers). When they post, it automatically appears in your raid feed and can trigger shill missions.
      </p>

      {loading && <p className="muted">Loading…</p>}
      {!loading && kols.length === 0 && (
        <div className="card"><p className="muted">No KOLs tracked yet. Add one below.</p></div>
      )}

      {kols.map((kol) => (
        <div key={kol.id} className="card kol-card">
          <div className="kol-header">
            <div>
              <span className="kol-handle">@{kol.handle}</span>
              {kol.displayName && <span className="muted"> · {kol.displayName}</span>}
              {kol.verified && <span className="badge" style={{ marginLeft: "0.4rem" }}>✓</span>}
            </div>
            <button className="btn" style={{ background: "#450a0a", fontSize: "0.75rem", padding: "0.2rem 0.6rem" }} onClick={() => remove(kol.handle)}>Remove</button>
          </div>
          {kol.followers != null && <p className="muted" style={{ fontSize: "0.8rem" }}>{kol.followers.toLocaleString()} followers</p>}
          {kol.lastFetchedAt && <p className="muted" style={{ fontSize: "0.75rem" }}>Last checked: {new Date(kol.lastFetchedAt).toLocaleString()}</p>}
        </div>
      ))}

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Add KOL</h2>
        <div className="form-group">
          <label>X handle (without @)</label>
          <input className="input" value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder="elonmusk" />
        </div>
        <div className="form-group">
          <label>Display name (optional)</label>
          <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Elon Musk" />
        </div>
        <button className="btn" onClick={add} disabled={adding}>Add KOL</button>
        {msg && <p className="muted" style={{ marginTop: "0.5rem" }}>{msg}</p>}
      </div>

      <p style={{ marginTop: "1.5rem" }}><Link href="/app/admin/dashboard">← Back to admin</Link></p>
    </main>
  );
}
