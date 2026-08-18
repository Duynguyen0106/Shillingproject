import Link from "next/link";
import { apiGetSafe } from "../../../lib/api";
import { COMMUNITY_ID } from "../../../lib/config";

type Row = {
  rank: number;
  wallet: string;
  displayName?: string;
  points: number;
};

export default async function LeaderboardPage() {
  const rows = await apiGetSafe<Row[]>(`/communities/${COMMUNITY_ID}/leaderboard`, []);
  return (
    <main className="container">
      <div className="kicker">Transparent points</div>
      <h1>Leaderboard</h1>
      <p className="muted">Scored from verified submissions. Early replies and high-priority missions pay more.</p>
      {rows.length === 0 && (
        <div className="card">
          <p>No scores yet. Submit proof on a mission to earn points.</p>
          <Link href="/app">Back to missions</Link>
        </div>
      )}
      {rows.map((row) => (
        <div key={row.rank} className="card row">
          <div className="rank">#{row.rank}</div>
          <div>
            <strong>{row.displayName || row.wallet}</strong>
            <div className="muted">{row.wallet}</div>
          </div>
          <div style={{ marginLeft: "auto" }}>{row.points} pts</div>
        </div>
      ))}
    </main>
  );
}
