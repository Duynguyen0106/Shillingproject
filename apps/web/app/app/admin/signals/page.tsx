import SignalIngestForm from "./SignalIngestForm";
import { getRequestCommunityId } from "../../../../lib/communityServer";
import { apiGetSafe } from "../../../../lib/api";

type Signal = {
  id: string;
  type: string;
  severity: number;
  createdAt: string;
  sourceRef?: string;
};

export default async function AdminSignalsPage() {
  const communityId = getRequestCommunityId();
  const signals = await apiGetSafe<Signal[]>(`/communities/${communityId}/signals`, []);
  return (
    <main className="container">
      <h1>Admin: Signals</h1>
      <p className="muted">Post a mock signal against a bound mint to auto-create a mission. Ticker-only ingest is blocked.</p>
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
