import Link from "next/link";
import ContractSearch from "./ContractSearch";

export default function LandingPage() {
  return (
    <div className="landing">

      {/* ── NAV ── */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <span className="landing-logo">
            <span className="landing-logo-icon">⚡</span>
            Shill<span className="landing-logo-accent">Ops</span>
          </span>
          <div className="landing-nav-links">
            <Link href="/app/feed">Raid Feed</Link>
            <Link href="/app">Missions</Link>
            <Link href="/app/me">My Ops</Link>
            <Link href="/app" className="btn landing-nav-cta">Launch App</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-kicker">Memecoin Alpha Infrastructure</div>
          <h1 className="landing-h1">
            Coordinate raids.<br />
            Earn points.<br />
            <span className="landing-h1-accent">Redeem your coin.</span>
          </h1>
          <p className="landing-subtitle">
            ShillOps turns on-chain signals — whale buys, KOL posts, ticker spikes — into
            structured shill missions. Connect your wallet, verify your X, and raid coordinated
            with your community in real time.
          </p>
          <div className="landing-hero-actions">
            <Link href="/app/feed" className="btn landing-btn-primary">Open Raid Feed →</Link>
            <Link href="/app/onboarding" className="btn landing-btn-secondary">Get Started</Link>
          </div>
          <div className="landing-hero-stats">
            <div className="landing-stat">
              <span className="landing-stat-num">Real-time</span>
              <span className="landing-stat-label">Live scoreboard</span>
            </div>
            <div className="landing-stat-divider" />
            <div className="landing-stat">
              <span className="landing-stat-num">Auto-score</span>
              <span className="landing-stat-label">X reply detection</span>
            </div>
            <div className="landing-stat-divider" />
            <div className="landing-stat">
              <span className="landing-stat-num">Points → Coin</span>
              <span className="landing-stat-label">Token redemption</span>
            </div>
          </div>
        </div>

        {/* Decorative graphic */}
        <div className="landing-hero-visual" aria-hidden>
          <div className="lhv-card lhv-card-1">
            <div className="lhv-row">
              <span className="lhv-dot green" />
              <span className="lhv-label">FOCUS RAID LIVE</span>
            </div>
            <div className="lhv-post">🐋 Whale buy detected — $PEPE</div>
            <div className="lhv-meta">142 raiders · 89 proved · 12 min left</div>
          </div>
          <div className="lhv-card lhv-card-2">
            <div className="lhv-row">
              <span className="lhv-dot orange" />
              <span className="lhv-label">MISSION ACTIVE</span>
            </div>
            <div className="lhv-post">Reply the whale buy narrative</div>
            <div className="lhv-progress">
              <div className="lhv-bar" style={{ width: "68%" }} />
            </div>
            <div className="lhv-meta">68 / 100 shills</div>
          </div>
          <div className="lhv-card lhv-card-3">
            <div className="lhv-row">
              <span className="lhv-dot blue" />
              <span className="lhv-label">YOU EARNED</span>
            </div>
            <div className="lhv-points">+240 pts</div>
            <div className="lhv-meta">Streak: 🔥 5 days · Rank #12</div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="landing-section">
        <div className="landing-section-inner">
          <div className="landing-section-label">How it works</div>
          <h2 className="landing-h2">Signal → Mission → Shill → Points</h2>
          <div className="landing-steps">
            {[
              {
                num: "01",
                title: "Signal detected",
                body: "On-chain whale buys, KOL post spikes, and community mentions are ingested automatically. Each signal spawns a timed mission."
              },
              {
                num: "02",
                title: "Mission spawned",
                body: "A playbook of tasks is generated: reply the narrative, quote-tweet the KOL post, shill the CA in your community. Claim your slot."
              },
              {
                num: "03",
                title: "Focus raid called",
                body: "Any member (or the CTO lead) can call a focus raid — concentrating all replies under a single high-value tweet for coordinated social proof."
              },
              {
                num: "04",
                title: "Proof auto-scored",
                body: "Link your X account once. ShillOps polls the X API for your replies and auto-scores your proof. No URL pasting required."
              },
              {
                num: "05",
                title: "Points & leaderboard",
                body: "Every proved shill earns points. Track your rank, streak, and badges on the live scoreboard. Top raiders get recognized."
              },
              {
                num: "06",
                title: "Redeem your coin",
                body: "Points are redeemable for the community coin. The more you shill, the more you earn. Loyalty compounds."
              }
            ].map((step) => (
              <div key={step.num} className="landing-step">
                <div className="landing-step-num">{step.num}</div>
                <div>
                  <div className="landing-step-title">{step.title}</div>
                  <div className="landing-step-body">{step.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="landing-section landing-section-alt">
        <div className="landing-section-inner">
          <div className="landing-section-label">Features</div>
          <h2 className="landing-h2">Everything your raid needs</h2>
          <div className="landing-features">
            {[
              { icon: "🎯", title: "Focus Raid Scoreboard", body: "Live counter of raiders, proofs, and time remaining for every active focus raid." },
              { icon: "🔗", title: "X Account Verification", body: "Link your X handle once. Your replies are auto-detected and scored without copy-pasting URLs." },
              { icon: "📡", title: "Live SSE Feed", body: "Server-sent events push new KOL posts, shill activity, and focus changes to your browser instantly." },
              { icon: "🏆", title: "Streak & Achievements", body: "Daily streak tracking, milestone badges, and a community leaderboard to keep raiders engaged." },
              { icon: "📢", title: "Community Announcements", body: "CTO leads can post pinned announcements visible to all community members on the mission board." },
              { icon: "🛡️", title: "SIWE Auth + EIP-6963", body: "Sign-In With Ethereum via any wallet (MetaMask, Phantom, Coinbase Wallet) using the EIP-6963 multi-wallet standard." },
              { icon: "💰", title: "Token Redemption", body: "Redeem accumulated points for the community coin. Your shill work converts directly to on-chain value." },
              { icon: "📊", title: "Attribution Tracking", body: "Every shill link is tracked. See exactly how many clicks your personal CTA generated for the community." },
              { icon: "⚡", title: "Signal Auto-Missions", body: "Whale buys, mention spikes, and KOL posts are detected and converted to structured missions automatically." }
            ].map((f) => (
              <div key={f.title} className="landing-feature">
                <div className="landing-feature-icon">{f.icon}</div>
                <div className="landing-feature-title">{f.title}</div>
                <div className="landing-feature-body">{f.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FIND YOUR COMMUNITY ── */}
      <section className="landing-section">
        <div className="landing-section-inner landing-search-section">
          <div className="landing-section-label">Find your mint</div>
          <h2 className="landing-h2">Search by contract or ticker</h2>
          <p className="landing-subtitle" style={{ maxWidth: 480, textAlign: "center" }}>
            Enter a DexScreener contract address, paste the URL, or search by ticker to join the community bound to that mint.
          </p>
          <div className="landing-search-wrap">
            <ContractSearch />
          </div>
        </div>
      </section>

      {/* ── CTA BOTTOM ── */}
      <section className="landing-cta-section">
        <div className="landing-cta-inner">
          <h2 className="landing-cta-h2">Ready to raid?</h2>
          <p className="landing-cta-sub">Connect your wallet, verify your X account, and start earning points on every shill.</p>
          <div className="landing-hero-actions">
            <Link href="/app/onboarding" className="btn landing-btn-primary">Start Onboarding →</Link>
            <Link href="/app/feed" className="btn landing-btn-secondary">Open Raid Feed</Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span className="landing-logo">
            <span className="landing-logo-icon">⚡</span>
            Shill<span className="landing-logo-accent">Ops</span>
          </span>
          <div className="landing-footer-links">
            <Link href="/app/feed">Raid Feed</Link>
            <Link href="/app">Missions</Link>
            <Link href="/app/leaderboard">Leaderboard</Link>
            <Link href="/app/me">My Ops</Link>
          </div>
          <div className="landing-footer-copy">© 2026 ShillOps. DYOR. Not financial advice.</div>
        </div>
      </footer>
    </div>
  );
}
