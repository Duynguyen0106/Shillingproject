"use client";

import { useState } from "react";
import { API_BASE, COMMUNITY_ID } from "../../../../lib/config";

export default function CreateLinkForm() {
  const [missionId, setMissionId] = useState("");
  const [targetUrl, setTargetUrl] = useState("http://localhost:3000/app");
  const [status, setStatus] = useState("");
  const [createdCode, setCreatedCode] = useState("");

  async function createLink() {
    setStatus("Creating...");
    const res = await fetch(`${API_BASE}/links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        communityId: COMMUNITY_ID,
        missionId: missionId || undefined,
        targetUrl
      })
    });
    if (!res.ok) {
      setStatus("Create failed. Check URL format and API.");
      return;
    }
    const data = await res.json();
    setCreatedCode(data.code);
    setStatus(`Created /r/${data.code}`);
    window.location.reload();
  }

  return (
    <div className="card">
      <h3>Create tracked short link</h3>
      <label>
        Target URL
        <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
      </label>
      <label>
        Mission ID (optional)
        <input value={missionId} onChange={(e) => setMissionId(e.target.value)} placeholder="mission id" />
      </label>
      <button className="btn" onClick={createLink}>Create short link</button>
      <p>{status}</p>
      {createdCode && (
        <p>
          Tracked URL: <code>{API_BASE}/r/{createdCode}</code>
        </p>
      )}
    </div>
  );
}
