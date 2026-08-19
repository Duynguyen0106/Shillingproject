"use client";

import Link from "next/link";
import RaidScoreboard from "./RaidScoreboard";
import RaidLeaderboard from "./RaidLeaderboard";
import type { FocusRaid } from "../lib/shillAction";
import { getStoredCommunityId } from "../lib/community";

export default function FocusRaidCard({
  focus,
  compact = false
}: {
  focus: FocusRaid;
  compact?: boolean;
}) {
  const communityId = getStoredCommunityId();
  return (
    <div className="card focus-raid">
      <div className="kicker">Focus raid — everyone here</div>
      <h3>Reply to @{focus.authorHandle}</h3>
      {focus.text ? <p>{compact ? focus.text.slice(0, 160) : focus.text}</p> : null}
      <RaidScoreboard
        provedCount={focus.provedCount}
        liveRaiderCount={focus.liveRaiderCount}
        until={focus.until}
      />
      <div className="row">
        <Link className="btn" href="/app/feed">Open raid feed</Link>
        <a className="btn secondary" href={focus.url} target="_blank" rel="noreferrer">Open on X</a>
      </div>
      {focus.postId && communityId && (
        <RaidLeaderboard communityId={communityId} postId={focus.postId} compact />
      )}
    </div>
  );
}
