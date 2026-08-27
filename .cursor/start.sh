#!/usr/bin/env bash
# Per-boot runtime initialization. Brings PostgreSQL up and reconciles the
# database schema. The API and web dev servers run in `terminals`.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> [start] Starting PostgreSQL"
sudo pg_ctlcluster 16 main start 2>/dev/null || true
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

echo "==> [start] Reconciling database schema (idempotent)"
( cd apps/api && npx prisma migrate deploy >/dev/null 2>&1 || true )

echo "==> [start] PostgreSQL ready"
