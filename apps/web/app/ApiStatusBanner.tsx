"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useApiHealth } from "../lib/useApiHealth";
import { API_BASE } from "../lib/config";

const DISMISS_KEY = "shillops.api-banner.dismissed";

export default function ApiStatusBanner() {
  const pathname = usePathname();
  const { status, retry } = useApiHealth();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    }
  }, []);

  if (pathname === "/" || pathname?.startsWith("/embed/")) return null;
  if (status !== "offline" || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="api-status-banner" role="alert">
      <div className="api-status-banner-inner">
        <span className="api-status-icon" aria-hidden>⚠️</span>
        <div className="api-status-copy">
          <strong>API offline</strong>
          <span className="muted">
            ShillOps backend at <code>{API_BASE}</code> is not responding. Live feed, wallet sign-in, and points may not work until it is running.
          </span>
        </div>
        <div className="api-status-actions">
          <button type="button" className="btn btn-compact" onClick={() => void retry()}>
            Retry
          </button>
          <button type="button" className="api-status-dismiss" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
