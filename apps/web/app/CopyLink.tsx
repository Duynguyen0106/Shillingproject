"use client";

import { useState } from "react";
import { API_BASE } from "../lib/config";

export default function CopyLink({ code, clicks }: { code: string; clicks?: number }) {
  const url = `${API_BASE}/r/${code}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="tracked-cta">
      <a href={url} target="_blank" rel="noreferrer"><code>{url}</code></a>
      <button className="btn secondary" type="button" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy"}
      </button>
      {typeof clicks === "number" && <span className="muted">{clicks} clicks</span>}
    </div>
  );
}
