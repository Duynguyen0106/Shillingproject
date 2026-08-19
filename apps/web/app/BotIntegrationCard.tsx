"use client";

interface BotLinksProps {
  ticker?: string;
  tgLink?: string;
  discordLink?: string;
  communityId?: string;
}

export default function BotIntegrationCard({ ticker, tgLink, discordLink, communityId }: BotLinksProps) {
  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://shillops.xyz";
  const deepLink = `${appUrl}/app/feed`;

  return (
    <div className="card bot-card">
      <div className="kicker">Stay in the loop</div>
      <h3>Get alerts on Telegram & Discord</h3>
      <p className="muted">
        Receive instant raid alerts, new mission notifications, and live leaderboard updates directly in your community chat.
      </p>
      <div className="bot-actions">
        {tgLink ? (
          <a href={tgLink} target="_blank" rel="noreferrer" className="btn bot-btn-tg">
            📨 Join Telegram Group
          </a>
        ) : (
          <div className="bot-setup">
            <strong>Telegram bot setup</strong>
            <p className="muted">Add <code>@ShillOpsBot</code> to your Telegram group, then run <code>/setup {communityId}</code>.</p>
          </div>
        )}
        {discordLink ? (
          <a href={discordLink} target="_blank" rel="noreferrer" className="btn bot-btn-discord">
            🎮 Join Discord Server
          </a>
        ) : (
          <div className="bot-setup">
            <strong>Discord bot setup</strong>
            <p className="muted">Invite <code>ShillOps#1234</code> to your Discord server and run <code>/shillops setup {communityId}</code>.</p>
          </div>
        )}
        <a href={deepLink} className="btn bot-btn-app">🚀 Open ShillOps App</a>
      </div>
    </div>
  );
}
