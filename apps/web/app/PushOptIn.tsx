"use client";

import { useState, useEffect } from "react";
import { API_BASE } from "../lib/config";
import { authHeaders, getStoredToken } from "../lib/session";
import { getStoredCommunityId } from "../lib/community";

export default function PushOptIn() {
  const [status, setStatus] = useState<"unknown" | "granted" | "denied" | "loading">("unknown");
  const connected = Boolean(getStoredToken());

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setStatus(Notification.permission as any);
    }
  }, []);

  const subscribe = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Push notifications are not supported in your browser.");
      return;
    }
    setStatus("loading");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setStatus("denied"); return; }
      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) { setStatus("granted"); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
      const { endpoint, keys } = sub.toJSON() as any;
      await fetch(`${API_BASE}/notifications/subscribe`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth, communityId: getStoredCommunityId() })
      });
      setStatus("granted");
    } catch {
      setStatus("denied");
    }
  };

  if (!connected || status === "granted") return null;
  if (status === "denied") return null;

  return (
    <div className="push-opt-in">
      <span>🔔 Get instant raid alerts</span>
      <button className="btn push-opt-in-btn" onClick={subscribe} disabled={status === "loading"}>
        {status === "loading" ? "Enabling…" : "Enable notifications"}
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
