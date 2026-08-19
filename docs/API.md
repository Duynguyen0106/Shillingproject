# API (Phase 1)

## Auth / User
- POST `/auth/siwe/start` `{ wallet }` → nonce + SIWE message bound to that address
- POST `/auth/siwe/verify` `{ message, signature }` → recovers address, returns session token
- GET `/me` with `Authorization: Bearer <token>` or `?wallet=` — includes points, rank, claims, submissions, personal tracked links, `shills` (this wallet’s coin shill history), `nextPlay` (the next unsubmitted task on a claimed active mission, shuffled per wallet) for `?communityId=`, and `focus` (the live focus raid plus scored-reply / live-raider counts)

## Community
- GET `/tokens/lookup?q=` or `?chain=&address=&wallet=` — DexScreener lookup, trust signals, paid/CTO proof, other-chain listings, the community bound to that contract, the CTO lead seat, and the live `focus` raid when one is locked
- POST `/communities/from-token` `{ chainId, contractAddress, wallet? }` — first wallet binds the only community for that mint and becomes lead
- POST `/communities`
- GET `/communities/:id` — includes `lead` (`vacant`, `reason`, wallet, remaining inactivity window) and `focus` (locked tweet, `remainingMs`, `provedCount`, `liveProvedCount`, `liveRaiderCount`, `raiderCount`; pass `?wallet=` for `youShilled` / `youProved`)
- POST `/communities/:id/join`
- POST `/communities/:id/lead/resign` — current lead steps down; community stays on the mint
- POST `/communities/:id/x-community` `{ url, wallet? }` — active CTO lead binds an `x.com/i/communities/{id}` URL to this mint (unique). Shown on the token hub. Does not replace DexScreener contract identity.

## Raid feed
- GET `/communities/:id/feed` — watched KOL handles plus latest KOL posts and ticker/CA mentions. Query: `handle` (one KOL), `q` (search handle/name), `kind=KOL_POST|MENTION`, `minFollowers`, `minEngagement` (likes+replies+reposts+quotes), `sort=new|hot`, `since` (ISO time; only posts ingested after that), `wallet` (marks posts this member already shilled). Each post includes `youShilled`, `youShillCount`, `youProved`, `provedCount`, `raiderCount`, `shillCount`. `focus` includes `youShilled` / `youProved`, `remainingMs`, `provedCount`, `liveProvedCount`, `liveRaiderCount`, and `raiderCount` for the locked tweet. `shillHistory` is the coin’s recent shill log.
- POST `/communities/:id/feed/:postId/shill` `{ wallet?, reshill? }` — first shill claims the raid and opens the X URL. If the member already shilled, returns `{ alreadyShilled: true }` without opening a duplicate; pass `reshill: true` to record another hit on the same post.
- POST `/communities/:id/feed/:postId/proof` `{ wallet?, proofUrl, proofText? }` — after a shill, paste YOUR reply/quote status URL on the raid itself. Rejects the KOL tweet URL. 403 if you have not shilled that post; 409 `{ alreadyProved: true }` if you already scored a raid-reply on it. Success returns `pointsAwarded`, `provedCount`, and `liveProvedCount`.
- GET `/communities/:id/feed/live` — Server-Sent Events. `hello` on connect, `post` when a watched KOL (or mention) is ingested, `shill` when someone claims a tweet, `focus` when the room locks onto one tweet, `proof` when a raid-reply is scored (`postId`, `provedCount`, `liveProvedCount`, `raider`). Payload has the post plus KOL avatar/followers/name so the app can popup without reload.
- POST `/communities/:id/kols` `{ handle, wallet? }` — CTO lead watches an X handle
- DELETE `/communities/:id/kols/:handle` — CTO lead removes a watch
- POST `/communities/:id/feed/refresh` — joined member pulls live posts (requires `TWITTERAPI_IO_KEY` or `X_BEARER_TOKEN`). Mentions of the ticker or CA notify Telegram/Discord and open a raid.
- POST `/communities/:id/feed/posts` `{ url, text, authorHandle?, kind? }` — push a post into the feed (worker/admin)

## Signals / Missions
- POST `/signals/ingest` `{ communityId? , chainId?, contractAddress?, q?, type, severity, sourceRef?, metadata? }` — if a mint is provided, the signal is routed to the community uniquely bound to that contract; ticker search is rejected; 404 if the mint is unbound. The mission is dealt from the playbook: standing plays always, plus a quote overlay for KOL/mention/whale/volume signals (max 5 tasks). Pass the post to raid as `metadata.targetUrl` (or a URL `sourceRef`); the app does not scrape X to find it.
- GET `/communities/:id/signals`
- POST `/signals/:id/create-mission`
- GET `/communities/:id/missions?status=active` — expires stale missions (HIGH 2h, MEDIUM 6h, LOW 24h) then lists. If the active board is empty, auto-creates a LOW daily pulse for that UTC day so raiders are not sent to admin ingest.
- GET `/communities/:id/activity` — recent claims, proofs, and CTA click rewards
- GET `/missions/:id` — includes `warRoom` (pin, check-ins, claims/proofs/clicks), `nextPlay` when `?wallet=` or a Bearer session is present, `raidTarget` (the ingested post URL, if any), and `focus` when a live focus raid is locked on this community. Pins and check-ins lock when the mission expires.
- POST `/missions/:id/claim` `{ wallet? }` — SIWE Bearer token overrides body wallet; issues a personal tracked CTA; also checks the raider in; 409 if expired/completed
- POST `/missions/:id/pin` `{ body, wallet? }` — active CTO lead pins the one-line talk track (max 280). Not a chat.
- POST `/missions/:id/check-in` `{ wallet? }` — joined member taps I'm in for this raid only
- POST `/missions/:id/complete` — requires a connected wallet; 409 if expired/completed

## Submissions / Scoring
- POST `/tasks/:id/submissions` `{ wallet?, proofUrl, proofText?, engagementValue? }` — Bearer token wallet wins over body; requires a mission claim first. The bonus “Post in the linked X Community” task requires a proof URL from that Community; reply/KOL tasks still accept any x.com status URL except the raid-target tweet itself. Feed-native raid proof lives on `POST /communities/:id/feed/:postId/proof`.
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
