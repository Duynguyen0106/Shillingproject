"use client";

import { useEffect, useState, useCallback } from "react";
import ConnectWalletButton from "./ConnectWalletButton";
import LinkXHandle from "./LinkXHandle";
import { useConnectedWallet } from "../lib/useConnectedWallet";
import { API_BASE } from "../lib/config";
import { authHeaders } from "../lib/session";

type Step = "connect" | "community" | "xverify" | "quest" | "done";

export default function OnboardingWizard({ onDone }: { onDone?: () => void }) {
  const { connected, wallet } = useConnectedWallet();
  const [step, setStep] = useState<Step>("connect");
  const [contractInput, setContractInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{ id: string; name: string; ticker: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [xHandle, setXHandle] = useState<string | null>(null);
  const [xVerified, setXVerified] = useState(false);
  const [xVerifyToken, setXVerifyToken] = useState<string | null>(null);
  const [quest, setQuest] = useState<{ description: string; pointBonus: number } | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralApplied, setReferralApplied] = useState(false);

  // Auto-read referral code from URL on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setReferralCode(ref);
  }, []);

  // Auto-apply referral when user connects
  const applyReferral = useCallback(async (code: string) => {
    if (referralApplied) return;
    try {
      const res = await fetch(`${API_BASE}/referral/use`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code }),
      });
      if (res.ok) setReferralApplied(true);
    } catch { /* ignore */ }
  }, [referralApplied]);

  // Load user X status once connected
  const loadMe = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/me`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setXHandle(data.xHandle || null);
        setXVerified(Boolean(data.xVerified));
        setXVerifyToken(data.xVerifyToken || null);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (connected && step === "connect") {
      void loadMe();
      if (referralCode) void applyReferral(referralCode);
      setStep("community");
    }
  }, [connected, step, referralCode, applyReferral, loadMe]);

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
        const bind = await fetch(`${API_BASE}/communities/from-token`, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
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

  async function joinAndContinue() {
    if (!found) return;
    if (typeof window !== "undefined") {
      try { localStorage.setItem("shillops-community", JSON.stringify(found)); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent("shillops-community"));
    }
    // Load today's quest
    try {
      const res = await fetch(`${API_BASE}/communities/${found.id}/daily-quest`, { headers: authHeaders() });
      if (res.ok) setQuest(await res.json());
    } catch { /* ignore */ }
    setStep("xverify");
  }

  const steps: Step[] = ["connect", "community", "xverify", "quest", "done"];
  const stepLabels = ["Connect wallet", "Pick a community", "Verify X", "Daily quest", "Start raiding"];
  const stepIdx = steps.indexOf(step);

  return (
    <div className="onboarding-wizard">
      {referralCode && referralApplied && (
        <div className="onboarding-referral-banner">
          🔗 Referral applied — your friend earned a bonus!
        </div>
      )}

      <div className="onboarding-steps">
        {stepLabels.map((label, i) => (
          <div key={i} className={`onboarding-step ${i <= stepIdx ? "active" : ""}`}>
            <span className="onboarding-step-num">{i + 1}</span>
            <span className="onboarding-step-label">{label}</span>
          </div>
        ))}
      </div>

      {/* STEP 1 — Connect */}
      {step === "connect" && (
        <div className="card onboarding-card">
          <div className="kicker">Step 1 of 5</div>
          <h2>Connect your wallet</h2>
          <p className="muted">Your wallet is your identity in ShillOps. No email needed.</p>
          {referralCode && (
            <p className="onboarding-ref-note">🔗 You were invited! Your referral will be applied automatically.</p>
          )}
          <ConnectWalletButton />
        </div>
      )}

      {/* STEP 2 — Community */}
      {step === "community" && (
        <div className="card onboarding-card">
          <div className="kicker">Step 2 of 5</div>
          <h2>Pick your community</h2>
          <p className="muted">Paste a contract address or DexScreener URL to join or create a community.</p>
          <div className="onboarding-discover-link">
            <a href="/app/discover">Browse all communities →</a>
          </div>
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
                <button className="btn secondary" onClick={() => setStep("xverify")}>Skip for now</button>
              </div>
            </>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 12, padding: "0.75rem 1rem" }}>
                <strong>{found.name}</strong>
                <span className="badge" style={{ marginLeft: 8 }}>${found.ticker}</span>
              </div>
              <button className="btn" onClick={joinAndContinue}>Join this community →</button>
            </>
          )}
        </div>
      )}

      {/* STEP 3 — X verify */}
      {step === "xverify" && (
        <div className="card onboarding-card">
          <div className="kicker">Step 3 of 5</div>
          <h2>Verify your X account</h2>
          <p className="muted">
            Link your X handle so ShillOps can auto-score your replies. Verified raiders get replies scored automatically — no manual proof needed.
          </p>
          <LinkXHandle
            xHandle={xHandle}
            xVerified={xVerified}
            xVerifyToken={xVerifyToken}
            onUpdated={() => { setXVerified(true); }}
          />
          <div className="row" style={{ marginTop: "1rem" }}>
            {xVerified && <button className="btn" onClick={() => setStep("quest")}>Continue →</button>}
            <button className="btn secondary" onClick={() => setStep("quest")}>Skip for now</button>
          </div>
        </div>
      )}

      {/* STEP 4 — Daily quest */}
      {step === "quest" && (
        <div className="card onboarding-card">
          <div className="kicker">Step 4 of 5</div>
          <h2>Today&apos;s quest</h2>
          {quest ? (
            <>
              <p className="muted">Complete your daily quest to earn bonus points on day one.</p>
              <div className="onboarding-quest-card">
                <span className="onboarding-quest-bonus">+{quest.pointBonus} pts</span>
                <p>{quest.description}</p>
              </div>
            </>
          ) : (
            <p className="muted">Join a community to unlock daily quests. Earn +25 pts every day you check in.</p>
          )}
          <button className="btn" style={{ marginTop: "1rem" }} onClick={() => setStep("done")}>Continue →</button>
        </div>
      )}

      {/* STEP 5 — Done */}
      {step === "done" && (
        <div className="card onboarding-card">
          <div className="kicker">You&apos;re in</div>
          <h2>Ready to raid 🚀</h2>
          <p className="muted">Open the raid feed to shill KOL posts and earn points. The more you raid, the more you earn.</p>
          <div className="onboarding-done-grid">
            <a className="btn" href="/app/feed">Open raid feed</a>
            <a className="btn secondary" href="/app/daily-quest">Daily quest ⚡</a>
            <a className="btn secondary" href="/app/seasons">Seasons 🏆</a>
            <a className="btn secondary" href="/app/referral">Invite friends 🔗</a>
          </div>
          {onDone && <button className="btn secondary" style={{ marginTop: "1rem", width: "100%" }} onClick={onDone}>Dismiss</button>}
        </div>
      )}
    </div>
  );
}
