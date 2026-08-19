"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConnectWalletButton from "./ConnectWalletButton";
import { useConnectedWallet } from "../lib/useConnectedWallet";
import { API_BASE } from "../lib/config";
import { authHeaders } from "../lib/session";

type Step = "connect" | "community" | "feed";

export default function OnboardingWizard({ onDone }: { onDone?: () => void }) {
  const { connected, wallet } = useConnectedWallet();
  const router = useRouter();
  const [step, setStep] = useState<Step>("connect");
  const [contractInput, setContractInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{ id: string; name: string; ticker: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (connected && step === "connect") setStep("community");
  }, [connected, step]);

  async function searchContract() {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/tokens/lookup?q=${encodeURIComponent(contractInput.trim())}&wallet=${wallet ?? ""}`, {
        headers: authHeaders()
      });
      const data = await res.json();
      if (data.community?.id) {
        setFound(data.community);
      } else if (data.id) {
        // bind
        const bind = await fetch(`${API_BASE}/communities/from-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ q: contractInput.trim(), wallet })
        });
        const community = await bind.json();
        if (community?.id) setFound(community);
        else setError("Could not find or create a community for this token.");
      } else {
        setError("Token not found. Paste a contract address or DexScreener URL.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSearching(false);
    }
  }

  function joinAndContinue() {
    if (!found) return;
    // Store community selection
    if (typeof window !== "undefined") {
      try { localStorage.setItem("shillops-community", JSON.stringify(found)); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent("shillops-community"));
    }
    setStep("feed");
  }

  const steps: Step[] = ["connect", "community", "feed"];
  const stepIdx = steps.indexOf(step);

  return (
    <div className="onboarding-wizard">
      <div className="onboarding-steps">
        {["Connect wallet", "Pick a community", "Start raiding"].map((label, i) => (
          <div key={i} className={`onboarding-step ${i <= stepIdx ? "active" : ""}`}>
            <span className="onboarding-step-num">{i + 1}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {step === "connect" && (
        <div className="card">
          <div className="kicker">Step 1</div>
          <h2>Connect your wallet</h2>
          <p className="muted">Your wallet is your identity in Shill Ops. No email needed.</p>
          <ConnectWalletButton />
        </div>
      )}

      {step === "community" && (
        <div className="card">
          <div className="kicker">Step 2</div>
          <h2>Pick your community</h2>
          <p className="muted">Paste a contract address or DexScreener URL to join or create a community.</p>
          {!found ? (
            <>
              <input
                className="input"
                type="text"
                placeholder="Contract address or DexScreener URL…"
                value={contractInput}
                onChange={(e) => setContractInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void searchContract()}
              />
              {error && <p className="error">{error}</p>}
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => void searchContract()} disabled={searching || !contractInput.trim()}>
                  {searching ? "Searching…" : "Find community"}
                </button>
                <button className="btn secondary" onClick={() => setStep("feed")}>Skip for now</button>
              </div>
            </>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 12 }}>
                <strong>{found.name}</strong>
                <span className="badge" style={{ marginLeft: 8 }}>${found.ticker}</span>
              </div>
              <button className="btn" onClick={joinAndContinue}>Join this community</button>
            </>
          )}
        </div>
      )}

      {step === "feed" && (
        <div className="card">
          <div className="kicker">Step 3</div>
          <h2>You&apos;re ready to raid</h2>
          <p className="muted">Open the raid feed to shill KOL posts and earn points. Link your X account to auto-score replies.</p>
          <div className="row">
            <a className="btn" href="/app/feed">Open raid feed</a>
            <a className="btn secondary" href="/app/me">My Ops</a>
            {onDone && <button className="btn secondary" onClick={onDone}>Dismiss</button>}
          </div>
        </div>
      )}
    </div>
  );
}
