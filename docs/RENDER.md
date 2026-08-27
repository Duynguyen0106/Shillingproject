# Deploy ShillOps on Render

Step-by-step guide for the included `render.yaml` blueprint.

## What gets created

| Resource | Name | Purpose |
| --- | --- | --- |
| PostgreSQL | `shillops-db` | App database (migrations run on API boot) |
| Web service | `shillops-api` | Express API (`/health`, missions, wallet auth) |
| Web service | `shillops-web` | Next.js frontend |

URLs are wired automatically:
- API `APP_URL` → web service public URL (CORS)
- Web `NEXT_PUBLIC_API_BASE` → API public URL
- Web `NEXT_PUBLIC_APP_URL` → web public URL

## 1. Create the Blueprint

1. Open [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **Blueprint**
3. Connect GitHub repo **`Duynguyen0106/Shillingproject`**
4. Select branch **`cursor/deploy-47ce`** (or `main` after merge)
5. Render reads `render.yaml` and shows 3 resources — click **Apply**

First deploy takes ~10–15 minutes (Docker builds for API + web).

## 2. Set WalletConnect (required for wallet sign-in)

During Blueprint creation, Render prompts for `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (`sync: false`).

If you skipped it:

1. Get a free project ID from [Reown Dashboard](https://dashboard.reown.com)
2. Open **shillops-web** → **Environment**
3. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to your ID
4. Click **Manual Deploy** → **Deploy latest commit**

> This variable is baked into the Next.js build — you must redeploy web after changing it.

## 3. Verify

After both services show **Live**:

| Check | URL |
| --- | --- |
| Web app | `https://shillops-web.onrender.com` (your actual URL) |
| API health | `https://shillops-api.onrender.com/health` → `{"ok":true}` |

On the web app:
- Landing page loads
- No amber “API offline” banner (if API is up)
- **Connect wallet** opens WalletConnect modal

## 4. Optional: live X feed

On **shillops-api** → **Environment**, add one of:

- `TWITTERAPI_IO_KEY` — TwitterAPI.io key
- `X_BEARER_TOKEN` — X API v2 bearer token

Redeploy API. Without these, the feed still works with seeded/demo data.

## 5. After first successful deploy

On **shillops-api** → **Environment**:

- Set `RUN_SEED=false` so restarts don’t re-run the demo seed

## Free tier notes

- Services **spin down after ~15 min idle** — first request after sleep takes ~30–60s (cold start)
- Free Postgres expires after **90 days** — upgrade or export before then
- Render assigns `*.onrender.com` URLs; custom domains available on paid plans

## Troubleshooting

| Problem | Fix |
| --- | --- |
| API deploy fails on migrate | Check **shillops-api** logs; confirm `shillops-db` is provisioned |
| CORS error in browser | Confirm `APP_URL` on API matches web URL exactly (`https://…`, no trailing slash) |
| API offline banner on web | Open API `/health` directly; cold-start the API by visiting it first |
| Wallet connect broken | Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` and **redeploy web** |
| Build fails (web) | Check build logs; ensure branch has `output: "standalone"` in `next.config.js` |

## Redeploy after code changes

Push to the connected branch — Render auto-deploys if enabled.

Or: service → **Manual Deploy** → **Deploy latest commit**.

## Merge to main (recommended)

Merge [PR #5](https://github.com/Duynguyen0106/Shillingproject/pull/5), then point the Blueprint at `main` for future updates.
