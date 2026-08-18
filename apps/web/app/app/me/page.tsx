"use client";

import ConnectWalletButton from "../../ConnectWalletButton";
import Link from "next/link";
import { useContributorProfile } from "../../../lib/useContributorProfile";
import { shortAddress } from "../../../lib/session";

export default function MyOpsPage() {
  const { profile, loading, connected, wallet, label } = useContributorProfile();

  if (!connected) {
    return (
      <main className="container">
        <div className="kicker">Impact measured</div>
        <h1>My Ops</h1>
        <div className="card">
          <p className="muted">Connect a wallet to see claims, submissions, and points.</p>
          <ConnectWalletButton />
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="kicker">Impact measured</div>
      <h1>My Ops</h1>
      <p className="muted">
        {label ? `${label} · ` : ""}
        {wallet ? shortAddress(wallet) : ""}
        {profile?.displayName ? ` · ${profile.displayName}` : ""}
      </p>
      {loading && !profile && <p className="muted">Loading your ops...</p>}
      <div className="stats">
        <div className="stat">
          <span className="muted">Points</span>
          <strong>{profile?.points ?? 0}</strong>
        </div>
        <div className="stat">
          <span className="muted">Rank</span>
          <strong>{profile?.rank ? `#${profile.rank}` : "—"}</strong>
        </div>
        <div className="stat">
          <span className="muted">Claims</span>
          <strong>{profile?.claims.length ?? 0}</strong>
        </div>
        <div className="stat">
          <span className="muted">Proofs</span>
          <strong>{profile?.submissions.length ?? 0}</strong>
        </div>
      </div>
      <p>
        <Link href="/app/leaderboard">Open leaderboard</Link>
      </p>
      <h2>Claimed missions</h2>
      {(profile?.claims.length ?? 0) === 0 && (
        <div className="card">
          <p className="muted">No claims yet.</p>
          <Link href="/app">Go to the mission board</Link>
        </div>
      )}
      {profile?.claims.map((claim) => (
        <div key={claim.missionId} className="card">
          <h3>{claim.title}</h3>
          <div className="row">
            <span className={`badge ${claim.priority === "HIGH" ? "high" : ""}`}>{claim.priority}</span>
            <span>Status: {claim.status}</span>
            <Link href={`/app/missions/${claim.missionId}`}>Open mission</Link>
          </div>
        </div>
      ))}
      <h2>Scored submissions</h2>
      {(profile?.submissions.length ?? 0) === 0 && (
        <div className="card">
          <p className="muted">Submit proof on a claimed mission to earn points.</p>
        </div>
      )}
      {profile?.submissions.map((submission) => (
        <div key={submission.id} className="card">
          <strong>{submission.taskTitle}</strong>
          <p className="muted">{submission.missionTitle}</p>
          <div className="row">
            <span>{submission.pointsAwarded} pts</span>
            {submission.isVerified && <span className="badge">Verified</span>}
            <a href={submission.proofUrl} target="_blank" rel="noreferrer">Proof</a>
            <Link href={`/app/missions/${submission.missionId}`}>Mission</Link>
          </div>
        </div>
      ))}
    </main>
  );
}
