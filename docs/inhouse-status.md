# Inhouse — where this stands

Written 2026-08-07, updated 2026-08-08 after the bot-side fixes landed (see
"Bot-side work" below) and a follow-up website pass.

The website half is built. **None of it has ever run against the bot's real
database**, because no Firestore credentials have been configured yet —
everything below has been verified against fixtures, typechecks, a production
build, and the live OpenDota API, and nothing else. That is the single blocker
before anything here can be verified for real.

Setup lives in [`inhouse-setup.md`](./inhouse-setup.md). Handover docs for the
bot developers: [`lobby-bot-integration.md`](./lobby-bot-integration.md) and
[`discord-bot-integration.md`](./discord-bot-integration.md) — each opens with a
"what you must change" table.

---

## Bot-side work — done

The lobby bot developer closed every item on the "what you must change" table,
plus a sixth bug found along the way. In short:

- **Result ingestion moved here.** The bot no longer calls `ingestMatchResult`;
  it writes `dotaMatchId`, leaves `state: in_progress`, and POSTs
  `/api/inhouse/matches/finished`. The website is now the only writer of the
  ledger and counters — the `gamesPlayed` double-count is resolved.
- **`lobbyName`/`lobbyPassword` are now honoured.** The worker was reading a
  flat `command.lobbyName` field the website never sent (it sends
  `command.lobby.name`), so it silently generated its own name and password on
  every lobby, ever. Fixed. Worth re-verifying end to end once connected —
  see Part 4 of the handover, reproduced for the operator separately.
- **`!publish` no longer refuses the lobby's own host.** `publishGateGames`
  never touched the website's publish path (that writes the field directly);
  the actual defect was in lobby chat. Fixed.
- **Immortal Draft is wired** (`do_player_draft`, field 53 — Valve's internal
  name is "player draft", not "immortal"). **Still unverified against a live
  GC** whether it combines with `selection_priority_rules = 1`. Don't build UI
  promising automatic team assignment until that's confirmed.
- **Steam account lease renewal bug, found and fixed** (not on the original
  list): leases were never renewed, so any lobby older than 3 minutes was
  eligible to have its account reassigned mid-game. No action needed here;
  historical data from before this fix may be odd.
- `slotSnapshot.inLobby`/`reserved` needed no change — already correct.

**Vendored core:** re-synced. The only diff was a doc comment on
`immortalDraft` in `types.ts` — verified independently by diffing against the
bot repo before copying. Zero behavioural drift.

---

## Website-side work since the handover

- **Match page now shows kill score and hero picks**, sourced from
  `inhouseMatches/{dotaMatchId}`. Kill score is team-level (`radiantScore` /
  `direScore`), shown next to the existing winner/duration line. Each roster
  row gets the player's hero icon when the match record has resolved.
  **Per-player numeric stats (KDA, GPM, damage, …) are still never rendered** —
  §8 rules those out everywhere, on any page. `match-record.ts`'s `stats` field
  stays exactly what its comment says: stored for medal derivation, not
  displayed.
- **Ingest sweep is scheduled.** `vercel.json` runs
  `GET /api/cron/inhouse-ingest` every 10 minutes; Vercel injects the
  `Authorization: Bearer $CRON_SECRET` header itself once that env var is set —
  no extra wiring. **Caveat:** Vercel's Hobby plan only runs cron jobs once a
  day regardless of the configured schedule; the 10-minute cadence needs a Pro
  plan (or an external scheduler hitting the same URL) to actually run at that
  rate.
- **Fixed: a finished match no longer vanishes from the board.** The live SSE
  feed previously carried `open`/`ready`/`in_progress` games only, so a match
  that finished disappeared from the cards and didn't reappear in history until
  the next 5s poll or a navigation — which only happened at all once SSE had
  already failed over to polling. `live.ts` now runs a second, bounded
  Firestore listener over the most recent finished games (same query, and same
  composite index, `listRecentFinishedGames` already needed) and pushes a
  combined `{ live, recent }` snapshot on either side changing. SSE and polling
  now agree.

---

## Known gaps on our side

- **`/inhouse/[id]` is not live.** Plain server render; needs a reload to
  reflect anything. Deliberately left as-is for now — the page is still
  correct at load time, this is a freshness gap, not a correctness one, and
  it's a bigger change (the page would need a client-side subscription of its
  own) for a smaller payoff than the board fix above.
- **The roster depending on the game document changing** is no longer a gap to
  fix here — the bot now touches the game document on any membership identity
  change (name, persona, side), not just headcount. A second listener over
  `memberships` directly remains optional, not a correctness requirement.
- **The spectate link was never verified** and is currently unused. The helper
  is kept in `display.ts` with its findings; spectating is deferred.
- **Medals need a product decision before code.** Per-player stats are
  captured (`match-record.ts`, `STAT_FIELDS`) and `/api/cron/inhouse-backfill`
  can pull a league's whole history in, so the data side is ready. What's
  missing is the category list — the exact medals, and whether they're
  all-time or per-season. Don't start building until that's answered.

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
| Match page shows kill score + hero picks, never per-player numbers | Team score and "who played what" aren't rankings; KDA/GPM/damage are |
| Ingest cron lives in `vercel.json`, not a GitHub Action | Vercel injects the bearer token itself; one less secret to keep in sync |

---

## Next steps, in order

1. **Connect to the bot's Firestore — still blocks everything.**
   `FIREBASE_SERVICE_ACCOUNT_BASE64` is unset in every environment, so
   `isInhouseConfigured()` is false and every inhouse surface renders its
   "unavailable" state. Full checklist (this and everything else that needs
   dashboard access) was handed to the site operator directly rather than
   duplicated here — see the conversation, or ask for it again.
2. **Composite indexes.** Listed in [`inhouse-setup.md` §3](./inhouse-setup.md).
   Firestore logs a creation link the first time each query fails, so this can
   also be done reactively.
3. **Medals — needs a decision first.** See above.
