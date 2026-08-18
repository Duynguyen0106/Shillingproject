import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="brand">Shill Ops</Link>
          <Link href="/app">Missions</Link>
          <Link href="/app/leaderboard">Leaderboard</Link>
          <Link href="/app/admin/signals">Signals</Link>
          <Link href="/app/admin/attribution">Attribution</Link>
          <Link href="/app/admin/notifications">Alerts</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
