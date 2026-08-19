import ConnectWalletButton from "./ConnectWalletButton";
import CommunityBanner from "./CommunityBanner";
import LiveFeedToasts from "./LiveFeedToasts";
import NavFeedLink from "./NavFeedLink";
import PWAInit from "./PWAInit";
import PushOptIn from "./PushOptIn";
import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "ShillOps",
  description: "Coordinate memecoin raids. Earn points. Redeem your coin.",
  manifest: "/manifest.json",
  themeColor: "#6c47ff",
  appleWebApp: { capable: true, title: "ShillOps", statusBarStyle: "black-translucent" }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#6c47ff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ShillOps" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <nav className="nav">
          <Link href="/" className="brand">Shill Ops</Link>
          <NavFeedLink />
          <Link href="/app">Missions</Link>
          <Link href="/app/me">My Ops</Link>
          <Link href="/app/leaderboard">Communities</Link>
          <Link href="/app/proof-gallery">Gallery</Link>
          <Link href="/app/alliances">Alliances</Link>
          <Link href="/app/daily-quest">Daily Quest</Link>
          <Link href="/app/seasons">Seasons</Link>
          <Link href="/app/admin/signals">Signals</Link>
          <Link href="/app/admin/attribution">Attribution</Link>
          <Link href="/app/admin/notifications">Alerts</Link>
          <Link href="/app/admin/dashboard">Admin</Link>
          <ConnectWalletButton />
        </nav>
        <CommunityBanner />
        <PushOptIn />
        {children}
        <LiveFeedToasts />
        <PWAInit />
      </body>
    </html>
  );
}
