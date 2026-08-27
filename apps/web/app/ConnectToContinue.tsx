"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ConnectWalletButton from "./ConnectWalletButton";
import { getStoredToken } from "../lib/session";

type Props = {
  /** Page heading shown above the gate and content */
  title: string;
  kicker?: string;
  description?: string;
  /** Shown inside the connect card */
  gateTitle?: string;
  gateDescription?: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  /** Extra links below connect button (e.g. onboarding) */
  footer?: ReactNode;
};

export function useAuthedSession() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const sync = () => setConnected(Boolean(getStoredToken()));
    sync();
    window.addEventListener("shillops-session", sync);
    return () => window.removeEventListener("shillops-session", sync);
  }, []);
  return connected;
}

/** Full-page shell: shows connect gate until wallet session exists. */
export default function ConnectToContinue({
  title,
  kicker,
  description,
  gateTitle = "Connect your wallet",
  gateDescription = "Sign in with your wallet to use this feature. No email required — SIWE keeps your session secure.",
  children,
  backHref,
  backLabel = "← Back",
  footer
}: Props) {
  const connected = useAuthedSession();

  return (
    <main className="container">
      {kicker && <div className="kicker">{kicker}</div>}
      <h1>{title}</h1>
      {description && <p className="muted page-lead">{description}</p>}

      {!connected ? (
        <div className="card connect-gate">
          <div className="connect-gate-icon" aria-hidden>🔗</div>
          <h2 className="connect-gate-title">{gateTitle}</h2>
          <p className="muted connect-gate-desc">{gateDescription}</p>
          <ConnectWalletButton />
          <div className="connect-gate-hints">
            <Link href="/app/onboarding" className="btn secondary">New here? Get started →</Link>
          </div>
          {footer}
        </div>
      ) : (
        children
      )}

      {backHref && (
        <p className="page-back">
          <Link href={backHref}>{backLabel}</Link>
        </p>
      )}
    </main>
  );
}

/** Inline gate for sections that need wallet only for part of the page. */
export function WalletGate({
  title = "Connect to continue",
  description,
  children
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const connected = useAuthedSession();
  if (connected) return <>{children}</>;
  return (
    <div className="card connect-gate connect-gate-inline">
      <div className="connect-gate-icon" aria-hidden>🔗</div>
      <h3 className="connect-gate-title">{title}</h3>
      {description && <p className="muted connect-gate-desc">{description}</p>}
      <ConnectWalletButton />
    </div>
  );
}
