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
};

export default async function MissionBoardPage() {
  const missions = await apiGetSafe<Mission[]>(`/communities/${COMMUNITY_ID}/missions?status=active`, []);
  return (
    <main className="container">
      <h1>Mission Board</h1>
      <p>Top actions now for the community.</p>
      {missions.length === 0 && (
        <div className="card">
          <p>No active missions yet. Ingest a mock signal to auto-create one.</p>
          <Link href="/app/admin/signals">Go to Signals admin</Link>
        </div>
      )}
      {missions.map((m) => (
        <div key={m.id} className="card">
          <h3>{m.title}</h3>
          <p>{m.description}</p>
          <div className="row">
            <span className={`badge ${m.priority === "HIGH" ? "high" : ""}`}>Priority: {m.priority}</span>
            <span>Urgency: {m.urgency}</span>
            <span>Status: {m.status}</span>
            <Link href={`/app/missions/${m.id}`}>Open mission</Link>
          </div>
        </div>
      ))}
    </main>
  );
}
