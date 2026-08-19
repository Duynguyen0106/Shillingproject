"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectWalletButton from "./ConnectWalletButton";
import CommunityBanner from "./CommunityBanner";
import LiveFeedToasts from "./LiveFeedToasts";
import MobileNav from "./MobileNav";
import NavFeedLink from "./NavFeedLink";
import PushOptIn from "./PushOptIn";
import ApiStatusBanner from "./ApiStatusBanner";

/** Routes that use their own chrome (landing nav, embed widget). */
function usesAppChrome(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === "/") return false;
  if (pathname.startsWith("/embed/")) return false;
  return true;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showChrome = usesAppChrome(pathname);

  return (
    <>
      {showChrome && (
        <>
          <nav className="nav desktop-only" aria-label="Main">
            <Link href="/" className="brand">Shill Ops</Link>
            <NavFeedLink />
            <Link href="/app" className={pathname === "/app" ? "nav-active" : undefined}>Missions</Link>
            <Link href="/app/me" className={pathname?.startsWith("/app/me") ? "nav-active" : undefined}>My Ops</Link>
            <Link href="/app/discover" className={pathname?.startsWith("/app/discover") ? "nav-active" : undefined}>Discover</Link>
            <Link href="/app/leaderboard" className={pathname?.startsWith("/app/leaderboard") ? "nav-active" : undefined}>Communities</Link>
            <Link href="/app/daily-quest" className={pathname?.startsWith("/app/daily-quest") ? "nav-active" : undefined}>Quest</Link>
            <Link href="/app/seasons" className={pathname?.startsWith("/app/seasons") ? "nav-active" : undefined}>Seasons</Link>
            <Link href="/app/notifications" className={pathname?.startsWith("/app/notifications") ? "nav-active" : undefined} aria-label="Notifications">🔔</Link>
            <Link href="/app/admin/dashboard" className={pathname?.startsWith("/app/admin") ? "nav-active" : undefined}>Admin</Link>
            <ConnectWalletButton />
          </nav>

          <div className="mobile-only">
            <MobileNav />
          </div>
          <div className="mobile-only mobile-body-offset" aria-hidden />

          <CommunityBanner />
          <ApiStatusBanner />
          <PushOptIn />
        </>
      )}

      <div className={showChrome ? "app-main" : undefined}>{children}</div>

      {showChrome && <LiveFeedToasts />}
      {showChrome && <div className="mobile-only bottom-nav-spacer" aria-hidden />}
    </>
  );
}
