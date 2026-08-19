"use client";

import { useState } from "react";
import { API_BASE } from "../../../../lib/config";

export default function NotificationTestButtons() {
  const [status, setStatus] = useState("");

  async function test(channel: "telegram" | "discord") {
    setStatus(`Sending ${channel} test...`);
    const res = await fetch(`${API_BASE}/notifications/${channel}/test`, { method: "POST" });
    setStatus(res.ok ? `${channel} test logged.` : `${channel} test failed.`);
    if (res.ok) window.location.reload();
  }

  return (
    <div className="card">
      <h3>Send test alerts</h3>
      <p className="muted">If webhook URLs are empty, alerts still appear in the in-app log as undelivered.</p>
      <div className="row">
        <button className="btn" onClick={() => test("telegram")}>Test Telegram</button>
        <button className="btn secondary" onClick={() => test("discord")}>Test Discord</button>
      </div>
      <p>{status}</p>
    </div>
  );
}
