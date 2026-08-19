"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../../../../lib/config";
import { authHeaders, getStoredToken } from "../../../../lib/session";
import { getStoredCommunityId } from "../../../../lib/community";
import ConnectWalletButton from "../../../ConnectWalletButton";
import Link from "next/link";

export default function MissionBuilderPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [targetXUrl, setTargetXUrl] = useState("");
  const [tasks, setTasks] = useState([{ title: "", actionType: "REPLY" as const, platform: "X" as const, details: "" }]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const connected = Boolean(getStoredToken());
  const communityId = getStoredCommunityId();

  const addTask = () => setTasks((t) => [...t, { title: "", actionType: "REPLY", platform: "X", details: "" }]);
  const removeTask = (i: number) => setTasks((t) => t.filter((_, idx) => idx !== i));
  const updateTask = (i: number, field: string, value: string) =>
    setTasks((t) => t.map((task, idx) => idx === i ? { ...task, [field]: value } : task));

  const submit = async () => {
    if (!title || tasks.some((t) => !t.title)) { setMsg("Please fill in all required fields."); return; }
    setSaving(true);
    setMsg(null);
    const res = await fetch(`${API_BASE}/communities/${communityId}/missions/create`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title, description, priority, targetXUrl: targetXUrl || undefined, tasks })
    });
    if (res.ok) {
      const m = await res.json();
      setMsg(`✅ Mission created: "${m.title}" (${m.tasks.length} tasks)`);
      setTitle(""); setDescription(""); setTargetXUrl("");
      setTasks([{ title: "", actionType: "REPLY", platform: "X", details: "" }]);
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(e.error || "Failed to create mission.");
    }
    setSaving(false);
  };

  if (!connected) return (
    <main className="container">
      <h1>Mission Builder</h1>
      <div className="card"><p className="muted">Connect wallet to create missions.</p><ConnectWalletButton /></div>
    </main>
  );

  return (
    <main className="container">
      <div className="kicker">Lead tools</div>
      <h1>Mission Builder</h1>
      <p className="muted">Create structured shill missions with multiple tasks for your community.</p>

      <div className="card">
        <div className="form-group">
          <label>Mission title *</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reply to KOL post" />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What raiders need to do and why…" style={{ resize: "vertical" }} />
        </div>
        <div className="form-group">
          <label>Priority</label>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High — 2× points</option>
          </select>
        </div>
        <div className="form-group">
          <label>Target X post URL (optional)</label>
          <input className="input" value={targetXUrl} onChange={(e) => setTargetXUrl(e.target.value)} placeholder="https://x.com/user/status/…" />
        </div>
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Tasks</h2>
      <p className="muted">At least one task is required.</p>
      {tasks.map((task, i) => (
        <div key={i} className="card mission-task-builder">
          <div className="mtb-header">
            <span>Task {i + 1}</span>
            {tasks.length > 1 && <button className="btn secondary" style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem" }} onClick={() => removeTask(i)}>Remove</button>}
          </div>
          <div className="form-group">
            <label>Task title *</label>
            <input className="input" value={task.title} onChange={(e) => updateTask(i, "title", e.target.value)} placeholder="e.g. Reply with $TICKER mention" />
          </div>
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Action type</label>
              <select className="input" value={task.actionType} onChange={(e) => updateTask(i, "actionType", e.target.value)}>
                <option value="REPLY">Reply</option>
                <option value="SHARE">Share / Retweet</option>
                <option value="BOOST">Boost / Like</option>
                <option value="INVITE">Invite</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Platform</label>
              <select className="input" value={task.platform} onChange={(e) => updateTask(i, "platform", e.target.value)}>
                <option value="X">X (Twitter)</option>
                <option value="TELEGRAM">Telegram</option>
                <option value="DISCORD">Discord</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Details (optional — requirements, example copy)</label>
            <input className="input" value={task.details} onChange={(e) => updateTask(i, "details", e.target.value)} placeholder="Must include $TICKER and @mention" />
          </div>
        </div>
      ))}
      <button className="btn secondary" onClick={addTask} style={{ marginTop: "0.5rem" }}>+ Add task</button>

      <div style={{ marginTop: "1.5rem" }}>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create mission 🚀"}</button>
      </div>
      {msg && <p className="muted" style={{ marginTop: "0.75rem" }}>{msg}</p>}
      <p style={{ marginTop: "1.5rem" }}><Link href="/app">← Back to missions</Link></p>
    </main>
  );
}
