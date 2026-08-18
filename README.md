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

1. Click **Connect wallet** and pick Phantom, Trust, MetaMask, Coinbase, or any WalletConnect wallet.
2. Sign the SIWE message, then join the demo community on `/`.
3. Ingest a mock signal at `/app/admin/signals` (mission auto-creates).
3. Open the mission from `/app` and submit proof.
4. Confirm points on `/app/leaderboard`.
5. Create a tracked CTA at `/app/admin/attribution` and click `/r/:code`.

From the API:

1. `POST /signals/ingest`
2. Mission is auto-created with idempotency on signal dedupe key.
3. `POST /tasks/:id/submissions`
4. `GET /communities/:id/leaderboard`
5. `POST /links` then `GET /r/:code`

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
