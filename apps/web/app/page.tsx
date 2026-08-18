import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <h1>Memecoin Shill Ops</h1>
      <p>Coordinate community action from signal to mission to growth.</p>
      <div className="row">
        <Link href="/app" className="btn">Open Mission Board</Link>
      </div>
    </main>
  );
}
