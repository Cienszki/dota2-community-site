# Inhouse — where this stands

Written 2026-08-07, on branch `feature/inhouse-integration`.

The website half is built. **None of it has ever run against the bot's real
database**, because no Firestore credentials have been configured — everything
below has been verified against fixtures, typechecks, a production build, and
the live OpenDota API, and nothing else.

Setup lives in [`inhouse-setup.md`](./inhouse-setup.md). Handover docs for the
bot developers: [`lobby-bot-integration.md`](./lobby-bot-integration.md) and
[`discord-bot-integration.md`](./discord-bot-integration.md) — each opens with a
"what you must change" table.

---

## Next steps, in order

### 1. Connect to the bot's Firestore — blocks everything

`FIREBASE_SERVICE_ACCOUNT_BASE64` is unset, so `isInhouseConfigured()` is false
and every inhouse surface renders its "unavailable" state. That reads as a
working site with no games in it, which is why it is easy to miss.

Get a service-account key from the Firebase project **the lobby bot already
uses**. Do not create a new one — a fresh project is an empty database and every
page will correctly show nothing. See [`.env.example`](../.env.example).

This also unblocks the bot developers, who cannot test their side against a
website that isn't connected.

### 2. Build the match page

`inhouseMatches/{dotaMatchId}` now stores kill score, the full roster with heroes
and sides, and per-player stats. `/inhouse/[id]` still renders only the thin
`game.result` — winner and duration. So the data is collected and none of it is
visible. No bot dependency; entirely ours.

### 3. Schedule the ingest sweep

`/api/cron/inhouse-ingest` exists and is authenticated, but nothing calls it.
This repo already has the pattern in `.github/workflows/sync-player-stats.yml`.
Without it, matches still ingest via the webhook, but replay parses are never
folded in, so the silly awards never appear.

### 4. Create the composite indexes

Listed in [`inhouse-setup.md` §3](./inhouse-setup.md). Firestore logs a creation
link the first time each query fails, so this can also be done reactively.

### 5. Medals — needs a decision first

Per-player stats are being captured for this ([`match-record.ts`](../src/lib/inhouse/match-record.ts),
`STAT_FIELDS`), and `/api/cron/inhouse-backfill` can pull the league's whole
history in. What's missing is the category list — the exact medals, and whether
they are all-time or per-season.

---

## Known gaps on our side

Small, none blocking:

- **A finished match vanishes from the board until reload.** SSE carries live
  games only, so when a match ends it leaves the cards and doesn't appear in
  history until the next poll or a navigation.
- **`/inhouse/[id]` is not live.** Plain server render; needs a reload to reflect
  anything.
- **The roster depends on the game document changing.** Player names come from
  the `memberships` sub-collection, which the live listener doesn't watch — it
  re-reads them when the parent game document fires. Documented as a requirement
  for the bot (touch the game doc whenever anything rendered changes), but it
  could be made robust here instead with a second listener.
- **The spectate link was never verified** and is currently unused. The helper is
  kept in `display.ts` with its findings; spectating is deferred.

## What waits on the bot developers

Full detail in their two documents. In short:

**Lobby bot** — stop ingesting results (this one corrupts `gamesPlayed` while
both sides do it), honour the website's `lobbyName`/`lobbyPassword`, make
`slotSnapshot.inLobby` and `reserved` disjoint, don't let `publishGateGames`
block website lobbies, add `do_player_draft` for Immortal Draft.

**Discord bot** — handle `inhouse_ban_lifted`, and confirm host panels fire for
games created from the website.

---

## Decisions already made

Recorded so they don't get relitigated:

| Decision | Why |
|---|---|
| Website owns result ingestion; the bot only notifies | One source for who played, one place that owns the counters |
| OpenDota, not the Steam Web API | It has the match list *and* the parse request; the Steam API has neither |
| Match records keyed on `dotaMatchId`, not `gameId` | League backfill covers matches that were never games here |
| Lobbies created on the website auto-publish | Unpublished is a Discord affordance — choosing who to tell first |
| Two concurrent published lobbies, configurable | A third splits the same players three ways and none reach ten |
| Lobby names from a fixed diacritic-free table | The name's job is to be typed into Dota's lobby browser |
| Per-player stats stored but not displayed | §10 rules out rivalrous public stats; medals are awards, not a ladder |
| Backfilled league matches write no ledger or counters | Back-crediting `gamesPlayed` from arbitrary history rewrites every profile |
