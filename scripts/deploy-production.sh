#!/usr/bin/env bash
# Deploy ShillOps production stack with Docker Compose.
# Requires Docker Engine + Compose v2.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/infra/env.prod}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Copy infra/env.prod.example → infra/env.prod and edit values first."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. See docs/DEPLOY.md for Render one-click deploy."
  exit 1
fi

cd "$ROOT"
echo "Building and starting production stack…"
docker compose -f infra/docker-compose.prod.yml --env-file "$ENV_FILE" up -d --build

echo
echo "ShillOps is starting."
echo "  Web: $(grep -E '^NEXT_PUBLIC_APP_URL=' "$ENV_FILE" | cut -d= -f2- || echo 'http://localhost:3000')"
echo "  API: $(grep -E '^NEXT_PUBLIC_API_BASE=' "$ENV_FILE" | cut -d= -f2- || echo 'http://localhost:4000')"
echo
echo "Check status: docker compose -f infra/docker-compose.prod.yml ps"
echo "View logs:    docker compose -f infra/docker-compose.prod.yml logs -f api web"
