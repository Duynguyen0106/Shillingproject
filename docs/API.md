# API (Phase 1)

## Auth / User
- POST `/auth/siwe/start` `{ wallet }` → nonce + SIWE message bound to that address
- POST `/auth/siwe/verify` `{ message, signature }` → recovers address, returns session token
- GET `/me` with `Authorization: Bearer <token>` or `?wallet=` — includes points, rank, claims, submissions, and personal tracked links for `?communityId=`

## Community
- POST `/communities`
- GET `/communities/:id`
- POST `/communities/:id/join`

## Signals / Missions
- POST `/signals/ingest`
- GET `/communities/:id/signals`
- POST `/signals/:id/create-mission`
- GET `/communities/:id/missions?status=active` — expires stale missions (HIGH 2h, MEDIUM 6h, LOW 24h) then lists
- GET `/communities/:id/activity` — recent claims, proofs, and CTA click rewards
- GET `/missions/:id`
- POST `/missions/:id/claim` `{ wallet? }` — SIWE Bearer token overrides body wallet; issues a personal tracked CTA; 409 if expired/completed
- POST `/missions/:id/complete` — requires a connected wallet; 409 if expired/completed

## Submissions / Scoring
- POST `/tasks/:id/submissions` `{ wallet?, proofUrl, proofText?, engagementValue? }` — Bearer token wallet wins over body; requires a mission claim first
- POST `/submissions/:id/verify`
- GET `/communities/:id/leaderboard`

## Attribution
- POST `/links`
- GET `/r/:code` (redirect + click logging; unique contributor CTA clicks award points)
- GET `/communities/:id/attribution` — click counts, optional `wallet` when the link is a contributor CTA

## Notifications
- POST `/notifications/telegram/test`
- POST `/notifications/discord/test`
- GET `/notifications` (in-app alert log; `delivered` is false when webhook URLs are unset)

Invalid payloads return `400` with `{ error: "Validation failed", details: [...] }`.
