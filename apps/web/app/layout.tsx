import AppShell from "./AppShell";
import PWAInit from "./PWAInit";
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "ShillOps",
  description: "Coordinate memecoin raids. Earn points. Redeem your coin.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "ShillOps", statusBarStyle: "black-translucent" }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#6c47ff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ShillOps" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        <PWAInit />
      </body>
    </html>
  );
}
