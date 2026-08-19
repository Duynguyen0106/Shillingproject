# PRD - Memecoin Shill Ops + Community Growth

Phase 1 focuses on six capabilities: mission board, signal ingest, auto mission creation, notifications, submission+points+leaderboard, and shortlink attribution.

Communities are uniquely bound to a DexScreener chain + contract so users can search a mint and land in the real ops space instead of a cloned CTO chat. Signals ingest against that same mint, not a Telegram name. DexScreener paid profile / community-takeover orders are shown as extra proof, never as a substitute for matching the contract.

CTO lead is a seat inside that community, not a second community. The first binder is lead. They can resign, or the seat opens after 48 hours of inactivity, and another joined wallet can claim it on the same mint.

Each mission has a short war room: the lead pins one narrative line, joined wallets tap I'm in, and the room locks when the mission expires. There is no standing chat. Hype is meant to happen on X/Telegram using the pinned talk track and tracked CTAs.

The CTO lead can bind one X Community URL to the mint. It shows on the token hub. New missions then include a bonus “post in that Community” task. Main raid proofs stay any X status URL so reply-guying is not blocked.

Missions are dealt from a finite playbook, not an infinite task dump. Standing plays (reply the narrative, Telegram share, invite, plus X Community / Dex comment when those URLs are bound) do not wait on live X posts, KOL mentions, or volume. A daily pulse is auto-created when the board would otherwise be empty. Triggered overlays (quote the KOL/mention/pump) are added only when a matching signal is ingested. Ingest is still mock/admin today; a real crawler would use the same `/signals/ingest` bus. Each wallet gets a personal next-play order on a claimed mission.

The raid feed is the primary ops surface. The CTO lead watches KOL handles. With `TWITTERAPI_IO_KEY` or `X_BEARER_TOKEN`, the API pulls those timelines and searches for the ticker/CA, including bios, follower/following counts, and post likes/replies/reposts/quotes/views. Members open `/app/feed`, search the watch list, filter by KOL / min followers / min interaction, sort newest or hottest, then click **Shill this**. A mention of the coin or contract notifies Telegram/Discord immediately so the whole room piles on that URL.
