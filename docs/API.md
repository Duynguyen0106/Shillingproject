# API (Phase 1)

## Auth / User
- POST `/auth/siwe/start` `{ wallet }` → nonce + SIWE message bound to that address
- POST `/auth/siwe/verify` `{ message, signature }` → recovers address, returns session token
- GET `/me` with `Authorization: Bearer <token>` or `?wallet=`

## Community
- POST `/communities`
- GET `/communities/:id`
- POST `/communities/:id/join`

## Signals / Missions
- POST `/signals/ingest`
- GET `/communities/:id/signals`
- POST `/signals/:id/create-mission`
- GET `/communities/:id/missions?status=active`
- GET `/missions/:id`
- POST `/missions/:id/claim`
- POST `/missions/:id/complete`

## Submissions / Scoring
- POST `/tasks/:id/submissions`
- POST `/submissions/:id/verify`
- GET `/communities/:id/leaderboard`

## Attribution
- POST `/links`
- GET `/r/:code` (redirect + click logging)
- GET `/communities/:id/attribution`

## Notifications
- POST `/notifications/telegram/test`
- POST `/notifications/discord/test`
- GET `/notifications` (in-app alert log; `delivered` is false when webhook URLs are unset)

Invalid payloads return `400` with `{ error: "Validation failed", details: [...] }`.
