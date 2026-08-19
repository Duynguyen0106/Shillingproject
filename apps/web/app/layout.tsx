import ConnectWalletButton from "./ConnectWalletButton";
import CommunityBanner from "./CommunityBanner";
import LiveFeedToasts from "./LiveFeedToasts";
import NavFeedLink from "./NavFeedLink";
import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="brand">Shill Ops</Link>
          <NavFeedLink />
          <Link href="/app">Missions</Link>
          <Link href="/app/me">My Ops</Link>
          <Link href="/app/leaderboard">Leaderboard</Link>
          <Link href="/app/admin/signals">Signals</Link>
          <Link href="/app/admin/attribution">Attribution</Link>
          <Link href="/app/admin/notifications">Alerts</Link>
          <Link href="/app/admin/dashboard">Admin</Link>
          <ConnectWalletButton />
        </nav>
        <CommunityBanner />
        {children}
        <LiveFeedToasts />
      </body>
    </html>
  );
}
