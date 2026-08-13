# Lobby bot ↔ website integration

For the developer working on the **lobby worker** — the process that holds a
Steam account, talks to the Dota 2 Game Coordinator, and runs the actual lobby.

The website never touches the GC. Everything it wants done, it asks for by
writing to Firestore; everything it displays, it reads from Firestore. This
document is the complete list of both directions.

**Looking for what's still outstanding? That's
[`bot-todo.md`](./bot-todo.md)** — a short list of the open work for both bots,
with what we could and couldn't verify against the live project. This document
is the reference: the full contract, most of which already works. Use it to look
things up.

Companion document: [`discord-bot-integration.md`](./discord-bot-integration.md)
for the gateway. The general design rules live in
[`../website-integration.md`](../website-integration.md) — read §0 there first if
you haven't; the invariants in it are easy to break by accident.

---

## Contents

- [0. Start here — what you must change](#0-start-here--what-you-must-change) → moved to [`bot-todo.md`](./bot-todo.md)
- [0a. Configuration you need](#0a-configuration-you-need)
- [1. The two channels](#1-the-two-channels)
- [2. Commands the website sends](#2-commands-the-website-sends)
- [3. What the website expects you to write](#3-what-the-website-expects-you-to-write)
- [4. Match end — the website owns ingestion](#4-match-end--the-website-owns-ingestion)
- [5. The lobby lifecycle, end to end](#5-the-lobby-lifecycle-end-to-end)
- [5a. Closing an empty lobby — NEW](#5a-closing-an-empty-lobby--this-one-has-to-be-yours)
- [6. Reservations and the waitlist](#6-reservations-and-the-waitlist)
- [7. Account leasing](#7-account-leasing)
- [8. Player identity and linking](#8-player-identity-and-linking)
- [8a. Automatic host handover — NEW](#8a-automatic-host-handover--new-and-it-has-to-be-yours)
- [9. Open items — decisions needed from you](#9-open-items--decisions-needed-from-you)
- [10. Testing without the website](#10-testing-without-the-website)
- [Appendix: what we rely on from OpenDota](#appendix-what-we-rely-on-from-opendota)

---

## 0. Start here — what you must change

This list moved to its own file: **[`bot-todo.md`](./bot-todo.md)**.

It was living here, mixed into a document that is mostly describing a seam which
already works — which made the outstanding items hard to find and easy to
mistake for things already built. The to-do file carries the status of each one,
verified against the live Firestore project rather than assumed.

Everything from §0a onwards is reference material.

---

## 0a. Configuration you need

Two values, and one of them is new.

| Setting | Value | Notes |
|---|---|---|
| Firestore project | The same one you already use | Nothing changes; the website uses the Admin SDK against it |
| `SITE_URL` | e.g. `https://pd2ih.pl` | Must match the website's `NEXT_PUBLIC_SITE_URL` exactly — www/non-www drift breaks OAuth returns |
| `INHOUSE_BOT_WEBHOOK_SECRET` | **New.** A shared secret | Sent as `Authorization: Bearer <secret>` on the match-finished webhook. Same value on both sides |

Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The website will not accept the webhook at all until this is set on its side —
it fails closed, so an unset secret is a 401 rather than an open endpoint.

---

## 1. The two channels

**Commands** — website → one specific worker.

```
botCommands/{botAccountId}/queue/{autoId}
```

```jsonc
{
  "botAccountId": "bot_01",
  "command": { "type": "create_inhouse_lobby", "gameId": "…", "lobby": { … } },
  "status": "pending",
  "createdAt": "2026-08-07T19:04:11.238Z"   // ISO string, NOT a Timestamp
}
```

`createdAt` **must** stay an ISO string — you parse it with `new Date()` and
expire anything older than five minutes. A Firestore `Timestamp` here produces a
command that is written, accepted, and never executed, with no error anywhere.

The website only ever enqueues against `game.botAccountId`. If a game has no
leased account the command is dropped with a server-side warning rather than
written to a queue nobody is reading — so an empty queue for a game in `draft`
is expected, not a bug.

**State** — worker → website, by writing the game document. There is no reply
channel for commands. The website learns a command worked because the document
changed; it never waits on an acknowledgement, and it must render correctly at
every intermediate step.

Source of truth on the website side:
[`src/lib/inhouse/commands.ts`](../src/lib/inhouse/commands.ts). If this document
and that file disagree, the file is right.

---

## 2. Commands the website sends

### 2.1 `create_inhouse_lobby`

Sent once, immediately after a game is created and an account leased. This is
the only command that carries a full payload.

```jsonc
{
  "type": "create_inhouse_lobby",
  "gameId": "kQ2f…",
  "lobby": {
    "name": "Wichura",           // lobby name — see the note below
    "password": "pd2ih",
    "gameMode": 22,              // DOTA_GameMode
    "serverRegion": 3,           // EServerRegion
    "dotaTvDelay": 120,          // seconds; one of 10 / 120 / 300 / 900
    "leagueId": 18234,           // 0 means "not configured" — see §9.3
    "selectionPriorityRules": 1, // 0 = manual, 1 = coin flip
    "published": true,          // always true from the website; see below
    "cheatsEnabled": false,
    "fillWithBots": false,
    "allowSpectators": true,
    "pauseSetting": 1            // 0 unlimited, 1 limited, 2 disabled
  }
}
```

**The payload is redundant on purpose.** Every field is also on
`inhouseGames/{gameId}`, and reading the document instead is completely fine —
the document stays authoritative. The payload exists so the command is legible,
loggable and replayable on its own.

**Lobby visibility is deliberately not in the payload.** Derive it from
`published` so the two can never drift:

```
published === false  →  Unlisted (2)
published === true   →  Public   (0)
```

Note that **every lobby created from the website now arrives with
`published: true`**, so in practice `lobby.published` is true on every
`create_inhouse_lobby` you receive and the lobby should be Public from the
moment it exists. Unpublished lobbies still happen — they are the Discord path,
where a host chooses who to tell first — so keep handling both.

The password gates entry either way; visibility only controls whether the lobby
is discoverable in the in-game browser.

> ### ⚠️ `name` and `password` are assigned by the website
>
> This is the one behaviour change this integration needs from you.
>
> The website picks the lobby name from a table of 1000 Polish nouns
> ([`lobby-names.ts`](../src/lib/inhouse/lobby-names.ts)) and writes it to
> `game.lobbyName` **before** sending this command. It deliberately avoids Polish
> diacritics, because the name's whole job is to be typed into Dota's lobby
> browser search box by someone who may not have a Polish keyboard layout. Names
> currently in use by other live lobbies are excluded, so two lobbies can never
> collide in that search.
>
> The password comes from the admin panel (`inhouseConfig/lobby.password`) and is
> one shared value for every lobby, not per-game.
>
> **If `lobby.name` or `lobby.password` is non-null, use it. Do not generate your
> own.** Generating one overwrites the name the website is already showing on the
> live board and in the join dialog, and players will search for a lobby that
> does not exist under that name.
>
> Falling back to generating one when the field is `null` is correct and
> expected — write whatever you generated back to `game.lobbyName` /
> `game.lobbyPassword` so the website can display it.

### 2.2 `invite_player`

Sent when a linked player presses **Dołącz** on the website and either gets a
reservation or lands on the waitlist.

```jsonc
{
  "type": "invite_player",
  "gameId": "kQ2f…",
  "steamId32": "123456789",
  "discordId": "2489…",     // may be null
  "playerName": "Wichura"   // may be null; for your logs, not for identity
}
```

Fire the Steam invite. `steamId32` is the identity that matters; the other two
are context.

Note this is also sent for **waitlisted** players, not only for those who got a
slot. A lobby can empty out between the reservation failing and the player
opening Dota, and an invite they already hold is what lets them walk straight in
when it does. Inviting someone who cannot currently be seated is harmless.

### 2.3 `end_inhouse_session`

```jsonc
{ "type": "end_inhouse_session", "gameId": "kQ2f…", "reason": "cancelled from website" }
```

Sent when a host closes their own lobby from the game page, when an admin
force-releases a Steam account from the bot pool page, **and now also whenever
the website's reconcile writes a lobby off** (see [§5a](#5a-closing-an-empty-lobby--this-one-has-to-be-yours)).

**The website has already moved the game to a terminal state before sending
this.** Which one depends on why:

| `reason` | Game is now | What happened |
|---|---|---|
| `cancelled from website` | `cancelled` | A host or admin closed it |
| `lobby creation timed out` | `failed` | You never moved it out of `lobby_creating` |
| `worker went silent` | `expired` | Your lease heartbeat went stale while the lobby was open |
| `lobby empty of players` | `expired` | Nobody in a player slot for 5 minutes |
| `lobby idle with players seated` | `expired` | Players present but no slot activity for 3 hours |

Close the Dota lobby and release the account; do not try to transition the game
yourself, and do not treat an already-terminal game as an error. If you never
receive this command — the website sends it best-effort — the lease heartbeat
timeout reclaims the account anyway.

### 2.4 Typed but not yet sent

These exist in the website's command union so the contract is written down in
one place, but no surface emits them today. Nothing to build yet; flagged so the
type doesn't surprise you.

| Command | Payload | Intended trigger |
|---|---|---|
| `kick_player` | `{ gameId, steamId32, reason }` | Admin moderation, if kicking is ever separated from banning |
| `start_game` | `{ gameId }` | A host "start now" button — deliberately not built; see §7.3 |
| `send_chat` | `{ gameId, message }` | Announcements into lobby chat |
| `ingest_match_result` | `{ gameId, dotaMatchId }` | Admin re-ingest of a match whose result never landed |

---

## 3. What the website expects you to write

Everything in this section is read by the website. Nothing here is optional if
the corresponding surface is to work.

### 3.1 `slotSnapshot` — the one that matters most

Written on `inhouseGames/{gameId}`. This is the single record every surface
reads for "how full is this lobby", so Discord and the website say the same
thing at the same moment.

```jsonc
{
  "inLobby":    ["123456789", "987654321"],  // steam32, playing sides only, bot excluded
  "radiant":    ["123456789"],
  "dire":       ["987654321"],
  "unassigned": [],
  "committed":  7,        // inLobby.length + pending reservations
  "slotsOpen":  3,        // 10 - committed, floored at 0
  "reserved": [
    { "discordId": "…", "steamId32": "…", "playerName": "Nocnik",
      "expiresAt": "2026-08-07T19:09:11.000Z" }
  ],
  "updatedAt": "2026-08-07T19:04:31.000Z"
}
```

The lobby card renders a ten-segment ring directly from this, in two colours:

- **red** — `inLobby.length` segments: people actually standing in the lobby
- **amber** — `reserved.length` segments: slots held for someone who pressed
  Join and hasn't arrived
- faint — the remainder

So `inLobby` and `reserved` must be **disjoint**, and
`inLobby.length + reserved.length` must equal `committed`. The website clamps if
they disagree, but the ring then stops matching the number in its middle.

`reserved` must contain only *pending* reservations — active, unexpired, and
whose owner is **not** already in the lobby. That last clause is the whole
double-count fix: a reservation stops counting the instant its owner walks in.
Miss it and a website joiner is counted twice, and the lobby looks full at nine.

Write it whenever the picture a human would see actually changes. Fingerprint it
so an identical snapshot isn't rewritten — the website holds a Firestore
`onSnapshot` on this collection and fans every change out to browsers over SSE,
so noise writes become noise frames.

### 3.2 `memberships/{steamId32}`

```jsonc
{
  "steamId32": "123456789",
  "discordId": "2489…",       // null when never linked
  "playerName": "Wichura",    // Steam persona, from the GC
  "displayName": "Wichu",     // Discord server nickname, when linked
  "side": "radiant",          // radiant | dire | spectator | unassigned
  "slot": 0,
  "joinedAt": "…", "leftAt": null,
  "present": true             // denormalized so the hot query needs no index
}
```

The website builds the visible player list on each lobby card from this — the
`Wichura | Zenith | Kv1 | …` line — because `slotSnapshot` carries Steam IDs and
a Steam ID is not a name. It filters to `present === true` and `leftAt === null`
on a playing side, then orders by `joinedAt`.

Name preference on display is `displayName` → `playerName` → `Player {id}`, so
keeping `displayName` current is what makes people recognise each other.

**Never delete a membership row.** It is the ban-identity record and the
retroactive-credit source. Mark `present: false` and set `leftAt`.

### 3.3 State transitions

```
draft → lobby_creating → open → ready → in_progress → finished
             │             │                  │
             │             │                  └─ abandoned (result never arrived)
             │             └─ expired / cancelled
             └─ failed (lobby creation exhausted its retries)
```

The website sets `draft` and `lobby_creating`, and sets `cancelled` when a host
or admin closes a lobby. Everything else is yours.

Always set `updatedAt` alongside — the stuck-game sweeper keys off it.

`ready` means **ten humans physically in the lobby**. Reservations never satisfy
it; a reservation is not a player.

### 3.4 Result ingestion — no longer yours

See [§4](#4-match-end--the-website-owns-ingestion). The only field you
still need to write at match end is `dotaMatchId`.

### 3.5 Settings changed from lobby chat

When `!mode`, `!region` or `!delay` changes a setting, write it back to
`game.settings`. The live board re-renders the mode and region from that
document, so a lobby whose mode changed in chat but not in Firestore displays a
mode nobody is playing.

---

## 4. Match end — the website owns ingestion

> **This is a behaviour change.** Today `core/attendance.ts` runs inside the
> worker: on lobby teardown it polls the Steam Web API, writes the attendance
> ledger, bumps player counters, sets `result` and moves the game to `finished`,
> then chases OpenDota for the awards.
>
> **Stop doing that.** The website now does all of it, from OpenDota, so there
> is one source for who played and one place that owns the numbers. Two copies
> writing the same ledger is survivable — the attendance write is keyed on
> `(gameId, steamId32)` — but **the player counters are not idempotent**, and
> double ingestion inflates everyone's `gamesPlayed`.

### 4.1 What you do instead

When the match ends and you have the match ID:

1. Write `dotaMatchId` onto the game document. Leave `state` as `in_progress` —
   the website sets `finished`. (If you set it anyway, nothing breaks; the
   transition is a no-op when the state already matches.)
2. Call the webhook:

```http
POST https://<site>/api/inhouse/matches/finished
Authorization: Bearer <INHOUSE_BOT_WEBHOOK_SECRET>
Content-Type: application/json

{ "gameId": "kQ2f…", "dotaMatchId": 7123456789 }
```

That is the whole contract. No ledger, no counters, no OpenDota, no awards.

### 4.2 Responses

| Status | Body `status` | Meaning |
|---|---|---|
| 200 | `ingested` | Done. Ledger, counters, match record all written |
| 200 | `already_done` | A match record already exists — safe repeat |
| 202 | `not_ready` | OpenDota hasn't ingested the match yet. **Normal** in the first minute or two; the cron sweep finishes it |
| 422 | `error` | Bad `gameId`, or no match ID anywhere |
| 401 | — | Bad or missing secret |

**202 is not a failure.** Don't retry it in a tight loop — the sweep runs every
10–15 minutes and will pick it up. Retrying a 5xx a few times with backoff is
worth it; beyond that, let the sweep handle it.

The call is idempotent, so at-least-once delivery is fine and preferred.

### 4.3 If the webhook never lands

It is a fast path, not a dependency. A cron sweep on the website looks for any
game in `in_progress` or `finished` that has a `dotaMatchId` but no match
record, and ingests it. So the minimum you must do is **write `dotaMatchId`** —
the webhook only makes it prompt instead of within-the-hour.

### 4.4 What the website does with it

Worth knowing, because it explains what it needs from you:

1. Fetches the match from OpenDota. Winner, duration, kill score, roster,
   heroes, `leaver_status`.
2. Writes the attendance ledger and bumps `gamesPlayed`, `nightsPlayed`,
   `distinctTeammates` — via the *shared core's* `writeMatchResult`, so this is
   still your logic, just called from the other side.
3. Writes a detailed match record to `inhouseMatches/{gameId}` (website-owned;
   you never need to read or write it).
4. Sets `result` on the game document and transitions it to `finished`.
5. **Asks OpenDota to parse the replay** (`POST /request/{matchId}`). Nobody
   parses a replay unless it is requested, so without this the awards data would
   never exist for our matches. This was the missing step.
6. A cron sweep polls for the parse and folds the awards in whenever they land —
   minutes, hours, or never. Nothing waits on it.

Since these are league matches, the roster comes back complete. `leagueId: 0`
breaks step 1 entirely — see §9.3.

---

## 5. The lobby lifecycle, end to end

What the website does, in order, when someone presses **Otwórz lobby**:

1. Refuses if the person is banned, unlinked, or if the published-lobby cap is
   already reached (`inhouseConfig/lobby.maxOpenLobbies`, default 2).
2. `createGame` — writes `inhouseGames/{id}` in state `draft` with a game number
   from the `inhouseCounters/games` transaction.
3. Writes `lobbyName` (from the noun table, avoiding names in use) and
   `lobbyPassword` (from admin config).
4. `leaseAccount` — transactionally claims an enabled, idle `botAccounts/{id}`.
   On failure the game goes to `failed` and the user is told the pool is busy.
5. Writes `botAccountId` and moves the game to `lobby_creating`.
6. Enqueues `create_inhouse_lobby`.
7. Redirects the host to `/inhouse/{id}`, which will show the lobby as soon as
   you move it to `open`.

From step 6 you own it. The host publishes when ready (a plain field write the
gateway watches), players join, and you drive the game through to `finished`.

---

## 5a. Closing an empty lobby — this one has to be yours

**The rule, from the owner:** a lobby closes once nobody has been in it for
**five minutes**. A lobby stays up longer only while there are *real players on
player slots* — observers do not count, and neither does the lobby bot itself.

### Why this is yours and not ours

The website can decide a lobby is dead, and now does. What it cannot do is
*close* one. Marking `expired` in Firestore is bookkeeping: it hides the card,
frees the cap slot and releases the lease. The Dota lobby carries on existing,
still listed in the in-game browser, still joinable by anyone who searches the
name — and now completely unknown to the site. That is a worse state than the
one it replaced, and only you can prevent it.

So please implement the five-minute close in the bot, as the primary mechanism.
Treat everything the website does here as a backstop for when you are down.

### What the website now does (backstop only)

Three checks, run on every `/inhouse` page load, before opening a lobby, before
revealing join credentials, and on the ingest cron:

| Condition | Result |
|---|---|
| `lobby_creating` for > 5 min | `failed` |
| Lease heartbeat stale > 6 min while `open`/`ready` | `expired` |
| No player in a playing slot for > 5 min | `expired` |
| Players seated but no slot activity for > 3 h | `expired` |

Each sends you `end_inhouse_session` with the matching `reason` above.

### What we need from you

1. **Keep writing `slotSnapshot` when the lobby empties.** You already do —
   observed on live data, the snapshot landed one second after the last player
   left, which is the fact the whole five-minute clock rests on.

2. **Only move `slotSnapshot.updatedAt` when the slots actually change.** This
   is the one that would silently break everything. The website reads that
   timestamp as "empty since", so a periodic or heartbeat-style rewrite with
   unchanged contents resets the clock on every pass and no empty lobby ever
   closes again. (Rule 5 in §0 asks you to touch the *game document* on any
   visible change — that is still right, and it is a different field.)

3. **Never put the bot account in `radiant`, `dire` or `unassigned`.** You
   already don't: a lobby the bot was demonstrably sitting in reported
   `inLobby: []`. Stated so it stays true.

4. **Record observers as `side: 'spectator'`.** `computeSlots` filters on
   PLAYING_SIDES, which excludes spectators — so this is what makes "observers
   don't count" work. If observers are currently written as `unassigned`, a
   lobby holding nothing but spectators looks occupied and will never close.
   **Please confirm which you do.**

5. **Release leases on a clean shutdown.** A redeploy that leaves accounts
   heartbeating-stale for over six minutes will have the website expire lobbies
   that were only waiting for you to come back. Under six minutes and nothing
   happens, so this is about long deploys, not fast ones.

6. **Fill in `botAccounts.steamId32`.** Every account in the pool currently has
   `steamId` and `steamId32` set to `""`. Nothing depends on it today, precisely
   because of (3) — but it is the field that would let the site verify (3)
   rather than trust it.

---

## 6. Reservations and the waitlist

The **website** creates reservations, inside a Firestore transaction that
re-checks `committed < 10` (`inhouseGames/{id}/reservations/{discordId}`, with
`active: true`). It also appends to `waitlist/{discordId}` when the lobby is
full.

**You** own everything after that:

- consuming a reservation when its owner walks in — match on the arriving Steam
  ID first, then fall back to the person, because someone may reserve on their
  main and turn up on a smurf
- expiring reservations whose `expiresAt` has passed (`releaseReason: 'expired'`)
- promoting the waitlist head into a reservation when a slot frees
- setting `active: false` on any reservation you consume or release, since the
  hot-path query filters on it

The reservation TTL is `game.settings.reservationTtlSeconds` (default 300).

---

## 7. Account leasing

`botAccounts/{id}`, fields the website reads and writes:

| Field | Written by | Meaning |
|---|---|---|
| `enabled` | admin panel | Candidate for leasing at all |
| `status` | both | `idle` / `assigned` / `offline` / `error` |
| `leasedByGameId` | website on lease, you on release | Current holder |
| `leasedAt` | website | Lease start |
| `leaseHeartbeatAt` | **you**, every ~30s | Liveness |

A lease with a heartbeat older than **3 minutes** is considered dead and may be
claimed by another game. Keep the heartbeat running for the entire life of the
lobby, not just while a match is in progress — the account is held from lobby
creation to match end, which means the pool must be sized for **concurrent open
lobbies**, not concurrent matches.

An admin can force-release an account from the bot pool page. That path ends the
game and sends you `end_inhouse_session` first, then marks the account idle.

---

## 8. Player identity and linking

One person, one profile, whichever surface they used.

### 8.1 The player object

`inhousePlayers/{discordId}` — keyed on Discord ID, because that is the stable
profile key. Everything you need is on it:

```jsonc
{
  "discordId": "2489…",
  "discordName": "Wichura",            // per-server nickname; the name shown everywhere
  "steamIds": ["123456789", "98765"],  // ALL their accounts — people have alts
  "steamId32": "123456789",            // primary, denormalized from steamIds[0]
  "linkedAt": "…", "linkSource": "lobby_code",
  "gamesPlayed": 58,                   // finished matches — the count you asked about
  "gamesPublished": 12, "nightsPlayed": 21,
  "distinctTeammates": 34, "heroesPlayed": 41,
  "firstSeenAt": "…", "lastPlayedAt": "…",
  "noShowCount": 0, "lastNoShowAt": null
}
```

`gamesPlayed` is maintained by ingestion — now the website's job (§3a). Don't
increment it yourself, or it double-counts.

### 8.2 Resolving a Steam ID to a person

**Always `array-contains`, never equality:**

```ts
const player = await store.findPlayerBySteamId(steamId32);   // handles alts
```

An equality lookup on `steamId32` matches only the primary account, which means
the same person reads as a stranger the moment they log into their smurf — and,
much worse, lets a banned player walk straight back in. The shared core's helper
already does this correctly; use it rather than writing the query.

A player who has never linked has **no** `inhousePlayers` document at all, and
that is the majority case. Don't treat a missing document as an error. Their
Steam ID still gets a membership row, still gets attendance, and still gets
retroactive credit if they link later.

### 8.3 Linking — three entry points, one write

| Entry point | Who runs it | `linkSource` |
|---|---|---|
| Discord OAuth on the website, incl. the free Steam link from Discord connections | website | `discord_connection` |
| Steam OpenID on the website (join dialog or `/inhouse/link`) | website | `steam_openid` |
| `!link` in lobby chat → 4-char code typed on the website | **you** + website | `lobby_code` |
| Admin fixing a mistake | website | `manual` |

**Your part is the code.** `!link` issues a short-lived code with
`issueLinkCode` from the shared core, which writes
`inhouseLinkCodes/{CODE}`:

```jsonc
{ "code": "K7QP", "steamId32": "123456789", "playerName": "Wichura",
  "createdAt": "…", "expiresAt": "…", "consumedAt": null, "consumedByDiscordId": null }
```

The player types that code on the website, which redeems it in a transaction —
so a code can only ever be used once, even if two people race it — and then
calls `linkSteamAccount`.

**Never write `inhousePlayers.steamIds` directly.** `linkSteamAccount` is
additive (a second account joins the list rather than replacing the first, and
the primary stays whatever was linked first), refuses an account already claimed
by a different Discord profile, and triggers the retroactive backfill that
stamps the new Discord ID onto that Steam ID's historical attendance rows. All
three of those are easy to get wrong by hand.

### 8.4 Names

Refresh `membership.displayName` and `player.discordName` whenever you see a
current value. That nickname is the name every surface prefers — the website's
lobby cards, leaderboards and join dialog all show it ahead of the Steam
persona, and the website has no other way to learn it.

---

## 8a. Automatic host handover — NEW, and it has to be yours

**Status: specified here, not built anywhere.** This is a new requirement from
the community owner, and it is worker-side work — the website cannot do any of
it, for three separate reasons given at the end.

### The change that created the need

Opening a lobby on the website **no longer requires an account**. Anyone can
press the button. So a game can now be created with:

```jsonc
{ "initiatorDiscordId": "", "initiatorSteamId32": null, "initiatorName": "Gość" }
```

Nobody is the host. Somebody has to become one.

### The rule

> **Invariant: while a lobby is open, the host is a player occupying a playing
> slot — or there is no host, because nobody does.**

Concretely:

| Trigger | Action |
|---|---|
| Lobby created with no host identity (both initiator fields empty) | The **first** player to occupy a playing slot becomes host. |
| The current host stops occupying a playing slot — leaves, or moves to spectator/broadcaster | Reassign to **any** player currently on a playing slot. |
| No eligible player when reassignment is needed | Host is **vacant**. The next player to take a playing slot becomes host. |

"Playing slot" is exactly the existing `PLAYING_SIDES` set — `radiant`, `dire`,
`unassigned` — excluding the bot account itself. The same set `computeSlots`
already filters on, so no new concept.

**Choose the longest-seated eligible player** (earliest `joinedAt`). The owner
said "not necessarily random, just one of them", and lowest-`joinedAt` is the
better answer than a real random pick: it is deterministic (so a retry picks
the same person and the site never renders a different host than you did), it
is stable (it doesn't reshuffle every time someone leaves), and it lands on the
person most invested in the lobby.

Note the middle row carefully: **a side swap is not a vacancy.** Radiant → Dire
is still a playing slot, so the host keeps the role. Only leaving the playing
set at all triggers reassignment.

A manual `!host` transfer wins and simply becomes the new current host — it is
then subject to the same rule if that person leaves.

### What to write

On every assignment, update the game document:

```jsonc
{
  "initiatorSteamId32": "123456789",   // the new host, always
  "initiatorDiscordId": "…" | "",      // if they are linked, else empty
  "initiatorName": "Pawel",            // their display name (§8's name rules)
  "updatedAt": "…"                     // required — the sweeper keys off it
}
```

and emit the event you already have:

```jsonc
{ "type": "inhouse_host_transferred", "gameId": "…",
  "toSteamId32": "…", "toDiscordId": "…" | null, "timestamp": "…" }
```

**The website needs no change for this** — it already resolves host controls
from `initiatorDiscordId` / `initiatorSteamId32`, so Publish and Cancel follow
the role automatically the moment you write it. (An anonymous opener holds a
signed browser cookie that grants those controls *only while both initiator
fields are empty*; the instant you name a host, the cookie stops applying. So
the handover is what takes control away from someone who opened a lobby and
walked off.)

### The chat notification

Announce it **in lobby chat, 5 seconds after the assignment**, to whoever just
got it. Something like:

> `Pawel jest teraz hostem tego lobby. Wpisz !help, aby zobaczyć komendy.`

Two things about that delay, since it is easy to implement as a naive
`setTimeout` and get subtly wrong:

1. **It exists so the message isn't lost.** A player joining produces a burst of
   lobby chatter; five seconds puts the announcement after it, where it will
   actually be read.
2. **Cancel it if it is superseded.** Somebody who joins and immediately leaves
   would otherwise trigger an announcement for a host who is already gone — and
   a rapid join/leave/join cycle would spam the lobby. Keep one pending timer
   per game; on a new assignment, clear the old one before setting the new. If
   the person is no longer the host when the timer fires, drop the message.

### Why the website can't do this

Not a division-of-labour preference — three hard blockers:

1. **Only the worker can send lobby chat.** `send_chat` is a command the website
   can enqueue, but the website has no Game Coordinator connection and no way
   to know the lobby's real membership first-hand.
2. **The website is request-scoped.** It runs serverless on Vercel; there is no
   process alive between requests to hold a five-second timer, let alone to
   notice a player left. The one Firestore listener it holds exists per-instance
   and is not a reliable event source.
3. **You see the transition; we see a snapshot.** Vacating a slot is a GC event
   you observe directly. We would only find out on the next `slotSnapshot`
   write — which is *your* write, so we would be reacting to you anyway, one
   round trip late.

## 9. Open items — decisions needed from you

### 9.1 Honouring `lobbyName` / `lobbyPassword`

Blocking. See the callout in §2.1. Until the worker uses the values the website
wrote, the lobby name shown on the site will not be the name in Dota's browser,
which breaks the primary join path.

### 9.2 Stop ingesting results

Blocking, and the one with a data-corruption failure mode. See §4: stop calling
`ingestMatchResult` / `writeMatchResult`, write `dotaMatchId`, call the webhook.
While both sides ingest, every player's `gamesPlayed` counts each match twice.

Needs a shared secret — `INHOUSE_BOT_WEBHOOK_SECRET`, same value both sides.

### 9.3 League ID 0

`leagueId: 0` means the admin hasn't configured one. The lobby still runs, but
the match is not publicly retrievable, which breaks the attendance ledger, match
pages, awards and retroactive credit. Keep logging loudly when you see it.

It also disables the website's **Oglądaj mecz** button, which builds a
`steam://rungame/570//+dota_spectator_auto_spectate_games <leagueId>` URL. That
URL is **unverified** — there is no Valve-documented way to spectate a specific
match, and the league convar is the only surviving mechanism. If you know a
better handle, say so and the website will use it instead.

### 9.4 Immortal Draft — the field is `do_player_draft`

You asked how to set it. Valve's internal name is **Player Draft**, which is why
searching for "immortal draft" in the protobufs finds nothing.

From
[`dota_gcmessages_client_match_management.proto`](https://github.com/SteamDatabase/GameTracking-Dota2/blob/master/Protobufs/dota_gcmessages_client_match_management.proto):

```proto
message CMsgPracticeLobbySetDetails {
  …
  optional .DOTASelectionPriorityRules selection_priority_rules = 46
      [default = k_DOTASelectionPriorityRules_Manual];
  …
  optional bool do_player_draft = 53;      // ← Immortal Draft
}
```

And the enum it interacts with, from `dota_shared_enums.proto`:

```proto
enum DOTASelectionPriorityRules {
  k_DOTASelectionPriorityRules_Manual    = 0;
  k_DOTASelectionPriorityRules_Automatic = 1;   // coin flip
}
```

The same flag is observable after the fact as `is_player_draft` on
`CMsgDOTAMatchMinimal` and the realtime-stats messages, which is a convenient
way to confirm a lobby actually got created with it.

**Why it doesn't work today.** `dota2@6.2.0` bundles an older schema that has no
field 53, so `settings.immortalDraft` is stored and displayed by both halves and
never reaches the GC. Two ways out, both yours to choose:

- regenerate the protobufs from SteamDatabase's tracking repo (they are kept
  current), or
- add just field 53 to the bundled `CMsgPracticeLobbySetDetails` — it is an
  `optional bool`, so this is wire-compatible and a much smaller change.

**Constraints to verify against a live GC.** You mentioned Immortal Draft and
coin-flip selection priority being mutually exclusive. The protobufs encode no
such rule — they are independent fields — so if the constraint is real it is
enforced by the GC or only by the client UI, and the failure mode matters: a GC
that silently ignores `do_player_draft` when `selection_priority_rules = 1` is
very different from one that rejects the lobby. Worth one experiment:

1. `do_player_draft = true`, `selection_priority_rules = 0` (manual)
2. `do_player_draft = true`, `selection_priority_rules = 1` (coin flip)

and read back `is_player_draft` on the resulting match in each case. Tell us
which combinations hold and the admin panel will refuse the invalid ones rather
than letting an admin configure a lobby the GC will quietly reshape.

Worth checking `game_mode` too — the client only offers the checkbox for some
modes, and the website's default is All Pick (22).

### 9.5 No web "start game" button

Deliberate. `!start` requires a 5/5 split and can fail for reasons the website
cannot see, so a web button would fail opaquely. If you want one, tell us what
preconditions you can expose on the game document and we'll gate on those.

---

## 10. Testing without the website

Every website action is a Firestore write, so you can drive the whole flow from
a script or the console.

Open a lobby:

```js
// 1. the game
await db.collection('inhouseGames').doc('test1').set({
  id: 'test1', gameNumber: 999, mode: 'inhouse', state: 'lobby_creating',
  initiatorDiscordId: 'x', initiatorSteamId32: null, initiatorName: 'Test',
  published: false, publishedAt: null, publishedByDiscordId: null, locked: false,
  settings: { /* a full ResolvedSettings */ },
  botAccountId: 'bot_01', dotaLobbyId: null,
  lobbyName: 'Wichura', lobbyPassword: 'pd2ih', dotaMatchId: null,
  newcomerFriendly: false, scheduledFor: null,
  discord: { hostPanelChannelId: null, hostPanelMessageId: null, cardChannelId: null,
             cardMessageId: null, voiceChannelId: null, scheduledEventId: null },
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  endedAt: null, endReason: null,
  lastActivityAt: new Date().toISOString(), nudgedAt: null,
});

// 2. the command
await db.collection('botCommands').doc('bot_01').collection('queue').add({
  botAccountId: 'bot_01',
  command: { type: 'create_inhouse_lobby', gameId: 'test1', lobby: { /* §2.1 */ } },
  status: 'pending',
  createdAt: new Date().toISOString(),
});
```

To see it on the site, set `published: true` and `state: 'open'` — the live board
filters on exactly that (invariant 0.1). Then write a `slotSnapshot` and some
`memberships` and watch the card fill in.

Worth asserting once, early: create an **unpublished** game in state `open`, hit
every public route, and confirm it appears nowhere. Then publish it and confirm
it appears.

To exercise ingestion without playing a match, set `dotaMatchId` to any real
public match id and call the webhook. The website resolves it from OpenDota like
any other — the roster won't match your lobby, but every code path runs.

---

## Appendix: what we rely on from OpenDota

Recorded because it is the website's only source for match facts now, and
because two of these are not obvious. All verified against the live API.

| Call | Used for |
|---|---|
| `GET /api/matches/{match_id}` | Winner, duration, kill score, roster, heroes, `leaver_status` |
| `POST /api/request/{match_id}` | Asking for a replay parse. Returns `{"job":{"jobId":…}}` |
| `GET /api/request/{jobId}` | Job still queued, or `null` once it is gone |

Two things worth knowing:

- **A replay is not parsed unless someone asks.** This is the step that was
  missing before: without the POST, the parsed fields the silly awards need may
  never exist for our matches. The website now requests a parse for every game
  it ingests.
- **`version` is the readiness flag.** Non-null means the replay parsed. A 200
  response is not enough on its own — OpenDota answers 200 with a near-empty body
  for a match it has heard of but not yet ingested, so an empty `players` array
  means "try again", not "no such match".

Replays expire from Valve's servers after roughly two weeks, so a parse
requested much later than that never succeeds. The website gives up on a pending
parse after ten days and marks the record `unavailable`.

Fields we read today: `match_id`, `radiant_win`, `duration`, `start_time`,
`radiant_score`, `dire_score`, `game_mode`, `lobby_type`, `leagueid`, `version`,
and per player `account_id`, `player_slot`, `hero_id`, `personaname`,
`leaver_status`. Per-player performance stats (KDA, GPM, net worth) are
deliberately **not** collected yet — the schema has a slot for them, and which
ones to keep is an open product decision.

Note `account_id` is absent for private profiles. Those players keep their slot
in the match record but get no attendance row, because nothing can be attributed
to them. In league matches this is rare; in public ones it can be most of the
lobby.
