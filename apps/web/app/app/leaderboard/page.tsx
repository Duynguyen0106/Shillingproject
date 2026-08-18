import { apiGet } from "../../../lib/api";

type Row = {
  rank: number;
  wallet: string;
  displayName?: string;
  points: number;
};

const COMMUNITY_ID = process.env.NEXT_PUBLIC_DEMO_COMMUNITY_ID || "demo-community";

export default async function LeaderboardPage() {
  const rows = await apiGet<Row[]>(`/communities/${COMMUNITY_ID}/leaderboard`);
  return (
    <main className="container">
      <h1>Leaderboard</h1>
      {rows.map((row) => (
        <div key={row.rank} className="card">
          #{row.rank} {row.displayName || row.wallet} — {row.points} pts
        </div>
      ))}
    </main>
  );
}
