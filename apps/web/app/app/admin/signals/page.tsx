import { apiGet } from "../../../../lib/api";

type Signal = {
  id: string;
  type: string;
  severity: number;
  createdAt: string;
};

const COMMUNITY_ID = process.env.NEXT_PUBLIC_DEMO_COMMUNITY_ID || "demo-community";

export default async function AdminSignalsPage() {
  const signals = await apiGet<Signal[]>(`/communities/${COMMUNITY_ID}/signals`);
  return (
    <main className="container">
      <h1>Admin: Signals</h1>
      {signals.map((signal) => (
        <div key={signal.id} className="card">
          <strong>{signal.type}</strong> | severity {signal.severity}
        </div>
      ))}
    </main>
  );
}
