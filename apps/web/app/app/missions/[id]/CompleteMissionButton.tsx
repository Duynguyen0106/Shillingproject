"use client";

import { useState } from "react";
import { API_BASE } from "../../../../lib/config";

export default function CompleteMissionButton({ missionId, status }: { missionId: string; status: string }) {
  const [current, setCurrent] = useState(status);
  const [message, setMessage] = useState("");

  async function complete() {
    const res = await fetch(`${API_BASE}/missions/${missionId}/complete`, { method: "POST" });
    if (!res.ok) {
      setMessage("Could not complete mission.");
      return;
    }
    setCurrent("COMPLETED");
    setMessage("Mission marked complete.");
  }

  return (
    <div className="card">
      <p>Status: {current}</p>
      {current !== "COMPLETED" && (
        <button className="btn secondary" onClick={complete}>Mark complete</button>
      )}
      <p>{message}</p>
    </div>
  );
}
