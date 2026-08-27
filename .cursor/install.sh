#!/usr/bin/env bash
# Idempotent repository bootstrap for the Memecoin Shill Ops monorepo.
# Provisions PostgreSQL, installs dependencies, and prepares the database.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> [install] Ensuring PostgreSQL 16 is installed"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi

echo "==> [install] Starting PostgreSQL"
sudo pg_ctlcluster 16 main start 2>/dev/null || true
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

echo "==> [install] Ensuring postgres role password and shillops database"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';" >/dev/null
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='shillops'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE shillops;" >/dev/null

echo "==> [install] Writing local env files (idempotent)"
[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
# Local dev ingest key so POST /signals/ingest is usable without an admin wallet.
grep -q '^SIGNAL_INGEST_SECRET=' apps/api/.env || echo 'SIGNAL_INGEST_SECRET="dev-ingest-secret"' >> apps/api/.env
[ -f apps/web/.env.local ] || cp apps/web/.env.example apps/web/.env.local

echo "==> [install] Installing npm dependencies"
npm install

echo "==> [install] Generating Prisma client, applying migrations, seeding"
( cd apps/api && npx prisma generate && npx prisma migrate deploy && npx tsx prisma/seed.ts )

echo "==> [install] Done"
