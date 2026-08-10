# Inhouse — where this stands

Written 2026-08-07, updated 2026-08-10.

**The site is live and connected to the bot's Firestore.**
`https://dota2-community-site-291p-zeta.vercel.app` serves real game documents
from `/api/inhouse/board`; `dota2inhouse.pl` still points at the old Firebase
app until the domain cutover. Earlier revisions of this document called the
Firestore credential the blocker — it isn't, and hasn't been since the index
deploy. That confusion is worth naming: deploying indexes uses an interactive
**Firebase CLI login**, which is a different credential from the site's
`FIREBASE_SERVICE_ACCOUNT_BASE64`, so "indexes deployed" and "the site can read"
were true at different times.

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
- **Ingest sweep is scheduled** — `.github/workflows/inhouse-ingest.yml` hits
  `GET /api/cron/inhouse-ingest` every 10 minutes with the `CRON_SECRET` bearer
  token. Needs two repository secrets (`INHOUSE_SITE_URL`, `CRON_SECRET`).

  It was briefly a `vercel.json` cron instead, and that was a mistake worth
  recording: Vercel's Hobby plan rejects sub-daily schedules **at build time**,
  so rather than degrading to daily it failed every deployment — ten commits
  shipped nothing before the cause was spotted. The plan-independent scheduler
  is the safer default regardless of tier.
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
| Ingest cron lives in a GitHub Action, not `vercel.json` | Vercel Hobby rejects sub-daily crons at build time — it fails the deploy rather than degrading. Actions runs every 10 min on any plan |

---

## The stuck-lobby incident, 2026-08-10

Worth recording, because the failure mode was not one anybody had designed for.

The lobby bot in production was still the old tournament-only deployment, so it
never consumed `create_inhouse_lobby`. Two games — #1 `sierp` and #2 `flaga` —
were created, leased a Steam account each, moved to `lobby_creating`, and stayed
there for 55 and 12 hours.

That was not a harmless orphan. `lobby_creating` counts toward the
concurrent-lobby cap (deliberately — it closes a double-create window), the cap
is 2, so **hosting was refused site-wide**: `/inhouse/new` showed "Otwarte są
już 2 lobby" to everyone, forever, with no way out but a manual admin
force-release.

Two fixes, deliberately different:

- **`src/lib/inhouse/sweep.ts`**, run first on every ingest-cron pass: a game
  idle in `lobby_creating` for over 5 minutes is moved to `failed` and its Steam
  account released. `failed` is outside both the board states and the recruiting
  states, so it stops blocking and stops rendering while the record survives.
  The bot has its own stuck-game sweeper, but it runs *inside the worker* and is
  therefore down in exactly the case that causes this — a backstop sharing a
  failure mode with the thing it backs up is not a backstop.
- **`scripts/inhouse-purge-games.mjs`** for erasing games as if they never
  existed, including rewinding the game-number counter so the sequence has no
  permanent gap. Dry-run by default; refuses any game with attendance rows or a
  match record. A script rather than an admin button, because deleting a game is
  irreversible, needed roughly never, and a button that does it is a button
  someone eventually presses by accident.

---

## Next steps, in order

1. **Lobby bot deployment.** The production worker is still tournament-only, so
   no lobby can actually be created yet. In progress with the bot developer;
   everything below is downstream of it.
2. **Verify one lobby end to end** once that lands: press Otwórz lobby, confirm
   the Dota lobby appears with the name and password the *website* assigned
   (that path has never run successfully — the bot's own fix for it is
   unverified), join it, play it, and confirm the result ingests.
3. **Immortal Draft on a throwaway lobby.** Wired on the bot side, never
   confirmed against a live GC, and unverified whether it combines with
   `selection_priority_rules = 1`.
4. **Medals — needs a decision first.** See above.
5. **Domain cutover** — `dota2inhouse.pl` to Vercel; see
   [`tournament-site-domain-cutover.md`](./tournament-site-domain-cutover.md).
