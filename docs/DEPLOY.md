# Deployment Guide

ShillOps ships as a monorepo with an Express API (`apps/api`), Next.js web app (`apps/web`), PostgreSQL, and Redis.

## Option A — Docker Compose (VPS / local production)

Best for a single server you control (DigitalOcean, Hetzner, AWS EC2, etc.).

### 1. Prerequisites

- Docker Engine 24+ and Compose v2
- Ports 3000 (web) and 4000 (API) available

### 2. Configure environment

```bash
cp infra/env.prod.example infra/env.prod
```

Edit `infra/env.prod`:

| Variable | Example | Notes |
| --- | --- | --- |
| `APP_URL` | `https://app.yourdomain.com` | Must match the public web URL (CORS) |
| `NEXT_PUBLIC_APP_URL` | same as `APP_URL` | Baked into web build |
| `NEXT_PUBLIC_API_BASE` | `https://api.yourdomain.com` | Baked into web build |
| `POSTGRES_PASSWORD` | strong secret | Change from default |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | from [Reown](https://dashboard.reown.com) | Required for mobile wallets |
| `RUN_SEED` | `true` then `false` | Seeds demo community on first boot |

### 3. Deploy

```bash
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh
```

Or manually:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/env.prod up -d --build
```

### 4. Verify

- Web: `http://localhost:3000` (or your domain)
- API health: `http://localhost:4000/health` → `{ "ok": true }`

### 5. Reverse proxy (recommended for HTTPS)

Put Caddy or nginx in front of the web and API containers. Example Caddy:

```
app.yourdomain.com {
  reverse_proxy localhost:3000
}
api.yourdomain.com {
  reverse_proxy localhost:4000
}
```

Update `APP_URL`, `NEXT_PUBLIC_APP_URL`, and `NEXT_PUBLIC_API_BASE`, then rebuild the web container.

---

## Option B — Render (managed, free tier)

1. Push this branch to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect `Duynguyen0106/Shillingproject` and select the branch with `render.yaml`.
4. After services are created, set sync=false env vars in the Render UI:
   - **API** `APP_URL` → your web service URL
   - **Web** `NEXT_PUBLIC_API_BASE` → your API service URL
   - **Web** `NEXT_PUBLIC_APP_URL` → your web service URL
   - **Web** `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` → Reown project ID
5. Redeploy the web service after setting build-time env vars.

Render provisions PostgreSQL automatically via the blueprint.

---

## Option C — Split hosting (Vercel + Railway/Render)

| Service | Platform | Notes |
| --- | --- | --- |
| Web | Vercel | Import `apps/web`, set root to monorepo, override build: `cd ../.. && npm ci && npm run build -w @shillops/web` |
| API | Railway / Render | Use `apps/api/Dockerfile`, set `DATABASE_URL` |
| DB | Neon / Supabase / Render Postgres | Run `npm run prisma:migrate:deploy -w @shillops/api` |

Set `APP_URL` on the API to your Vercel domain. Set `NEXT_PUBLIC_*` on Vercel to your API URL.

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push:

- Installs deps, migrates test DB, builds all workspaces
- Runs 124 API tests
- Builds Docker images on push

---

## Production checklist

- [ ] Strong `POSTGRES_PASSWORD`
- [ ] `RUN_SEED=false` after first deploy (avoid re-seeding)
- [ ] `APP_URL` matches public web origin (CORS)
- [ ] `NEXT_PUBLIC_API_BASE` points to public API
- [ ] WalletConnect project ID configured
- [ ] Optional: `TWITTERAPI_IO_KEY` or `X_BEARER_TOKEN` for live KOL feed
- [ ] HTTPS via reverse proxy or platform TLS

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Web shows API offline banner | API not reachable; check `NEXT_PUBLIC_API_BASE` and CORS `APP_URL` |
| Wallet connect fails | Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` and rebuild web |
| API crashes on start | Check `DATABASE_URL`; run migrations manually with `prisma migrate deploy` |
| CORS errors | `APP_URL` must exactly match the browser origin (scheme + host + port) |
