# Website integration guide

For the developer building the website against this bot.

The bot half is complete and running: a game can be started, filled, played and
recorded end to end using only Discord and Dota. This document is everything you
need to build the web half on top of the same data, in increasing detail.

**Read section 0 before writing any code.** Most of those rules are trivial to
break by accident and expensive to discover in production.

---

## Contents

- [0. Invariants you must not break](#0-invariants-you-must-not-break)
- [1. How the two halves connect](#1-how-the-two-halves-connect)
- [2. Technology](#2-technology)
- [3. Identity and authentication](#3-identity-and-authentication)
- [4. Reading bot state](#4-reading-bot-state)
- [5. Writing to the bot](#5-writing-to-the-bot)
- [6. Public surfaces](#6-public-surfaces)
- [7. Member surfaces](#7-member-surfaces)
- [8. Leaderboards and profiles](#8-leaderboards-and-profiles)
- [9. The admin panel](#9-the-admin-panel)
- [10. Deployment and external services](#10-deployment-and-external-services)
- [11. Known gaps needing a bot change](#11-known-gaps-needing-a-bot-change)
- [12. Build order](#12-build-order)

---

## 0. Invariants you must not break

### 0.1 Publishing controls who hears about a game *while it is filling*

An unpublished lobby exists so the host can choose who to tell first. It is
about priority, not permanent secrecy.

**The rule:**

```
publicly visible  ⟺  published === true  OR  state === 'finished'
```

Use the shared predicate rather than retyping the condition:

```ts
import { InhouseStore } from '@dota2inhouse/core';
if (!InhouseStore.isPubliclyVisible(game)) return notFound();
```

| Game | Public? | Why |
|---|---|---|
| unpublished, `open` / `ready` | **no** | Still filling. The host decides who hears about it. |
| unpublished, `in_progress` | **no** | Nobody can join anyway; nothing to gain by showing it. |
| unpublished, **`finished`** | **yes** | It was played. Showing it is how a visitor sees the community is alive. |
| unpublished, `cancelled` / `expired` / `abandoned` | **no** | Never played. Says nothing good and still leaks that it existed. |
| published, any state | **yes** | |

Note it is `state === 'finished'` specifically, **not** `isTerminal(state)` —
that helper also covers cancelled and abandoned games, which stay hidden.

Two listing helpers, and they are not interchangeable:

```ts
await store.listPublishedOpenGames();    // the live board — published only
await store.listRecentFinishedGames();   // recent results — published or not
```

The leak to watch for is a "games filling now" counter or a live board that
forgot the `published` filter. Write a test in your first week: create an
unpublished game that is still `open`, hit every public route and API endpoint,
and assert it appears nowhere. Then finish it and assert it appears.

**Publishing also changes the Dota lobby itself**, which is what makes the most
common join path work:

| | Lobby visibility | Findable in Dota's lobby browser |
|---|---|---|
| unpublished | Unlisted (2) | no — only people the host tells |
| published | Public (0) | **yes** — password still required to enter |

Derived, never configured — `lobbyVisibilityFor(published)` in the shared
package. The worker reconciles it on publish and on every tick, so publishing
from the website makes the lobby browsable within ~15 seconds without you doing
anything.

This matters more than it looks. Most players join by opening Dota and finding
the lobby in the browser, so a published game left Unlisted is invisible to
everyone the host didn't personally message.

**One honest caveat to communicate accurately:** inhouses run as league matches,
so an unpublished game *is* findable on OpenDota or Dotabuff by someone
determined, even while it is being played. The promise is "the bot never
publicises it before you do", not "nobody can ever find out". Don't write copy
that promises secrecy the architecture can't deliver.

### 0.2 There is no player rating, and there must never be one

**Teams are decided in Dota, not by this system.** Players seat themselves in
the lobby, or Dota's own Immortal Draft picks random captains who draft their
own teams (see [§0.2a](#02a-immortal-draft-is-not-wired-up-yet)).

The bot has no skill rating, no fairness score, no team balancer and no
`!shuffle`. An earlier draft of this system had a hidden balance rating; it was
removed. Do not reintroduce it in any form — not as a "hidden" input, not as a
"just for matchmaking" number, not in a `_private` field.

The reasoning is the same one behind [§0.3](#03-rank-participation-never-performance):
any number that describes how good a player is will eventually be displayed,
inferred, or leaked, and then it is a ladder.

### 0.2a Immortal Draft is not wired up yet

The intended team-selection mechanism is Dota's **Immortal Draft** lobby option:
with ten players, it picks two captains at random and they draft their teams.

**It currently does nothing.** `settings.immortalDraft` is stored, displayed by
`!settings` and settable with `!immortal on` — but it is never sent to the Game
Coordinator, because the protobuf schema bundled with `dota2@6.2.0` has no field
for it. Verified: no `immortal` anywhere in the shipped `.proto` files, and
`CMsgPracticeLobbySetDetails` has no matching field.

Until that is resolved, **players seat themselves** on Radiant and Dire in the
lobby, and `!start` requires a 5/5 split. Don't build UI that promises automatic
team assignment. See [§11](#11-known-gaps-needing-a-bot-change).

### 0.3 Rank participation, never performance

Anything you rank, people optimise. See [section 8](#8-leaderboards-and-profiles)
for what this means concretely — it is the section most likely to cause an
argument, because OpenDota hands you KDA, GPM and damage on a plate and it will
feel wasteful not to display them.

### 0.4 The website is ban enforcement point 3 of 4

A ban is enforced at four independent points because any single one is
bypassable:

| # | Surface | Mechanism | Owner |
|---|---|---|---|
| 1 | Discord channels | `inhouse` role removed | Bot |
| 2 | Discord Join button | Rejected server-side on click | Bot |
| 3 | **Website** | **Join disabled AND the API rejects the request** | **You** |
| 4 | Dota lobby | Bot kicks the Steam ID on sight | Bot |

Disabling the button is not enough. The API must reject independently — never
trust a hidden button.

### 0.5 Attendance derives from the match, never from signups

Signing up isn't playing. Someone who reserved a slot and never entered the
lobby gets no credit; someone who walked in without ever pressing Join does.

`inhouseAttendance` is already written this way by the bot. Never write to it
from a signup flow, and never compute "games played" from reservations.

---

## 1. How the two halves connect

**Firestore is the entire integration seam. There is no HTTP API on the bot and
you should not add one.**

```
                    ┌──────────────────────────┐
   Discord  ◄─────► │  Discord gateway (1 proc)│ ─┐
                    └──────────────────────────┘  │
                                                   ├──► Firestore ◄── YOU
                    ┌──────────────────────────┐  │      (shared
   Steam/Dota ◄───► │  Lobby workers (N procs) │ ─┘    source of truth)
                    └──────────────────────────┘
```

Three processes read and write the same documents. Nobody calls anybody.

Consequences worth internalising:

- **Publishing a game from the website and publishing it with `!publish` in Dota
  lobby chat are the same action.** Both set `published: true` on the game
  document; the Discord gateway watches that document and creates the card. You
  do not need to notify Discord.
- **You can restart anything at any time.** State lives in Firestore, not in
  process memory.
- **Ordering is not guaranteed across processes.** Don't build logic that
  assumes your write lands before the bot's.

### 1.1 Use the shared package — don't reimplement

The domain logic is published as **`@dota2inhouse/core`**
([source](../packages/core), [readme](../packages/core/README.md)). Use it.

Three pieces of logic are safety-critical and must stay identical across both
halves. Reimplementing any of them produces bugs that only appear under load:

| Function | What breaks if it drifts |
|---|---|
| `InhouseStore.createReservation` | Overbooking — three people press Join at 9/10 and all three get a slot. |
| `InhouseStore.createModerationRecord` | A ban that silently doesn't enforce, because the index entries weren't written. |
| `InhouseStore.computeSlots` | A web joiner counted twice, so the lobby looks full at nine. |

Install:

```
# .npmrc
@dota2inhouse:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
npm install @dota2inhouse/core firebase-admin
```

`firebase-admin` is a peer dependency — you own the Firestore connection and
pass it in, so one app never initialises two SDK instances against the same
project.

```ts
import { InhouseStore, resolveSettings, leaseAccount, LOBBY_CAPACITY } from '@dota2inhouse/core';
const store = new InhouseStore(getFirestore());
```

`setLogSink()` routes the package's logging into your own stack.

What it gives you: domain types, settings resolution, the full `InhouseStore`,
Steam account leasing, result ingestion (`ingestMatchResult`, `backfillOnLink`),
award selection, link codes.

What it deliberately omits, because it needs a live Dota connection:
`ban-guard.ts`, `chat-commands.ts`, `session.ts`, `fun.ts`.

**The algorithms below are still spelled out in full** — read them to understand
what the package is doing on your behalf, and as a reference if you ever need to
port to another language. But call the package; don't retype them.

---

## 2. Technology

### 2.1 Recommended stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 15, App Router** | You already have a Next.js orchestrator for tournaments; extend it rather than adding a service. |
| Runtime | **Node, not Edge** | `firebase-admin` needs Node. Edge runtime will fail at build. |
| Data access | **`firebase-admin` server-side only** | See 2.2 — this is a security decision, not a preference. |
| Auth | **Auth.js (NextAuth) v5**, Discord provider | Discord is the identity anchor; Steam is attached to it. |
| Steam login | **`openid-client`** or a small hand-rolled OpenID 2.0 verifier | Steam does not support OAuth2/OIDC. See [3.3](#33-steam-openid). |
| Real-time | **SSE from a Node route**, backed by `onSnapshot` | See [4.3](#43-real-time). |
| OG images | **`satori` + `@resvg/resvg-js`** | `@vercel/og` targets Edge; these run on Node. |
| Charts (admin) | **Recharts** or plain SVG | Admin-only, low stakes. |
| Styling | Your choice | No constraint from the bot side. |

### 2.2 Do not use the Firestore client SDK in the browser

It is tempting — `onSnapshot` straight from React is lovely. Don't.

The game document contains `lobbyPassword` and the full unpublished-game record.
Exposing the collection to browsers means expressing invariant 0.1 as Firestore
security rules, which is possible but subtle, and one permissive rule leaks
every private game in the system.

Read server-side with `firebase-admin`, where the `published` check is ordinary
TypeScript you can unit-test. Push updates to the browser over SSE.

Security rules should then **deny all client access** ([section 7.4](#74-security-rules)).

---

## 3. Identity and authentication

Everything else depends on this, so build it first.

### 3.1 The identity model

**Most players never touch Discord or the website.** They hear about a game —
from the announcement, or because the host told them — then open Dota, find the
lobby in the in-game browser, type the password and play. They click nothing.

Design for that as the *normal* case, not the edge case:

- **Steam ID (32-bit) is the identity that always exists.** Memberships,
  attendance and ban enforcement are all keyed on it.
- **Discord ID is the optional profile key.** `inhousePlayers/{discordId}`
  exists only for people who linked, and may never exist for a regular.
- **One person, many Steam accounts.** `player.steamIds` is an array; plenty of
  people play on two or three and switch freely. Look them up with
  `array-contains`, never equality:

  ```ts
  await store.findPlayerBySteamId(steamId32);   // handles alts
  ```

  A ban follows the **person**: `createModerationRecord` writes an index entry
  for every account they own, so switching to a smurf does not get them back in.
  Equality lookups anywhere in your code reintroduce that hole.
- Linking is an upgrade, not a prerequisite. It buys held slots, automatic
  invites, waitlist promotion and nudges — nothing more.

`inhouseGames/{id}/memberships/{steamId32}` is keyed on Steam ID precisely so an
unlinked walk-in is still recorded — for ban identity capture and for
retroactive credit if they ever do link.

**The consequence that bites:** `inhousePlayers` counters
(`gamesPlayed`, `nightsPlayed`, …) are only incremented for linked players. A
leaderboard or profile built on that collection silently covers the linked
minority and looks broken to everyone else.

Derive from the ledger instead:

```ts
const stats = await store.getStatsForSteamId(steamId32);
// { steamIds, gamesPlayed, nightsPlayed, heroesPlayed,
//   firstPlayedOn, lastPlayedOn, linked, discordId, displayName }
```

It resolves the person first, then aggregates across **all** their accounts, so
someone who walked in on a smurf still sees their real totals and the site never
shows two half-profiles for one player. Nights and heroes are deduplicated —
two games on two accounts in one evening is one night.

Player pages should be addressable by Steam ID, with the Discord profile as
extra detail when it exists, not the other way round.

### 3.1a Which name to display

**Use the member's nickname on this Discord server**, not their global username
and not their Steam persona.

Discord users have one global username but can set a different nickname per
server, and change it whenever they like. That per-server name is what people
in your community actually know each other by; a Steam persona is often
something they picked years ago.

Order of preference:

1. `player.discordName` — the server nickname, refreshed by the bot every time
   it sees them (`store.touchDiscordName`)
2. `membership.displayName` — the same value, denormalized onto the roster
3. `membership.playerName` — the Steam persona, for the unlinked majority
4. `Player {steamId32}`

On your own side, resolve it from the **GuildMember**, not the User:

```ts
member.nickname ?? member.displayName ?? user.globalName ?? user.username
```

`interaction.user.displayName` is the *global* name and is the wrong one here —
an easy mistake, since it looks right.

### 3.2 Discord OAuth — and the free Steam link

Scopes: `identify`, and **`connections`**.

The `connections` scope returns the user's connected accounts. If they've already
connected Steam in their Discord settings, you get their Steam ID for free at
sign-in, with zero extra user effort.

```ts
const res = await fetch('https://discord.com/api/v10/users/@me/connections', {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const connections = await res.json();
const steam = connections.find((c) => c.type === 'steam');
// steam.id is a Steam64 string; convert to Steam32 before storing.
```

**Verify before relying on it:** whether the scope returns Steam connections
regardless of the user's visibility setting, and what `verified` means in
practice. Treat this as a bonus path, not the primary one. It's a free win if it
works and a rounding error if it doesn't — just don't build the funnel assuming
it.

Store `linkSource: 'discord_connection'`.

### 3.3 Steam OpenID

The fallback and the primary path for anyone who hasn't used Discord's
connection feature.

Steam uses **OpenID 2.0**, not OAuth2 and not OIDC. No app registration, no
client secret.

1. Redirect to `https://steamcommunity.com/openid/login` with
   `openid.mode=checkid_setup`, your `return_to` and `realm`.
2. On return, **verify the response** by POSTing it back with
   `openid.mode=check_authentication` and confirming the body contains
   `is_valid:true`. Skipping this step makes the login trivially forgeable.
3. Extract the Steam64 from `openid.claimed_id`
   (`https://steamcommunity.com/openid/id/{steam64}`).

Store `linkSource: 'steam_openid'`.

### 3.3a `!link <discord name>` — the path most people will use

Typed in lobby chat. The bot resolves the name against the guild and DMs that
user a Confirm / No prompt; pressing Confirm links the accounts and runs the
retroactive backfill.

It is a **claim, not an assignment** — nothing is written until the named person
confirms in their own DMs. Without that, `!link <victim>` would let anyone
attach their Steam account to someone else's profile and inherit their history.

Refused up front, with a line back to the lobby, when: the name matches no
guild member, the match is ambiguous, that Discord user already has a
*different* Steam account linked, or this Steam account is already linked. The
claim is re-checked again on confirm, because minutes may have passed.

An existing link is never silently overwritten. Correcting a mistake is
self-service, with two scopes:

| | Removes | Why |
|---|---|---|
| `!unlink` in a lobby | just the account you are playing on | The bot knows which Steam ID typed it, so it can be surgical — fixing a typo on a smurf doesn't cost you your main. |
| `/inhouse unlink` on Discord | **all** your accounts | One person has one Discord account, so "unlink me" means all of them. Nothing to disambiguate. |

Neither takes a target: you can only ever unlink your own accounts. No admin
screen needed for this.

Handled entirely by the bot ([`linking.ts`](../src/discord/linking.ts)); nothing
for the website to build.

**Requires the Server Members Intent**, enabled in the Discord developer portal
as well as in code — member lookup by name fails without it.

### 3.4 Link codes from inside the Dota lobby

A player types `!link` in a lobby. The bot knows their Steam ID, generates a
one-time code and replies:

> `Pawel: go to https://dota2inhouse.pl/link and enter 7QK2`

Codes are 4 characters from an unambiguous alphabet (no `O`/`0`, `I`/`1`,
`S`/`5`), stored at `inhouseLinkCodes/{CODE}` uppercase, and expire in 15
minutes.

Build `/link` to accept a code. Redemption **must be a transaction** so a code
can only ever be used once:

```ts
await db.runTransaction(async (tx) => {
  const ref = db.collection('inhouseLinkCodes').doc(code.trim().toUpperCase());
  const snap = await tx.get(ref);
  if (!snap.exists) throw new Error('not_found');

  const record = snap.data();
  if (record.consumedAt) throw new Error('used');
  if (Date.parse(record.expiresAt) <= Date.now()) throw new Error('expired');

  tx.update(ref, { consumedAt: new Date().toISOString(), consumedByDiscordId: discordId });
  return record.steamId32;
});
```

### 3.5 Steam64 ↔ Steam32

Store **Steam32 everywhere**. The bot uses Steam32 exclusively.

```ts
const STEAM64_BASE = 76561197960265728n;
const toSteam32 = (id64: string) => String(BigInt(id64) - STEAM64_BASE);
const toSteam64 = (id32: string) => String(BigInt(id32) + STEAM64_BASE);
```

### 3.6 Retroactive credit — build this, it converts holdouts

The single highest-value piece of the linking flow. Because every inhouse is a
league match, the full roster is on record even for people who never linked. The
moment someone links, backfill their entire history:

> *"Welcome back — we found your 34 previous games."*

Nothing else converts a stubborn holdout as reliably. Run this immediately after
any successful link, from any of the three paths above:

```ts
async function backfillOnLink(db, discordId: string, steamId32: string) {
  const snap = await db.collection('inhouseAttendance')
    .where('steamId32', '==', steamId32).get();
  const history = snap.docs.map((d) => d.data());

  const nights  = new Set(history.map((r) => r.playedOn));           // 'YYYY-MM-DD'
  const heroes  = new Set(history.filter((r) => r.heroId !== null).map((r) => r.heroId));

  const playerRef = db.collection('inhousePlayers').doc(discordId);
  const player = (await playerRef.get()).data() ?? {};

  // Max, never overwrite: the player may already have counted games under a
  // previously linked account.
  await playerRef.set({
    steamId32,
    linkedAt: new Date().toISOString(),
    linkSource,
    gamesPlayed:  Math.max(player.gamesPlayed  ?? 0, history.length),
    nightsPlayed: Math.max(player.nightsPlayed ?? 0, nights.size),
    heroesPlayed: Math.max(player.heroesPlayed ?? 0, heroes.size),
  }, { merge: true });

  // Stamp the Discord ID onto historical rows so future queries resolve.
  // Firestore caps a batch at 500 writes.
  const stale = snap.docs.filter((d) => d.data().discordId !== discordId);
  for (let i = 0; i < stale.length; i += 450) {
    const batch = db.batch();
    for (const doc of stale.slice(i, i + 450)) batch.update(doc.ref, { discordId });
    await batch.commit();
  }

  return { gamesFound: history.length, nightsFound: nights.size };
}
```

Already implemented as `backfillOnLink` in `src/inhouse/attendance.ts` — another
argument for the shared package.

### 3.7 Guard against Steam ID hijacking

Before writing `steamId32` to a player, check whether another Discord account
already claims it:

```ts
const existing = await db.collection('inhousePlayers')
  .where('steamId32', '==', steamId32).limit(1).get();
if (!existing.empty && existing.docs[0].id !== discordId) {
  // Refuse and route to an admin. Silently reassigning transfers someone's
  // entire history to a different person.
}
```

---

## 4. Reading bot state

### 4.1 Collections

Full schema in [`inhouse-data-model.md`](./inhouse-data-model.md). Summary:

| Collection | Contents |
|---|---|
| `inhouseGames/{id}` | The game. `slotSnapshot` is the denormalized live slot picture — read this, not the sub-collections. |
| `…/memberships/{steamId32}` | Who is/was in the lobby. `present: boolean`. Never deleted. |
| `…/reservations/{discordId}` | Held slots. `active: boolean`. |
| `…/waitlist/{discordId}` | `position` is a creation timestamp; lowest promoted first. |
| `inhousePlayers/{discordId}` | Profile and counters. `…/teammates/{steamId32}` sub-collection. |
| `inhouseAttendance/{gameId}__{steamId32}` | The ledger. |
| `inhouseModeration/{id}` | Warn/ban records and history. |
| `inhouseBans/{d_id \| s_id}` | Denormalized enforcement index. **Check this, not the query.** |
| `inhouseConfig/{global,admins,schedule,records}` | Configuration you own. |
| `inhouseReadyPool/{discordId}` | "Who's around". |
| `inhouseLinkCodes/{CODE}` | One-time link codes. |
| `botAccounts/{id}` | Steam account pool and leases. |

### 4.2 Game states

```
draft → lobby_creating → open → ready → in_progress → finished
             │             │                  │
             │             │                  └─ abandoned (result never arrived)
             │             └─ expired / cancelled
             └─ failed (no bot account, or worker never responded)
```

- `open` — taking players. This is where a game spends its life.
- `ready` — **ten humans physically in the lobby.** Reservations never satisfy
  this; a reservation is not a player.
- `in_progress` — match launched.
- `finished` — result ingested, attendance written.

`draft` with a `scheduledFor` in the future is a scheduled game that hasn't
leased a Steam account yet. Don't show it as live.

### 4.3 Real-time

`slotSnapshot` changes whenever the slot picture a human would see actually
moves (the worker fingerprints it to avoid noise writes).

Server-side, one `onSnapshot` per process, fanned out to browsers over SSE:

```ts
// app/api/live/route.ts   — runtime = 'nodejs'
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: unknown) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));

      const unsub = db.collection('inhouseGames')
        .where('published', '==', true)              // invariant 0.1
        .where('state', 'in', ['open', 'ready'])
        .onSnapshot((snap) => send(snap.docs.map((d) => toPublicGame(d.data()))));

      // Keep intermediaries from closing an idle connection.
      const ping = setInterval(() => controller.enqueue(enc.encode(': ping\n\n')), 25_000);
      return () => { clearInterval(ping); unsub(); };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

`toPublicGame` is where you strip fields — see [6.3](#63-live--the-lobby-board).

**One `onSnapshot` per process, not per request.** Hold it in a module-level
singleton and let SSE connections subscribe to that. A listener per visitor will
exhaust Firestore's concurrent-listener limits under any real traffic.

If your host can't hold long-lived connections, poll `/api/live` every 5s
instead. `/live` is the only page that genuinely needs sub-5-second freshness.

### 4.4 Slot accounting

Read `game.slotSnapshot` — the worker maintains it. Only compute this yourself if
you're writing a reservation (where you must, inside the transaction).

```
in_lobby   = { unassigned ∪ radiant ∪ dire }, excluding the bot
committed  = |in_lobby| + |{ active reservations whose steam_id ∉ in_lobby }|
slots_open = 10 - committed
```

The `∉ in_lobby` clause is the whole double-count fix: a reservation stops
counting the instant its owner walks in. Miss it and a player who joined via the
website is counted twice, and the lobby looks full at nine.

**Display reserved players separately from in-lobby players, never merged.**
"3 slots open" must mean three people can act on it right now.

### 4.5 Required composite indexes

Firestore refuses these queries until the index exists and logs a creation link
on first failure. Create them up front — the full list is in
[`inhouse-data-model.md`](./inhouse-data-model.md#required-composite-indexes).

---

## 5. Writing to the bot

### 5.1 The command queue

To make a lobby *do* something, enqueue a command for the worker holding it:

```ts
await db.collection('botCommands')
  .doc(game.botAccountId)          // which worker owns this lobby
  .collection('queue')
  .add({
    botAccountId: game.botAccountId,
    command: { type: 'send_chat', gameId: game.id, message: 'Website says hi' },
    status: 'pending',
    createdAt: new Date().toISOString(),   // ISO string, NOT a Firestore Timestamp
  });
```

`createdAt` **must be an ISO string**. The worker parses it with `new Date()` and
expires anything older than 5 minutes.

Commands you'll use: `create_inhouse_lobby`, `invite_player`, `kick_player`,
`start_game`, `send_chat`, `end_inhouse_session`, `ingest_match_result`. Full
contract in [`worker-api.md`](./worker-api.md).

### 5.2 Most actions are a document write, not a command

Publishing, locking, cancelling and settings changes are plain field updates on
the game document. The bot watches and reacts. Don't send a command for these.

```ts
// Publish from the website — the Discord card appears by itself
await gameRef.update({
  published: true,
  publishedAt: new Date().toISOString(),
  publishedByDiscordId: user.discordId,
  updatedAt: new Date().toISOString(),
});
```

Always set `updatedAt` — the stuck-game sweeper keys off it.

### 5.3 Creating a reservation (race-critical)

Three people clicking Join at 9/10 is a daily occurrence. Overbooking produces
exactly the experience — showing up to a full lobby — that reservations exist to
prevent.

**All reads before any write. Re-check `committed < 10` inside the transaction.**

```ts
await db.runTransaction(async (tx) => {
  const gameRef = db.collection('inhouseGames').doc(gameId);
  const resRef  = gameRef.collection('reservations').doc(discordId);

  // ── reads ──
  const [gameSnap, existingSnap, memberSnap, resSnap] = await Promise.all([
    tx.get(gameRef),
    tx.get(resRef),
    tx.get(gameRef.collection('memberships').where('present', '==', true)),
    tx.get(gameRef.collection('reservations').where('active', '==', true)),
  ]);

  const game = gameSnap.data();
  if (!gameSnap.exists || game.state !== 'open') return { ok: false, reason: 'game_not_open' };
  if (game.locked) return { ok: false, reason: 'locked' };

  const PLAYING = ['radiant', 'dire', 'unassigned'];
  const inLobby = memberSnap.docs.map((d) => d.data())
    .filter((m) => PLAYING.includes(m.side)).map((m) => m.steamId32);
  const inLobbySet = new Set(inLobby);

  const pending = resSnap.docs.map((d) => d.data()).filter((r) =>
    !r.consumedAt && !r.releasedAt &&
    Date.parse(r.expiresAt) > Date.now() &&
    !inLobbySet.has(r.steamId32));          // the double-count fix

  if (inLobbySet.has(steamId32)) return { ok: false, reason: 'already_in_lobby' };

  const existing = existingSnap.data();
  if (existing && !existing.consumedAt && !existing.releasedAt &&
      Date.parse(existing.expiresAt) > Date.now()) {
    return { ok: false, reason: 'already_reserved' };
  }

  if (inLobby.length + pending.length >= 10) return { ok: false, reason: 'full' };

  // ── write ──
  tx.set(resRef, {
    discordId, steamId32, playerName,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + game.settings.reservationTtlSeconds * 1000).toISOString(),
    consumedAt: null, releasedAt: null, releaseReason: null,
    active: true,                            // required — the hot-path query filters on it
  });
  tx.update(gameRef, { lastActivityAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

  return { ok: true };
});
```

On `full`, add to the waitlist instead:

```ts
await gameRef.collection('waitlist').doc(discordId).set({
  discordId, steamId32, playerName,
  position: Date.now(),                      // lowest promoted first
  createdAt: new Date().toISOString(),
});
```

Then fire the Steam invite so the player is actually pulled in:

```ts
await dispatch(game.botAccountId, { type: 'invite_player', gameId, steamId32 });
```

The worker handles expiry, waitlist promotion and consuming the reservation when
the player walks in. You don't.

### 5.4 Creating a game from the website

```ts
// 1. Resolve settings from admin defaults
const defaults = (await db.doc('inhouseConfig/global').get()).data() ?? {};
const settings = resolveSettings(defaults, { mode: 'inhouse' });   // shared package

// 2. Allocate a game number (transaction on the counter)
// 3. Write inhouseGames/{id} with state: 'draft'  (shape in §1 of the data model)
// 4. Lease a bot account  — see below
// 5. Enqueue create_inhouse_lobby
```

Leasing must be transactional or two games claim the same Steam account and one
silently never gets a lobby. The bot exports `leaseAccount(db, gameId)` in
`src/inhouse/lease.ts`. Use it. A lease whose `leaseHeartbeatAt` is older than 3
minutes is reclaimable.

If no account is free, transition the game to `failed` with a readable
`endReason` and tell the user *"All lobby bots are busy right now"* — do not
leave a game in `draft` with no lobby.

---

## 6. Public surfaces

Ordered easiest to hardest. Each shows **only published games**.

### 6.1 `/how-it-works` — the culture document

Pure static content. No data access. Build it in an afternoon.

It does real filtering work: people who want a competitive ladder self-select out
before joining, which is how the culture is protected at scale without moderating
for it. State the vibe explicitly — griefing is the only real offence, all skill
levels welcome, no obligation to be good.

### 6.2 `/` — landing

Positioning first, because the vibe is the differentiator:

> *"5v5 Dota inhouses with real people, most nights. Not a league. No tryhards."*

Below it: live games (reuse `/live`'s data), tonight's schedule (from
`inhouseConfig/schedule` — compute the next occurrence per slot), active player
count (distinct `discordId` in `inhouseAttendance` over 7 days; cache it, don't
compute per request). One CTA.

### 6.3 `/live` — the lobby board

**Your highest-conversion asset.** A stranger landing on a real game filling in
real time has a reason to click *now*, which is a completely different
proposition from "join our Discord".

Public and indexable. Data via SSE ([4.3](#43-real-time)).

Per game show: host name, slots open, mode/region, the in-lobby roster, reserved
players **greyed with a live countdown**, and a Join button.

Strip the game document before it leaves the server:

```ts
function toPublicGame(g) {
  return {
    id: g.id, gameNumber: g.gameNumber,
    initiatorName: g.initiatorName,
    state: g.state, newcomerFriendly: g.newcomerFriendly,
    settings: { gameMode: g.settings.gameMode, serverRegion: g.settings.serverRegion,
                dotaTvDelay: g.settings.dotaTvDelay },
    slots: g.slotSnapshot ?? null,
    // NOT included: lobbyPassword, botAccountId, discord.*, initiatorDiscordId,
    // publishedByDiscordId, full settings (leagueId, gates, ban ladder)
  };
}
```

`lobbyPassword` goes only to a signed-in, non-banned user who has pressed Join.

Countdowns: render from `expiresAt` client-side. Don't push a tick per second.

### 6.4 `/games/{id}` — the match object

One object, one URL, three states in sequence. The spine of the site.

**State 1 — Recruiting.** As `/live`, plus a Join button.

**State 2 — In progress.** Fed by live league match data, which you get *because*
these are league games. Show heroes, clock, score, and a spectate link honouring
the configured DotaTV delay.

Resist adding per-player performance columns here. The framing you set on the
live page is the framing people bring to the game.

**State 3 — Finished.** Read `game.result`:

```ts
{ radiantWin, durationSeconds, parsed, awards: [{ id, steamId32, text }], abandoners, ingestedAt }
```

Show the rosters, the result, and the awards. `parsed: false` means OpenDota
hasn't parsed the replay yet, so `awards` is empty — the page must render fine
without them, and they may appear later. Don't block on it.

`abandoners` is **admin and host only**. Don't put it on the public page.

Permanent, shareable, OG image generated ([10.4](#104-og-images)). These pages
are what members paste into other Dota communities, which makes them the cheapest
marketing you have.

**Access control:**

```ts
if (!game.published) {
  // 404 to everyone except the ten participants.
  const isParticipant =
    game.initiatorDiscordId === session?.discordId ||
    (session?.steamId32 && await wasInLobby(game.id, session.steamId32));
  if (!isParticipant) return notFound();
}
```

Return **404, not 403** — a 403 confirms the game exists.

Any participant may publish a finished unpublished game afterwards.

### 6.5 Growth plumbing

- **Referral attribution** on invite links, so you can thank the people who bring
  players. `?ref={discordId}` → cookie → recorded at first sign-in.
- **SEO** on region + intent: "dota 2 inhouse EU", "dota 2 5v5 with friends".
  Low volume, very high intent.
- **The newcomer path** is `match page or /live → Discord → #start-here → first
  game → DM: "how was it?"`. Note linking Steam is *not* in that path. Don't gate
  the first game on it.

---

## 7. Member surfaces

### 7.1 `/link`

Three entry points, one page: Discord `connections` (automatic), Steam OpenID
button, and a 4-character code field. All three end in the same write plus
[3.6](#36-retroactive-credit--build-this-it-converts-holdouts).

Show the retroactive result prominently: *"We found your 34 previous games."*

### 7.2 Joining from the web

```
Press Join
  ├─ banned?        → reject (invariant 0.4), generic message
  ├─ not linked?    → link offer: "Link Steam and we'll hold this slot for
  │                    5 minutes and invite you automatically" / "Just give me
  │                    the password"
  ├─ slots open?    → reservation (§5.3) + Steam invite + show lobby credentials
  └─ full?          → waitlist, show position
```

The link offer is the highest-converting moment in the product. They want a slot
*right now*; that's the only moment the link is worth anything to them. The
**held slot** is the honest carrot — worth more than "automatic invites" because
it solves a problem they can feel.

### 7.3 `/inhouse/new` — creating from the web

One field: *when*. Everything else comes from admin defaults. A first-time host
must be able to open a correctly configured lobby with one press.

Do not build a settings form. Hosts change settings with lobby chat commands
(`!mode cm`, `!delay 5`). Keeping configuration out of the create flow is most of
what makes it usable by a first-time host.

After creating, show the lobby credentials and a Publish button. The host also
gets the live panel as a Discord DM automatically.

### 7.4 Security rules

Browsers never touch Firestore ([2.2](#22-do-not-use-the-firestore-client-sdk-in-the-browser)),
so lock it down completely. The Admin SDK bypasses rules.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

---

## 8. Leaderboards and profiles

This is the section where the design will fight you, so here is the reasoning
before the spec.

**Anything you rank, people optimise.** The goal of this community is attendance,
not performance. So: rank participation, and never rank play. OpenDota hands you
KDA, GPM, damage and net worth for every player of every match, and it will feel
wasteful not to display them. Display them anyway and you will have built a
different product within a month.

### 8.1 Hard rules

- No MMR, no visible rating, no win-rate leaderboard, no per-player performance
  table, no "top player".
- No KDA / GPM / damage rankings anywhere, on any page, ever. Not even "just for
  fun" — the ordering *is* the message.
- No decay. A number that drops when you stop playing punishes people for having
  a life, and punishment reads as obligation.
- Unpublished games count toward **aggregate totals** but never appear as
  itemised history. No public per-player match list, and no "recent teammates"
  panel — that's a reconstruction of who plays with whom, assembled one row at a
  time.

### 8.2 Leaderboards you *can* build

Only cumulative, non-rivalrous, monotonic metrics. All already on
`inhousePlayers`:

| Board | Field | Note |
|---|---|---|
| Most games played | `gamesPlayed` | |
| Most nights played | `nightsPlayed` | Distinct calendar days. Rewards regularity over binges. |
| Most different teammates | `distinctTeammates` | Rewards mixing, not clique play. |
| **Most games opened to the server** | `gamesPublished` | The one worth featuring — see below. |
| Most heroes played | `heroesPlayed` | Rewards variety. |

Sorting these is safe: none of them can be improved by playing selfishly, and
none of them go down.

**Feature `gamesPublished` above the others.** It rewards the generous act —
letting the server in — rather than the mechanical one, and it's the counterweight
to a quiet-by-default flow. It is the only deliberate incentive in the system,
and what it competes over is generosity.

### 8.3 `/players/{discordId}` — profile

```
Marek                                      joined March 2026

  73 games played          51 different teammates
  9 games published        14 heroes played
  41 nights played         Most-played slot: Tuesday 21:00

  🏅 50 games   📣 Opened 5 games to the server   🤝 Played with 50 people
```

Badges at round thresholds. "Most-played slot" is derivable from
`inhouseAttendance.playedOn` weekday frequency.

Never show `noShowCount` publicly — it's an admin/host signal only, and it
auto-recovers.

### 8.4 Community stats — lean on these instead

Server-wide counters carry no competitive charge and build real belonging:

- games this month, active players this week
- *"this community has played 12,400 games together"*
- a heatmap of when games happen (from `attendance.playedOn` + match start hour)

These are cheap, safe, and the right place to spend effort that would otherwise
go into individual comparison.

### 8.5 Silly awards

Auto-generated per match, already computed by the bot into `game.result.awards`.
Self-deprecating by construction: couriers lost, time spent dead, tangos bought,
first-blood victim, died to Roshan.

**Never awarded for good play.** The pool rotates so nobody can farm one. Just
render `award.text`.

---

## 9. The admin panel

The largest deferred piece. Nothing in the bot blocks on it — every config
document has a code-level fallback — but three things can't be changed without
it, and one of them gates launch.

**Admin authorization:** check `inhouseConfig/admins` (`discordIds` array).
Server-side, every request. It fails closed by design.

### 9.1 Blocking prerequisite — settings

`inhouseConfig/global`. A form over every field of `InhouseSettings`.

**`leagueId` gates launch.** It defaults to `0`, meaning unset. A game with no
league ID still runs, but the match is not publicly retrievable, so the
attendance ledger stays empty, match pages have no rosters, awards never
generate and retroactive credit finds nothing.
Everything downstream of a match quietly does nothing. The worker logs a warning
on every lobby creation while it's unset.

Full field table with defaults in
[`admin-panel-notes.md`](./admin-panel-notes.md#inhouseconfigglobal--admin-defaults-4).

Validate: `dotaTvDelay` ∈ {10,120,300,900}; `gameMode` and `serverRegion` against
`GAME_MODES` / `SERVER_REGIONS` in `packages/core/src/settings.ts`.

Note settings are resolved per game **at creation** and stored on the game
document. Changing defaults does not affect games already open — correct
behaviour, but say so in the UI or someone will file it as a bug.

### 9.2 Admins list

`inhouseConfig/admins` = `{ discordIds: string[], steamIds: string[] }`.

**Both arrays matter.** A Steam ID is required for an admin to use `!kick` /
`!ban` from lobby chat, where no Discord identity is available. The UI should
warn when an admin has a Discord ID but no Steam ID.

Cached 60s in the worker, so changes take up to a minute.

### 9.3 Recurring schedule

`inhouseConfig/schedule` = `{ slots: RecurringSlot[] }`. Fully implemented in
`src/discord/scheduler.ts`; it just has no UI.

The design doc calls this the highest-leverage item in the whole project and
nearly free to build — people plan around a rhythm, not a possibility.

```jsonc
{ "id": "tue-2100", "label": "Tuesday inhouse",
  "daysOfWeek": [2, 4, 0],           // 0=Sun … 6=Sat, local days
  "time": "21:00",
  "timeZoneOffsetMinutes": 120,      // CEST
  "openAheadMinutes": 240,
  "hostDiscordId": "…", "hostName": "Community",
  "autoPublish": true, "enabled": true }
```

**Known gap to surface in the UI:** `timeZoneOffsetMinutes` is a fixed UTC
offset, not a named zone. Nothing shifts it across DST, so a slot silently moves
by an hour in March and October. Either show a visible warning with a "it's
currently CET/CEST" hint, or fix it properly by storing an IANA zone and
resolving with `Intl.DateTimeFormat` — a small, well-contained bot change.

### 9.4 Community records

`inhouseConfig/records` = `{ entries: [{ label, value, when }] }`, sampled
randomly by `!record`. Community-level only, never per-player.

### 9.5 Moderation

The most detail-sensitive screen. Get the mechanics exactly right or bans won't
enforce.

#### Bans start from a match, not from a name

A ban needs **both** IDs: the Discord ID to pull the role, the Steam ID to kick
from the lobby. Linking is optional, so at ban time you may only have one.

The bot logs the Steam ID of every player in every lobby session. So when an
admin bans someone for what they did in game #412, the Steam ID is already on
record whether or not that person ever linked anything. **The incident supplies
the identity.**

So the UI is: **open a match → click a player in the roster → warn or ban.** Not
a search box over names.

#### Creating a ban — three writes, all required

Miss any and the ban silently doesn't work.

```ts
// 1. The durable record
const ref = db.collection('inhouseModeration').doc();
const expiresAt = durationDays > 0
  ? new Date(Date.now() + durationDays * 86_400_000).toISOString()
  : null;                                     // null = permanent

const record = {
  id: ref.id, kind: 'ban',
  subjectDiscordId, subjectSteamId32, subjectName,
  reason, adminId, sourceGameId,
  createdAt: new Date().toISOString(),
  expiresAt, revokedAt: null, revokedBy: null,
  identityGap: subjectDiscordId && subjectSteamId32 ? 'none'
             : subjectDiscordId ? 'no_steam' : 'no_discord',
};
await ref.set(record);

// 2. The enforcement index — THIS is what every join path checks.
//    Key format is exact: `d_{discordId}` and `s_{steamId32}`.
const batch = db.batch();
const entry = { moderationId: ref.id, expiresAt, createdAt: record.createdAt };
if (subjectDiscordId) batch.set(db.doc(`inhouseBans/d_${subjectDiscordId}`), entry);
if (subjectSteamId32) batch.set(db.doc(`inhouseBans/s_${subjectSteamId32}`), entry);
await batch.commit();

// 3. Tell the Discord gateway, so it removes the role and DMs them.
//    Without this the record exists but Discord never reacts.
await db.collection('botEvents').add({
  botAccountId: 'website',
  event: {
    type: 'inhouse_ban_created',
    moderationId: ref.id,
    gameId: sourceGameId,
    subjectSteamId32, subjectDiscordId,
    identityGap: record.identityGap, durationDays,
    timestamp: new Date().toISOString(),
  },
  processed: false,
  createdAt: new Date().toISOString(),
});
```

The gateway's watcher matches on `event.type` starting with `inhouse_` and
ignores `botAccountId`, so `'website'` is fine.

#### Ban ladder

Default `[7, 30, 0]` days, where `0` means permanent. Pick the rung from the
count of prior bans against **either** identity:

```ts
const ladder = settings.banLadderDays;
const durationDays = ladder[Math.min(priorBanCount, ladder.length - 1)] ?? 0;
```

Warnings first: they carry no functional effect and exist so a ban is never the
first conversation. Admins should be free to skip rungs for griefing.

#### Surface the identity gap — do not hide it

An admin who thinks they've removed someone, when in fact that person can still
join any lobby they have the password for, will find out at the worst possible
moment.

```
Ban — Game #412
  Steam    76561198…4471   ✅ captured from lobby — kicked from every lobby
  Discord  not linked      ⚠️ cannot remove role; they still see the channels
```

Render the effect explicitly per enforcement point, from `identityGap`.

#### Revoking

Set `revokedAt` / `revokedBy` on the record, **and delete both index entries**
(`d_…`, `s_…`). The role is not restored automatically — see
[section 11](#11-known-gaps-needing-a-bot-change).

Note the bot caches ban decisions for 60 seconds per lobby session, so an unban
can take up to a minute to take effect in a live lobby.

#### Reports queue

Fed by `inhouse_report_filed` events, also posted to the admin Discord channel.
`!report` notifies admins and does nothing else, by design — it's the only outlet
an ordinary member has, and the deliberate answer to "I don't want to play with
that person".

#### Policy to write down before the first incident, not after

Who decides, how long, is it appealable, and is the ban list visible to members
or only to admins. Encode the answer in the UI.

### 9.6 Bot account pool

From `botAccounts`: status, `leasedByGameId`, `leasedAt`, `leaseHeartbeatAt`.

- Flag leases with `leaseHeartbeatAt` older than 3 minutes as stale.
- Force-release: clear `leasedByGameId`, `leasedAt`, `leaseHeartbeatAt`, set
  `status: 'idle'`.
- **Instrument lobby-open duration** — `endedAt − createdAt` per game. That single
  number tells you how many Steam accounts you actually need, and it's the metric
  most likely to be missing when you need it. Start the pool at 6–8.

Remember the pool is sized for **concurrent open lobbies**, not concurrent
matches, because a lobby is opened at creation.

### 9.7 Games admin

List and filter all games including unpublished (admin-only view). Force-cancel.
Force-start below ten (`{ type: 'start_game' }`). Re-run ingestion for a match
that never resolved (`{ type: 'ingest_match_result', gameId, dotaMatchId }`).

### 9.8 Metrics

Two numbers matter; the rest are downstream.

**Distinct initiators per week.** If games climb but it's the same five people
starting them, the project failed at its stated goal while looking healthy.

```ts
new Set(gamesThisWeek.map((g) => g.initiatorDiscordId)).size
```

**Publish rate** = published ÷ created. The entire growth engine in one number.
A quiet-by-default flow that nobody publishes is the status quo with better
tooling: veterans get a nicer experience, the other 1,900 members see nothing.
If it's low, fix incentives before adding features.

Then: median create → ten-in-lobby; fill rate published vs unpublished; fill
failure rate (created, never played); reservation conversion (reserved → actually
joined, which tells you whether 5 minutes is the right TTL); link rate, and
specifically link rate *at the join prompt*; newcomer → second game rate;
`/live` → Discord conversion.

---

## 10. Deployment and external services

### 10.1 Hosting

The bot runs on Railway as two services from one image, switched by
`PROCESS_ROLE` (`manager` | `discord`).

**Deploy the website as a third Railway service in the same project.** Reasons:
it's a long-lived Node process, so SSE works without ceremony; `firebase-admin`
needs Node, not Edge; and shared environment variables stay in one place.

Vercel works if you prefer it, with two caveats: function duration limits make
SSE awkward (fall back to 5-second polling on `/live`), and every route touching
`firebase-admin` must set `export const runtime = 'nodejs'`.

### 10.2 External accounts needed

| Service | Purpose | Notes |
|---|---|---|
| **Firebase / Firestore** | Everything | Already provisioned. Website needs its own service account. |
| **Discord application** | OAuth + the bot | Add the website's redirect URI. Request `identify` + `connections`. |
| **Steam Web API key** | Match results, player avatars | Already used by the bot. [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) |
| **Steam OpenID** | "Sign in through Steam" | No registration or key needed. |
| **OpenDota** | Parsed replay data for awards | Optional. Free tier is fine; a key raises the rate limit. |
| Sentry or similar | Error tracking | Recommended. |

Steam OpenID needs a **stable public HTTPS domain** for `realm` and `return_to`.
Preview deployments on rotating URLs will fail verification — either register the
production domain only and test linking against it, or use a stable staging
subdomain.

### 10.3 Environment variables

```bash
FIREBASE_SERVICE_ACCOUNT_BASE64=      # same format as the bot
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_GUILD_ID=
STEAM_API_KEY=
AUTH_SECRET=                          # Auth.js
NEXT_PUBLIC_SITE_URL=https://dota2inhouse.pl
```

`SITE_URL` must match what the bot uses — it builds `!link` and match-page URLs
from its own `SITE_URL`, and a mismatch sends players to a dead address.

### 10.4 OG images

Every finished match page gets one. These pages are what members paste into other
Dota communities.

`satori` (JSX → SVG) + `@resvg/resvg-js` (SVG → PNG), both Node-native. Cache to
Firebase Storage keyed by game ID and serve from there — don't regenerate per
request.

Show: host name, date, result, both rosters. **No performance numbers**
(invariant 0.3).

### 10.5 Firestore cost

The main driver is the `/live` SSE listener. One shared `onSnapshot` per process
is cheap; one per visitor is not. Cache community stats and leaderboards
(5–15 min is plenty — nothing here is time-critical) rather than aggregating on
every request.

---

## 11. Known gaps needing a bot change

Small, well-contained, and worth agreeing before you start.

1. **Immortal Draft doesn't reach the lobby.** The intended team-selection
   mechanism is inert — the GC schema bundled with `dota2@6.2.0` has no field for
   it, so `settings.immortalDraft` is stored and displayed but never sent.
   Players seat themselves instead, and `!start` requires a 5/5 split.

   Fixing it means updating the protobuf schema to a current one and confirming
   the field name against a live GC. Until then, don't build UI promising
   automatic team assignment. **This is the largest of the four gaps** and the
   only one that changes how a game is played.

2. **Unban doesn't restore the Discord role.** `DiscordModeration.liftBan()`
   exists but nothing calls it. Add an `inhouse_ban_lifted` case to the watcher's
   `onWorkerEvent` switch in `src/discord/watcher.ts`, then emit that event from
   the admin panel on revoke. ~10 lines.
3. **DST on recurring slots** ([9.3](#93-recurring-schedule)). Either warn in the
   UI or switch `timeZoneOffsetMinutes` to an IANA zone name.
4. **No auto-publish fallback.** If publish rate comes in low, the last-resort
   lever from the design doc — auto-publishing any lobby short of ten for 30
   minutes — is not implemented. Decide the trigger now, while it's hypothetical
   rather than an argument.
5. **Region partitioning.** `InhousePlayer.region` and `ReadyEntry.region` exist
   but nothing reads them. If the community spans EU/NA, ping roles and the live
   board need this early rather than retrofitted.

---

## 12. Build order

Each stage is independently useful. Don't start the admin panel first — it's the
biggest piece and the least load-bearing.

**Stage 1 — identity.** Discord OAuth, Steam OpenID, `/link` with codes,
retroactive credit. Everything else depends on knowing who someone is, and
retroactive credit is the strongest conversion lever in the product.

**Stage 2 — settings admin.** Just `inhouseConfig/global` and
`inhouseConfig/admins`. Unblocks `leagueId`, which gates everything downstream of
a match. A crude form is fine.

**Stage 3 — `/live` and `/games/{id}`.** The highest-conversion public surfaces,
and the first thing worth showing anyone. Web join can come after — the Discord
Join button already works.

**Stage 4 — moderation.** Before you need it, not after. Section 9.5 exactly.

**Stage 5 — profiles, leaderboards, community stats, OG images.** The social
layer is last on purpose: it's the most fun to build and the least load-bearing,
and shipping it early risks setting a competitive tone before the culture has
been set by actual play.

**Stage 6 — schedule UI, bot pool, metrics.**

### Acceptance checklist

Before calling any stage done:

- [ ] An unpublished game appears on **no** public route, API response, sitemap,
      counter or stats page.
- [ ] `/games/{id}` for an unpublished game returns **404** to a non-participant.
- [ ] A banned user is rejected by the **API**, not just by a disabled button.
- [ ] No player rating exists anywhere — no skill score, hidden or otherwise.
- [ ] No page sorts or displays kills, deaths, GPM, damage or win rate.
- [ ] Reservation creation is a transaction that re-checks `committed < 10`.
- [ ] Creating a ban writes all three: record, both index entries, and the
      `botEvents` entry.
- [ ] `createdAt` on queued commands is an **ISO string**.
- [ ] The `/live` listener is one per process, not one per visitor.
