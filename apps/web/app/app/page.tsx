import Link from "next/link";
import ActivityFeed from "../ActivityFeed";
import { getRequestCommunityId } from "../../lib/communityServer";
import { apiGetSafe } from "../../lib/api";
import { formatRemaining } from "../../lib/missionTime";

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
  const missions = await apiGetSafe<Mission[]>(`/communities/${communityId}/missions?status=active`, []);
  const sorted = [...missions].sort((a, b) => b.urgency - a.urgency);
  return (
    <main className="container">
      <div className="kicker">Top actions now</div>
      <h1>Mission Board</h1>
      <p className="muted">Highest urgency first. HIGH missions expire in 2 hours, MEDIUM in 6, LOW in 24. An empty board gets a daily pulse automatically — live KOL/mention/whale raids overlay on top of those standing plays.</p>
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
