import Link from "next/link";
import ActivityFeed from "./ActivityFeed";
import JoinCta from "./JoinCta";

export default function HomePage() {
  return (
    <main className="container">
      <section className="hero">
        <div className="kicker">Signal to action</div>
        <h1>Memecoin Shill Ops</h1>
        <p className="muted">
          Signal detected → Mission created → Community executes → Impact measured → Contributors rewarded.
        </p>
        <div className="row" style={{ margin: "18px 0 24px" }}>
          <Link href="/app" className="btn">Open Mission Board</Link>
          <Link href="/app/me" className="btn secondary">My Ops</Link>
          <Link href="/app/admin/signals" className="btn secondary">Ingest a signal</Link>
        </div>
      </section>
      <JoinCta />
      <ActivityFeed />
    </main>
  );
}
