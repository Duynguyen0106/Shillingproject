# Architecture

- `apps/api`: TypeScript API service with Prisma + Postgres. Mission tasks are dealt from `src/playbook.ts`. Live KOL/mention posts come from `src/xfeed.ts` + `src/feed.ts` (TwitterAPI.io or X API v2).
- `apps/web`: Next.js app for raid feed, mission board, mission detail, leaderboard, and admin pages.
- `packages/scoring-engine`: scoring formula utility.
- `infra/docker-compose.yml`: Postgres + Redis.
