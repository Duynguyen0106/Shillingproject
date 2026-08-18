# API (Phase 1)

## Auth / User
- POST `/auth/siwe/start` `{ wallet }` → nonce + SIWE message bound to that address
- POST `/auth/siwe/verify` `{ message, signature }` → recovers address, returns session token
- GET `/me` with `Authorization: Bearer <token>` or `?wallet=` — includes points, rank, claims, submissions, personal tracked links, and `nextPlay` (the next unsubmitted task on a claimed active mission, shuffled per wallet) for `?communityId=`

## Community
- GET `/tokens/lookup?q=` or `?chain=&address=&wallet=` — DexScreener lookup, trust signals, paid/CTO proof, other-chain listings, the community bound to that contract, and the CTO lead seat
- POST `/communities/from-token` `{ chainId, contractAddress, wallet? }` — first wallet binds the only community for that mint and becomes lead
- POST `/communities`
- GET `/communities/:id` — includes `lead` (`vacant`, `reason`, wallet, remaining inactivity window)
- POST `/communities/:id/join`
- POST `/communities/:id/lead/resign` — current lead steps down; community stays on the mint
- POST `/communities/:id/x-community` `{ url, wallet? }` — active CTO lead binds an `x.com/i/communities/{id}` URL to this mint (unique). Shown on the token hub. Does not replace DexScreener contract identity.

## Signals / Missions
- POST `/signals/ingest` `{ communityId? , chainId?, contractAddress?, q?, type, severity, sourceRef?, metadata? }` — if a mint is provided, the signal is routed to the community uniquely bound to that contract; ticker search is rejected; 404 if the mint is unbound. The mission is dealt from the playbook: standing plays always, plus a quote overlay for KOL/mention/whale/volume signals (max 5 tasks).
- GET `/communities/:id/signals`
- POST `/signals/:id/create-mission`
- GET `/communities/:id/missions?status=active` — expires stale missions (HIGH 2h, MEDIUM 6h, LOW 24h) then lists. If the active board is empty, auto-creates a LOW daily pulse for that UTC day so raiders are not sent to admin ingest.
- GET `/communities/:id/activity` — recent claims, proofs, and CTA click rewards
- GET `/missions/:id` — includes `warRoom` (pin, check-ins, claims/proofs/clicks) and `nextPlay` when `?wallet=` or a Bearer session is present. Pins and check-ins lock when the mission expires.
- POST `/missions/:id/claim` `{ wallet? }` — SIWE Bearer token overrides body wallet; issues a personal tracked CTA; also checks the raider in; 409 if expired/completed
- POST `/missions/:id/pin` `{ body, wallet? }` — active CTO lead pins the one-line talk track (max 280). Not a chat.
- POST `/missions/:id/check-in` `{ wallet? }` — joined member taps I'm in for this raid only
- POST `/missions/:id/complete` — requires a connected wallet; 409 if expired/completed

## Submissions / Scoring
- POST `/tasks/:id/submissions` `{ wallet?, proofUrl, proofText?, engagementValue? }` — Bearer token wallet wins over body; requires a mission claim first. The bonus “Post in the linked X Community” task requires a proof URL from that Community; reply/KOL tasks still accept any x.com status URL.
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
