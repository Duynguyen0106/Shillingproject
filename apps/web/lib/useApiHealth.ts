"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./config";

export type ApiStatus = "checking" | "online" | "offline";

export function useApiHealth(pollMs = 30_000) {
  const [status, setStatus] = useState<ApiStatus>("checking");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      });
      setStatus(res.ok ? "online" : "offline");
    } catch {
      setStatus("offline");
    }
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    void check();
    const id = setInterval(() => void check(), pollMs);
    return () => clearInterval(id);
  }, [check, pollMs]);

  return { status, lastChecked, retry: check };
}
