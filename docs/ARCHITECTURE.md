# Architecture

- `apps/api`: TypeScript API service with Prisma + Postgres. Mission tasks are dealt from `src/playbook.ts` (standing plays + signal-triggered overlays, capped at 5).
- `apps/web`: Next.js app for mission board, mission detail, leaderboard, and admin pages.
- `packages/scoring-engine`: scoring formula utility.
- `infra/docker-compose.yml`: Postgres + Redis.
