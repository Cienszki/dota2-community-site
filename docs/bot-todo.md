# Bots — what's still outstanding

Short list of the work that isn't done yet, across both the **lobby worker** and
the **Discord gateway**, so you don't have to hunt for it in the long documents.

The reference docs are [`lobby-bot-integration.md`](./lobby-bot-integration.md)
and [`discord-bot-integration.md`](./discord-bot-integration.md) — the full
contracts, most of which already work. Use those to look things up. Use *this*
file as the to-do list.

Status below is what we could verify against the live Firestore project on
**2026-08-13**, not a guess. Where we couldn't tell from the data, it says so
and asks rather than assuming.

**Read [Part C](#part-c--because-they-are-one-process) before planning any of
this.** Both bots running in a single process changes what the failure modes
are, and it is the reason one of the items below exists at all.

---

# Part A — lobby worker

| # | Item | Status |
|---|---|---|
| 1 | [Close empty lobbies after 5 minutes](#1-close-empty-lobbies-after-5-minutes) | **Not done** — verified |
| 2 | [Assign and hand over the host role](#2-assign-and-hand-over-the-host-role) | **Not done** — verified |
| 3 | [Stop ingesting match results](#3-stop-ingesting-match-results) | Unknown — please confirm |
| 4 | [Use the website's `lobbyName`](#4-use-the-websites-lobbyname) | Mostly done — one exception seen |
| 5 | [`slotSnapshot` shape](#5-slotsnapshot-shape) | Unknown — please confirm |
| 6 | [Touch the game doc on every visible change](#6-touch-the-game-doc-on-every-visible-change) | Unknown — please confirm |
| 7 | [Immortal Draft field name](#7-immortal-draft-field-name) | Unknown — please confirm |
| — | [Three questions for the worker](#three-questions-for-the-worker) | Need answers |

Not on this list because we confirmed it **is** done: the publish gate no longer
blocks website lobbies (every website-created game we looked at has
`published: true` with a `publishedAt`), and lobby leasing/heartbeating works
exactly as specified.

---

## 1. Close empty lobbies after 5 minutes

**The most urgent thing here.** It has already cost the community three days of
blocked hosting.

**The rule, from the owner:** a lobby closes once nobody has been in it for five
minutes. It stays up longer only while there are **real players on player
slots** — observers don't count, and neither does the lobby bot itself.

**What we found.** Two lobbies had been sitting `open` and completely empty for
**62 hours** and **16 hours**, each holding one of the five Steam accounts. With
`maxOpenLobbies` at 2, that refused everyone in the community a new lobby for
the entire time. The bot was healthy throughout — heartbeating both leases
normally. That is the point: a healthy bot keeping a dead lobby alive blocks
hosting exactly as effectively as a crashed one.

**Why it has to be you.** The website can now *decide* a lobby is dead, and
does. It cannot *close* one. Marking `expired` in Firestore hides the card,
frees the cap slot and releases the lease — but the Dota lobby carries on
existing, still listed in the in-game browser, still joinable by anyone who
searches the name, and now completely unknown to the site. That is worse than
the state it replaced. Only you can destroy the lobby.

So please implement this in the bot as the primary mechanism. What the website
does is a backstop for when you're down.

**What the website now does**, on every `/inhouse` page load, before opening a
lobby, before revealing join credentials, and on the ingest cron:

| Condition | Result |
|---|---|
| `lobby_creating` for > 5 min | `failed` |
| Lease heartbeat stale > 6 min while `open`/`ready` | `expired` |
| No player on a playing slot for > 5 min | `expired` |
| Players seated but no slot activity for > 3 h | `expired` |

Each sends you `end_inhouse_session` with a `reason` naming which one fired. See
§2.3 of the reference doc for the full mapping.

**One thing that would silently break all of it:** the five-minute clock reads
`slotSnapshot.updatedAt` as "empty since". If anything rewrites that timestamp
without the slots actually changing — a periodic refresh, a heartbeat-style
touch — the clock resets on every pass and no empty lobby ever closes again.
Move it on real slot changes only.

You already write the snapshot correctly when a lobby empties: on live data it
landed one second after the last player left. That's the fact the whole
mechanism rests on, so please keep it.

---

## 2. Assign and hand over the host role

**Not started** — no game document in the project carries a host field of any
kind. The only host-ish fields present are `initiatorDiscordId`,
`initiatorSteamId32` and `initiatorName`.

Opening a lobby on the website no longer requires an account, so games now
arrive with **no host at all**. We found three such games already
(`initiatorDiscordId: ""`, `initiatorName: "Gość"`). Somebody in the lobby has
to become host, and only you can see who is actually sitting in a slot.

The rule, what to write, and the chat notification are specified in
[§8a of the reference doc](./lobby-bot-integration.md#8a-automatic-host-handover--new-and-it-has-to-be-yours).
Short version: **the longest-seated player on a playing slot** (earliest
`joinedAt`), excluding the bot account; announce it in lobby chat 5 seconds
later.

---

## 3. Stop ingesting match results

Don't call `ingestMatchResult` / `writeMatchResult`. Write `dotaMatchId` and
POST the webhook instead — [§4](./lobby-bot-integration.md#4-match-end--the-website-owns-ingestion).

**We could not verify this.** The only match records in the project are five
seeded demo matches (`9000000001`–`9000000005`); no real inhouse has been played
through the new pipeline yet, so there is nothing to check for double-counting.

While both sides ingest, every player's `gamesPlayed` counts each match twice.
The attendance ledger survives it; the counters don't. **Please confirm this is
switched off before the first real match.**

---

## 4. Use the website's `lobbyName`

The site picks a name from a table of diacritic-free Polish nouns and writes it
before enqueuing `create_inhouse_lobby`. Only generate your own when it is
null — and write back whatever you generated.

**Mostly working.** Games #5 `agat`, #2 `zorza` and #7 `trzmiel` all carry names
from the website's table. But game **#4 was named `sopel`, which is not in it** —
either that game predates the table or the bot overrode the name. Worth a look;
if it's the latter it's a live bug, since players search Dota's lobby browser
for the name the site displays and that's how most people join.

---

## 5. `slotSnapshot` shape

`inLobby` and `reserved` must be **disjoint** and must sum to `committed`.

**We could not verify this** — every snapshot we could inspect was empty. The
lobby card paints a ten-segment ring (red per player present, amber per held
slot); if the two overlap, the ring disagrees with the number in its own middle.
Details in [§3.1](./lobby-bot-integration.md#31-slotsnapshot--the-one-that-matters-most).

---

## 6. Touch the game doc on every visible change

Including a side swap or a `displayName` refresh, not only when the head-count
moves. The website re-reads `memberships` only when the game document changes,
so too narrow a fingerprint leaves the visible player list stale.

**We could not verify this** from static data. Note this is the *game document*,
which is a different field from `slotSnapshot.updatedAt` in item 1 — that one
must move only on real slot changes. Both are correct at the same time.

---

## 7. Immortal Draft field name

The field you were missing is `do_player_draft`. See
[§9.4](./lobby-bot-integration.md#94-immortal-draft--the-field-is-do_player_draft).

---

## Three questions for the worker

**1. How do you record observers?** The website counts a lobby as occupied only
when someone is on `radiant`, `dire` or `unassigned` — `computeSlots` filters on
`PLAYING_SIDES`, which excludes `spectator`. That is what makes "observers don't
count" work in item 1. If observers are currently written as `unassigned`
instead, a lobby holding nothing but spectators will look occupied and never
close. Which do you do?

**2. Can you release leases on a clean shutdown?** A redeploy that leaves
accounts heartbeat-stale for more than six minutes will have the website expire
lobbies that were only waiting for you to come back. Under six minutes nothing
happens, so this only matters for slow deploys.

**3. Can you fill in `botAccounts.steamId32`?** Every account in the pool
currently has `steamId` and `steamId32` set to `""`. Nothing depends on it today
— the bot correctly keeps itself out of its own slot snapshot — but it's the
field that would let the site verify that rather than trust it.

---

# Part B — Discord gateway

Far less than the worker. Four items, and two of them may already be done — we
can see Firestore but not Discord, so these are honest unknowns rather than
accusations.

| # | Item | Status |
|---|---|---|
| 8 | [Handle `inhouse_ban_lifted`](#8-handle-inhouse_ban_lifted) | Never exercised — verified |
| 9 | [Host panel for website-created games](#9-host-panel-for-website-created-games) | Unknown — please confirm |
| 10 | [Don't increment `gamesPlayed`](#10-dont-increment-gamesplayed) | Unknown — please confirm |
| 11 | [Apply the lobby cap if you add a Discord create path](#11-apply-the-lobby-cap-if-you-add-a-discord-create-path) | Only if that path exists |

Deprioritised on evidence, previously listed as open questions:

- **DST on recurring slots.** `inhouseConfig/schedule` is an empty document —
  no schedule is configured, so nothing can drift across DST yet. Real once
  somebody sets one up; not urgent now.
- **Ping roles and regions.** `region` is set on **0 of 10** players. Still
  unused, still worth settling before a live board is built around a single
  region — but nothing is broken today.
- **Auto-publish fallback.** Hypothetical until publish rate is measured.

**Decided, so not a task:** when the website expires an empty lobby, the gateway
announces **nothing**. No DM, no channel post. The card disappears from the
board and that is the whole of it.

---

## 8. Handle `inhouse_ban_lifted`

Add the case to the `onWorkerEvent` switch in `src/discord/watcher.ts` and call
the `liftBan()` that already exists — roughly ten lines.
[§2.2](./discord-bot-integration.md#22-inhouse_ban_lifted).

Without it, an unban restores lobby access but silently leaves the Discord role
removed: the person is told they are unbanned and still cannot see the channels.

**What we found.** `inhouseModeration` is **empty** — not one ban has ever been
issued. So neither `inhouse_ban_created` nor `inhouse_ban_lifted` has ever been
emitted in production, and the whole ban path is untested end to end rather than
merely half-built. Worth exercising both directions once before relying on it.

For reference, the gateway queue is clearly live: `botEvents` holds 260 events
and all but one are marked processed. They are all lobby-worker events
(`heartbeat`, `lobby_state_update`, `lobby_created`, `player_joined`, …) — the
website's `inhouse_*` events have simply never had cause to fire.

---

## 9. Host panel for website-created games

Check whether your card/panel creation triggers off the **game document
appearing**, or only off a Discord-initiated flow. If it is the latter, a host
who opens a lobby on the website gets no DM panel.

The website deliberately sends no command for this — creation is a document
write you already watch. [§3.1](./discord-bot-integration.md#31-games-created-from-the-website-need-a-host-panel).

This matters more than it used to: opening a lobby on the site no longer needs
an account, so games now arrive with **no host at all** — we found three already
(`initiatorDiscordId: ""`, `initiatorName: "Gość"`). Those interact with
[item 2](#2-assign-and-hand-over-the-host-role): the worker picks a host from
the players actually seated, and the panel should follow whoever that turns out
to be rather than the person who pressed the button.

---

## 10. Don't increment `gamesPlayed`

Result ingestion moved to the website. Same warning as
[item 3](#3-stop-ingesting-match-results) on the worker side, and the same
reason we cannot check it: the only match records in the project are five seeded
demo matches, so there is nothing yet that could reveal double-counting.

If both the gateway and the website increment, every player's `gamesPlayed`
counts each match twice. Please confirm before the first real match.

---

## 11. Apply the lobby cap if you add a Discord create path

`inhouseConfig/lobby.maxOpenLobbies` (currently 2) is enforced by the website on
its own create path. If a lobby can also be started from Discord, that path has
to check the same value, or the cap is bypassed by starting the game from
Discord instead of the site.
[§5.1](./discord-bot-integration.md#51-the-open-lobby-cap).

**Only a task if such a path exists** — we could not tell from Firestore whether
it does. If every lobby is created from the website, close this item.

---

# Part C — because they are one process

Both bots running as a single process is a real simplification, and it has one
consequence worth writing down rather than discovering.

**When the process dies, nothing on the bot side is left to say so.** The lobby
worker's own stuck-game sweeper is inside it. The gateway that could have posted
"the worker is down" is inside it too. Every Firestore-side signal — lease
heartbeats, slot snapshots, event processing — stops at the same instant, and
they all stop together.

That leaves exactly one thing still running: the website. Its reconcile is
described in [item 1](#1-close-empty-lobbies-after-5-minutes), and with one
process it is not a second line of defence but **the only one**. It will expire
the lobbies and hand the Steam accounts back, so the community is never blocked.
It cannot restart the bot, and it cannot tell anyone the bot is gone.

Two things follow:

1. **You need uptime monitoring outside the process.** Anything that pings a
   health endpoint or watches the deployment will do — the point is only that it
   must not be the thing it is watching. Without it, the first person to notice
   an outage is a player wondering why lobbies keep vanishing.

2. **A slow deploy now expires live lobbies.** The website writes a lobby off
   after **six minutes** without a lease heartbeat, and a restart stops
   heartbeating everything at once. Under six minutes, nothing happens. Over it,
   lobbies that were only waiting for you to come back are already closed and
   their accounts re-pooled — so
   [worker question 2](#three-questions-for-the-worker) (releasing leases on a
   clean shutdown) matters more here than it would with two processes.

If the two ever do split into separate processes, tell us: the gateway would
then be able to watch the lease heartbeats itself and announce a silent worker
in an admin channel, which is strictly better than waiting for a player to
notice.
