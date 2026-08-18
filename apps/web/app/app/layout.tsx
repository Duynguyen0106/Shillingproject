import Link from "next/link";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="nav">
        <Link href="/">Shill Ops</Link>
        <Link href="/app">Missions</Link>
        <Link href="/app/leaderboard">Leaderboard</Link>
        <Link href="/app/admin/signals">Signals</Link>
        <Link href="/app/admin/attribution">Attribution</Link>
      </nav>
      {children}
    </>
  );
}
