"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectWalletButton from "./ConnectWalletButton";

const NAV_LINKS = [
  { href: "/app/feed",        label: "Raid Feed",      icon: "📣" },
  { href: "/app",             label: "Missions",        icon: "🎯" },
  { href: "/app/me",          label: "My Ops",          icon: "👤" },
  { href: "/app/daily-quest", label: "Daily Quest",     icon: "⚡" },
  { href: "/app/discover",    label: "Discover",        icon: "🔍" },
  { href: "/app/leaderboard", label: "Communities",     icon: "🏆" },
  { href: "/app/seasons",     label: "Seasons",         icon: "📅" },
  { href: "/app/alliances",   label: "Alliances",       icon: "⚔️" },
  { href: "/app/proof-gallery", label: "Gallery",       icon: "🖼" },
  { href: "/app/referral",    label: "Referrals",       icon: "🔗" },
  { href: "/app/redeem",      label: "Redeem",          icon: "🪙" },
  { href: "/app/notifications", label: "Notifications", icon: "🔔" },
  { href: "/app/admin/mission-builder", label: "Mission Builder", icon: "🛠" },
  { href: "/app/admin/kol-manager",     label: "KOL Manager",    icon: "🌟" },
  { href: "/app/admin/announcements",   label: "Announcements",  icon: "📢" },
  { href: "/app/admin/holder-tiers",    label: "Holder Tiers",   icon: "💎" },
  { href: "/app/admin/dashboard",       label: "Admin",          icon: "⚙️" },
];

const BOTTOM_NAV = [
  { href: "/app/feed",    label: "Feed",   icon: "📣" },
  { href: "/app",         label: "Raids",  icon: "🎯" },
  { href: "/app/me",      label: "Me",     icon: "👤" },
  { href: "/app/discover",label: "Find",   icon: "🔍" },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close menu on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Prevent body scroll when menu open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Top bar */}
      <nav className="mobile-topbar">
        <Link href="/" className="brand">Shill Ops</Link>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ConnectWalletButton />
          <button
            className="hamburger-btn"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            <span className={`hamburger-icon ${open ? "open" : ""}`}>
              <span /><span /><span />
            </span>
          </button>
        </div>
      </nav>

      {/* Drawer overlay */}
      {open && <div className="drawer-overlay" onClick={() => setOpen(false)} />}

      {/* Drawer */}
      <div className={`mobile-drawer ${open ? "open" : ""}`}>
        <div className="drawer-header">
          <span className="brand">Menu</span>
          <button className="drawer-close" onClick={() => setOpen(false)}>✕</button>
        </div>
        <nav className="drawer-nav">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`drawer-link ${pathname === l.href || pathname.startsWith(l.href + "/") ? "active" : ""}`}
            >
              <span className="drawer-icon">{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Bottom tab bar */}
      <nav className="mobile-bottom-nav">
        {BOTTOM_NAV.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`bottom-nav-item ${pathname === l.href ? "active" : ""}`}
          >
            <span className="bottom-nav-icon">{l.icon}</span>
            <span className="bottom-nav-label">{l.label}</span>
          </Link>
        ))}
        <button className="bottom-nav-item" onClick={() => setOpen((o) => !o)}>
          <span className="bottom-nav-icon">☰</span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>
    </>
  );
}
