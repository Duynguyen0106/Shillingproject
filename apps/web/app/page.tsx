import Link from "next/link";
import JoinCta from "./JoinCta";

export default function HomePage() {
  return (
    <main className="container">
      <h1>Memecoin Shill Ops</h1>
      <p>Signal detected → Mission created → Community executes → Impact measured → Contributors rewarded.</p>
      <div className="row" style={{ marginBottom: 16 }}>
        <Link href="/app" className="btn">Open Mission Board</Link>
      </div>
      <JoinCta />
    </main>
  );
}
