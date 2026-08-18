import Link from "next/link";
import { apiGetSafe } from "../../lib/api";
import { COMMUNITY_ID } from "../../lib/config";

type Mission = {
  id: string;
  title: string;
  description: string;
  priority: string;
  urgency: number;
  status: string;
  claimsCount?: number;
  shortLinks?: { code: string; clicks?: number }[];
};

export default async function MissionBoardPage() {
  const missions = await apiGetSafe<Mission[]>(`/communities/${COMMUNITY_ID}/missions?status=active`, []);
  const sorted = [...missions].sort((a, b) => b.urgency - a.urgency);
  return (
    <main className="container">
      <div className="kicker">Top actions now</div>
      <h1>Mission Board</h1>
      <p className="muted">Highest urgency first. Claim a mission, submit proof, earn points.</p>
      {sorted.length === 0 && (
        <div className="card">
          <p>No active missions yet. Ingest a mock signal to auto-create one.</p>
          <Link href="/app/admin/signals">Go to Signals admin</Link>
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
            <span>Claims: {m.claimsCount ?? 0}</span>
            {typeof m.shortLinks?.[0]?.clicks === "number" && <span>Clicks: {m.shortLinks[0].clicks}</span>}
            <Link href={`/app/missions/${m.id}`}>Open mission</Link>
          </div>
        </div>
      ))}
    </main>
  );
}
