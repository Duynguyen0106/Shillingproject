import Link from "next/link";
import { apiGet } from "../../lib/api";

type Mission = {
  id: string;
  title: string;
  description: string;
  priority: string;
  urgency: number;
  status: string;
};

const COMMUNITY_ID = process.env.NEXT_PUBLIC_DEMO_COMMUNITY_ID || "demo-community";

export default async function MissionBoardPage() {
  const missions = await apiGet<Mission[]>(`/communities/${COMMUNITY_ID}/missions?status=active`);
  return (
    <main className="container">
      <h1>Mission Board</h1>
      <p>Top actions now for the community.</p>
      {missions.map((m) => (
        <div key={m.id} className="card">
          <h3>{m.title}</h3>
          <p>{m.description}</p>
          <div className="row">
            <span>Priority: {m.priority}</span>
            <span>Urgency: {m.urgency}</span>
            <span>Status: {m.status}</span>
            <Link href={`/app/missions/${m.id}`}>Open mission</Link>
          </div>
        </div>
      ))}
      <div className="row">
        <Link href="/app/leaderboard">Leaderboard</Link>
        <Link href="/app/admin/signals">Admin Signals</Link>
        <Link href="/app/admin/attribution">Admin Attribution</Link>
      </div>
    </main>
  );
}
