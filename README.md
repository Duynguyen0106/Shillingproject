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
3. Configure API environment:
   - `cp apps/api/.env.example apps/api/.env`
4. Generate Prisma client + migrate + seed:
   - `npm run prisma:generate`
   - `npm run prisma:migrate`
   - `npm run prisma:seed`
5. Run API and web:
   - `npm run dev -w @shillops/api`
   - `npm run dev -w @shillops/web`

## Demo Flow

1. Post mock signal to `POST /signals/ingest`.
2. Mission is auto-created with idempotency on signal dedupe key.
3. Mission appears in web board at `/app`.
4. Submit proof on mission details page.
5. Points update leaderboard.
6. Create short link via `POST /links` and track clicks with `GET /r/:code`.
