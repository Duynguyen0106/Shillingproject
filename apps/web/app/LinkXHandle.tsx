"use client";

import { useState } from "react";
import { API_BASE } from "../lib/config";
import { authHeaders } from "../lib/session";

type Props = {
  xHandle?: string | null;
  xVerified?: boolean;
  xVerifyToken?: string | null;
  onUpdated: () => void;
};

export default function LinkXHandle({ xHandle, xVerified, xVerifyToken, onUpdated }: Props) {
  const [mode, setMode] = useState<"idle" | "linking" | "verifying">("idle");
  const [input, setInput] = useState("");
  const [token, setToken] = useState<string | null>(xVerifyToken ?? null);
  const [verifyTweetText, setVerifyTweetText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitHandle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/me/x-handle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ handle: input.trim() })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setToken(data.verifyToken);
      setVerifyTweetText(data.verifyTweetText);
      setMode("verifying");
      onUpdated();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function submitVerify() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/me/x-handle/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() }
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setMode("idle");
      onUpdated();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function removeHandle() {
    setLoading(true);
    setError(null);
    try {
      await fetch(`${API_BASE}/me/x-handle`, {
        method: "DELETE",
        headers: authHeaders()
      });
      setMode("idle");
      setToken(null);
      setVerifyTweetText(null);
      onUpdated();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (xHandle && xVerified) {
    return (
      <div className="card">
        <div className="row">
          <span className="badge">X Verified</span>
          <span>@{xHandle}</span>
          <button className="btn secondary small" onClick={removeHandle} disabled={loading}>
            Unlink
          </button>
        </div>
        <p className="muted">Your replies are auto-scored when you raid.</p>
      </div>
    );
  }

  if (xHandle && !xVerified) {
    const tweetToken = token ?? xVerifyToken;
    const tweetText = verifyTweetText ?? (tweetToken ? `Verifying my @ShillOps wallet: ${tweetToken}` : null);
    return (
      <div className="card">
        <div className="kicker">Verify your X account</div>
        <p>@{xHandle} is linked but not yet verified.</p>
        {tweetText && (
          <>
            <p className="muted">Post this tweet from @{xHandle}, then click Verify:</p>
            <div className="copy-block">
              <code>{tweetText}</code>
              <a
                className="btn secondary small"
                href={`https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
                target="_blank"
                rel="noreferrer"
              >
                Post on X
              </a>
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn" onClick={submitVerify} disabled={loading}>
            {loading ? "Checking…" : "I posted it — verify me"}
          </button>
          <button className="btn secondary small" onClick={removeHandle} disabled={loading}>
            Change handle
          </button>
        </div>
      </div>
    );
  }

  if (mode === "linking") {
    return (
      <div className="card">
        <div className="kicker">Link your X account</div>
        <p className="muted">Enter your X handle so your replies can be auto-scored.</p>
        <input
          className="input"
          type="text"
          placeholder="@yourhandle"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitHandle()}
        />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn" onClick={submitHandle} disabled={loading || !input.trim()}>
            {loading ? "Saving…" : "Save handle"}
          </button>
          <button className="btn secondary" onClick={() => { setMode("idle"); setError(null); }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row">
        <span className="muted">X account</span>
        <span className="muted">Not linked</span>
        <button className="btn small" onClick={() => setMode("linking")}>
          Link X account
        </button>
      </div>
      <p className="muted">Link your X handle so your raid replies are auto-scored — no pasting proof URLs needed.</p>
    </div>
  );
}
