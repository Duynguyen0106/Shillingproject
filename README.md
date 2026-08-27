# Memecoin Shill Ops + Community Growth dApp (MVP)

## Monorepo Structure

```
/apps
  /api      # TypeScript API + Prisma
  /web      # Next.js frontend
/packages
  /ui
  /types
  /sdk
  /scoring-engine
/infra
  docker-compose.yml
/docs
/contracts
```

## Local Setup

1. Start infrastructure:
   - `docker compose -f infra/docker-compose.yml up -d`
2. Install dependencies:
   - `npm install`
3. Configure environment:
   - `cp apps/api/.env.example apps/api/.env`
   - `cp apps/web/.env.example apps/web/.env.local`
   - set `TWITTERAPI_IO_KEY` or `X_BEARER_TOKEN` on the API to pull live KOL posts and ticker/CA mentions
   - set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` from https://dashboard.reown.com
     (needed for Trust/Phantom mobile QR and the full wallet catalog)
4. Generate Prisma client + migrate + seed:
   - `npm run prisma:generate`
   - `npm run prisma:migrate`
   - `npm run prisma:seed`
   - or apply SQL migration directly from `apps/api/prisma/migrations/*/migration.sql`
5. Run API and web:
   - `npm run dev -w @shillops/api`
   - `npm run dev -w @shillops/web`
6. Run Phase 1 smoke flow:
   - `npm run smoke:phase1`

## Production Deploy

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for full instructions.

Quick start with Docker:

```bash
cp infra/env.prod.example infra/env.prod
# edit infra/env.prod — set URLs, passwords, WalletConnect ID
./scripts/deploy-production.sh
```

Or deploy to Render using the included `render.yaml` blueprint.

## Demo Flow

From the UI:

1. Paste a DexScreener URL or token contract on `/` (demo PEPE: `0x6982508145454ce325ddbe47a25d4ec3d2311933`).
2. Open the contract hub and join the community bound to that mint.
3. Open `/app/feed`. The CTO lead watches KOL handles. With an X API key the feed pulls live posts and ticker/CA mentions; new posts popup in the app with KOL info so members do not reload. Already-shilled posts are marked; **Reshill** records another hit. Click **Shill this** to open that post on X.
4. Mentions notify Telegram/Discord so the whole room piles on that URL. Claimed raids still score on the mission board.
5. Unique clicks on your personal CTA award points. Confirm on `/app/me` and `/app/leaderboard`.

From the API:

1. `POST /signals/ingest`
2. Mission is auto-created with idempotency on signal dedupe key.
3. `POST /missions/:id/claim`
4. `POST /tasks/:id/submissions`
5. `GET /me` and `GET /communities/:id/leaderboard`
6. `POST /links` then `GET /r/:code`

## Notification templates

- Generic mission:
  - `🔥 New mission live: {title}`
  - `Signal: {type} | Priority: {priority}`
  - `CTA: Open Mission`
- Whale buy:
  - `🐋 Whale buy detected for {token}`
  - `Mission auto-created. Push now.`
  - `CTA: Join Mission`
- Mention spike:
  - `📈 Mention spike: {ticker} up {x}%`
  - `Community action requested.`
  - `CTA: Boost Narrative`
