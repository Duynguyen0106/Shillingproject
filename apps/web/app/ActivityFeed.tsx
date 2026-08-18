import { apiGetSafe } from "../lib/api";
import { COMMUNITY_ID } from "../lib/config";

function shortWallet(wallet: string): string {
  if (wallet.length < 10) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

type ActivityEvent = {
  type: "CLAIM" | "SUBMISSION" | "CLICK";
  at: string;
  wallet: string;
  displayName?: string | null;
  title: string;
  points: number | null;
};

const labels: Record<ActivityEvent["type"], string> = {
  CLAIM: "claimed",
  SUBMISSION: "submitted proof on",
  CLICK: "drove a click"
};

export default async function ActivityFeed() {
  const events = await apiGetSafe<ActivityEvent[]>(`/communities/${COMMUNITY_ID}/activity`, []);
  return (
    <section>
      <h2>Live ops</h2>
      <p className="muted">Claims, proofs, and attributed CTA clicks from the demo community.</p>
      {events.length === 0 && (
        <div className="card">
          <p className="muted">No community activity yet. Claim a mission to start the feed.</p>
        </div>
      )}
      {events.map((event, index) => (
        <div key={`${event.type}-${event.at}-${index}`} className="card">
          <div className="row">
            <span className="badge">{event.type}</span>
            <strong>{event.displayName || shortWallet(event.wallet)}</strong>
            <span className="muted">{labels[event.type]} {event.title}</span>
            {event.points != null && <span>{event.points} pts</span>}
          </div>
        </div>
      ))}
    </section>
  );
}
