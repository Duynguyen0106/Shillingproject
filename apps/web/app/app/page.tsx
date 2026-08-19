import Link from "next/link";
import ActivityFeed from "../ActivityFeed";
import FocusRaidCard from "../FocusRaidCard";
import { getRequestCommunityId } from "../../lib/communityServer";
import { apiGetSafe } from "../../lib/api";
import { formatRemaining } from "../../lib/missionTime";
import type { FocusRaid } from "../../lib/shillAction";

type Mission = {
  id: string;
  title: string;
  description: string;
  priority: string;
  urgency: number;
  status: string;
  claimsCount?: number;
  checkInCount?: number;
  remainingMs?: number | null;
  shortLinks?: { code: string; clicks?: number }[];
};

export default async function MissionBoardPage() {
  const communityId = getRequestCommunityId();
  const [missions, community] = await Promise.all([
    apiGetSafe<Mission[]>(`/communities/${communityId}/missions?status=active`, []),
    apiGetSafe<{ focus?: FocusRaid | null }>(`/communities/${communityId}`, { focus: null })
  ]);
  const sorted = [...missions].sort((a, b) => b.urgency - a.urgency);
  return (
    <main className="container">
      <div className="kicker">Top actions now</div>
      <h1>Mission Board</h1>
      <p className="muted">
        Use the <Link href="/app/feed">raid feed</Link> to click KOL posts and mentions. This board is the scored raid that opens from those posts.
      </p>
      {community.focus && <FocusRaidCard focus={community.focus} />}
      {sorted.length === 0 && (
        <div className="card">
          <p>No community bound yet, so a daily pulse could not be created. Bind a mint first, then ingest a signal to overlay a raid.</p>
          <Link href="/">Find a contract</Link>
        </div>
      )}
      {sorted.map((m) => (
        <div key={m.id} className="card">
          <h3>{m.title}</h3>
          <p className="muted">{m.description}</p>
          <div className="row">
            <span className={`badge ${m.priority === "HIGH" ? "high" : ""}`}>Priority: {m.priority}</span>
            <span>Urgency: {m.urgency}</span>
            <span>Status: {m.status}</span>
            {typeof m.remainingMs === "number" && <span>{formatRemaining(m.remainingMs)}</span>}
            <span>Claims: {m.claimsCount ?? 0}</span>
            {typeof m.checkInCount === "number" && <span>{m.checkInCount} in</span>}
            {typeof m.shortLinks?.[0]?.clicks === "number" && <span>Clicks: {m.shortLinks[0].clicks}</span>}
            <Link href={`/app/missions/${m.id}`}>Open mission</Link>
          </div>
        </div>
      ))}
      <ActivityFeed communityId={communityId} />
    </main>
  );
}
