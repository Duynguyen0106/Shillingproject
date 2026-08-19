"use client";

import { useState } from "react";
import { API_BASE } from "../lib/config";
import { buildShareCopy } from "../lib/shareCopy";
import { useContributorProfile } from "../lib/useContributorProfile";

type ShareKitProps = {
  missionId: string;
  title: string;
  signalType?: string;
  metadata?: Record<string, unknown>;
  communityCode?: string;
};

export default function ShareKit({ missionId, title, signalType, metadata, communityCode }: ShareKitProps) {
  const { profile, connected } = useContributorProfile();
  const [copied, setCopied] = useState<string | null>(null);
  const personal = profile?.links?.find((link) => link.missionId === missionId);
  const code = personal?.code || communityCode;
  if (!code) return null;
  const ctaUrl = `${API_BASE}/r/${code}`;
  const copySet = buildShareCopy({ title, signalType, metadata, ctaUrl });

  async function copy(kind: keyof typeof copySet) {
    try {
      await navigator.clipboard.writeText(copySet[kind]);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="card">
      <h3>Share this mission</h3>
      <p className="muted">
        {personal
          ? "Copy includes your personal CTA. Unique clicks award points (2 on HIGH missions)."
          : connected
            ? "Claim the mission to swap in your personal CTA before sharing."
            : "Connect, claim, then share so clicks count as your impact."}
      </p>
      <div className="row">
        <button className="btn secondary" type="button" onClick={() => void copy("x")}>
          {copied === "x" ? "Copied X" : "Copy for X"}
        </button>
        <button className="btn secondary" type="button" onClick={() => void copy("telegram")}>
          {copied === "telegram" ? "Copied Telegram" : "Copy for Telegram"}
        </button>
        <button className="btn secondary" type="button" onClick={() => void copy("discord")}>
          {copied === "discord" ? "Copied Discord" : "Copy for Discord"}
        </button>
      </div>
    </div>
  );
}
