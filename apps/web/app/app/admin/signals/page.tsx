import SignalIngestForm from "./SignalIngestForm";
import { apiGetSafe } from "../../../../lib/api";
import { COMMUNITY_ID } from "../../../../lib/config";

type Signal = {
  id: string;
  type: string;
  severity: number;
  createdAt: string;
  sourceRef?: string;
};

export default async function AdminSignalsPage() {
  const signals = await apiGetSafe<Signal[]>(`/communities/${COMMUNITY_ID}/signals`, []);
  return (
    <main className="container">
      <h1>Admin: Signals</h1>
      <p className="muted">Post a mock signal to auto-create a mission and fire Telegram/Discord alerts.</p>
      <SignalIngestForm />
      {signals.length === 0 && <p>No signals stored yet.</p>}
      {signals.map((signal) => (
        <div key={signal.id} className="card">
          <strong>{signal.type}</strong> | severity {signal.severity}
          {signal.sourceRef ? ` | ${signal.sourceRef}` : ""}
        </div>
      ))}
    </main>
  );
}
