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

## Demo Flow

From the UI:

1. Paste a DexScreener URL or token contract on `/` (demo PEPE: `0x6982508145454ce325ddbe47a25d4ec3d2311933`).
2. Open the contract hub and join the community bound to that mint.
3. Connect a wallet. The mission board shows a daily pulse if nothing else is live; ingest a mock signal to overlay a KOL/mention/whale raid.
4. Open the mission from `/app`, claim it, and share your personal tracked CTA (X / Telegram / Discord copy is on the mission). Your next play is highlighted per wallet. HIGH missions expire in 2 hours.
5. Unique clicks on that CTA award points. Confirm points and clicks on `/app/me` and `/app/leaderboard`.
6. Create extra tracked CTAs at `/app/admin/attribution` and click `/r/:code`.

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
