import { API_BASE } from "../../../lib/config";
import Link from "next/link";

interface LeaderboardEntry {
  id: string;
  name: string;
  ticker: string;
  rank: number;
  shills24h: number;
  memberCount: number;
  totalPoints: number;
  focusRaidLive: boolean;
}

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const r = await fetch(`${API_BASE}/communities/leaderboard?limit=10`, { cache: "no-store" });
    return r.ok ? r.json() : [];
  } catch { return []; }
}

export default async function EmbedWidgetPage() {
  const entries = await getLeaderboard();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e2e8f0; font-size: 13px; }
          .widget { padding: 12px; }
          .widget-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
          .widget-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #6c47ff; }
          .widget-link { font-size: 10px; color: #94a3b8; text-decoration: none; }
          .widget-link:hover { color: #6c47ff; }
          .row { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 6px; margin-bottom: 4px; background: #13131a; border: 1px solid #1e1e2e; }
          .row:hover { border-color: #6c47ff44; }
          .rank { font-size: 10px; color: #64748b; width: 20px; }
          .ticker { font-weight: 700; color: #e2e8f0; flex: 1; margin-left: 6px; }
          .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 6px #22c55e; display: inline-block; margin-right: 4px; }
          .shills { font-size: 11px; color: #94a3b8; }
          .pts { font-size: 11px; font-weight: 600; color: #6c47ff; }
          .footer { text-align: center; margin-top: 10px; font-size: 10px; color: #475569; }
          .footer a { color: #6c47ff; text-decoration: none; }
        `}</style>
      </head>
      <body>
        <div className="widget">
          <div className="widget-header">
            <span className="widget-title">ShillOps Communities</span>
            <a href="https://shillops.xyz/app/leaderboard" target="_blank" rel="noreferrer" className="widget-link">Full leaderboard ↗</a>
          </div>
          {entries.map((e) => (
            <div key={e.id} className="row">
              <span className="rank">#{e.rank}</span>
              <span className="ticker">
                {e.focusRaidLive && <span className="live-dot" />}
                ${e.ticker}
              </span>
              <span className="shills">{e.shills24h} shills</span>
              <span className="pts">{e.totalPoints.toLocaleString()} pts</span>
            </div>
          ))}
          <div className="footer">Powered by <a href="https://shillops.xyz" target="_blank" rel="noreferrer">ShillOps</a></div>
        </div>
      </body>
    </html>
  );
}
