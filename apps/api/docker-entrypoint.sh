#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

echo "Running database migrations…"
npx prisma migrate deploy

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "Seeding database…"
  npx tsx prisma/seed.ts
fi

echo "Starting API on port ${PORT:-4000}…"
exec node dist/main.js
