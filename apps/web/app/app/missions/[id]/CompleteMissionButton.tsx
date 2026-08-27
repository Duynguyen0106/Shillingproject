"use client";

import { useState } from "react";
import { API_BASE } from "../../../../lib/config";
import { authHeaders } from "../../../../lib/session";

export default function CompleteMissionButton({ missionId, status }: { missionId: string; status: string }) {
  const [current, setCurrent] = useState(status);
  const [message, setMessage] = useState("");

  async function complete() {
    const res = await fetch(`${API_BASE}/missions/${missionId}/complete`, {
      method: "POST",
      headers: authHeaders()
    });
    if (res.status === 401) {
      setMessage("Connect a wallet first.");
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(typeof body.error === "string" ? body.error : "Could not complete mission.");
      return;
    }
    setCurrent("COMPLETED");
    setMessage("Mission marked complete.");
  }

  if (current === "EXPIRED") {
    return (
      <div className="card">
        <p>Status: EXPIRED</p>
        <p className="muted">This window closed. Open a live mission from the board.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <p>Status: {current}</p>
      {current !== "COMPLETED" && (
        <button className="btn secondary" onClick={() => void complete()}>Mark complete</button>
      )}
      <p>{message}</p>
    </div>
  );
}
