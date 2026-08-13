# Discord bot ↔ website integration

For the developer working on the **Discord gateway** — the single process that
renders cards and panels in Discord, handles slash commands, manages roles, and
runs the scheduler.

The website and the gateway never call each other. They share Firestore. This
document is everything that crosses between them.

Companion document: [`lobby-bot-integration.md`](./lobby-bot-integration.md) for
the lobby worker. General design rules:
[`../website-integration.md`](../website-integration.md).


**Looking for what's still outstanding? That's
[`bot-todo.md`](./bot-todo.md)** — a short list of the open work for both bots,
with what we could and couldn't verify against the live project. This document
is the reference: the full contract, most of which already works.

---

## Contents

- [0. Start here — what you must change](#0-start-here--what-you-must-change) → moved to [`bot-todo.md`](./bot-todo.md)
- [1. How the website reaches you](#1-how-the-website-reaches-you)
- [2. Events the website emits](#2-events-the-website-emits)
- [3. Document writes you should react to](#3-document-writes-you-should-react-to)
- [4. Identity and linking](#4-identity-and-linking)
- [5. Configuration the website owns](#5-configuration-the-website-owns)
- [6. What the website shows, and what it needs from you](#6-what-the-website-shows-and-what-it-needs-from-you)
- [7. Open items — decisions needed from you](#7-open-items--decisions-needed-from-you)

---

## 0. Start here — what you must change

This list moved to its own file: **[`bot-todo.md`](./bot-todo.md)**, which
covers this gateway and the lobby worker together — they are one project now, so
one to-do list.

It was living here, mixed into a document that is mostly describing a seam which
already works, which made the outstanding items hard to find and easy to mistake
for things already built.

Everything from §1 onwards is reference material.

---

## 1. How the website reaches you

Two mechanisms, and the distinction matters.

**Document writes.** Most website actions are a plain field update on
`inhouseGames/{id}`. You already watch that collection, so nothing extra is
sent. Publishing from the website and `!publish` in lobby chat are *the same
action* — both set `published: true`, and your card logic should not be able to
tell them apart.

**`botEvents`.** For things with no natural document to watch, the website
appends to a broadcast collection:

```
botEvents/{autoId}
```

```jsonc
{
  "botAccountId": "website",   // your watcher ignores this field
  "event": { "type": "inhouse_ban_created", "…": "…",
             "timestamp": "2026-08-07T19:04:11.238Z" },
  "processed": false,
  "createdAt": "2026-08-07T19:04:11.238Z"
}
```

Your watcher matches on `event.type` starting with `inhouse_`, which is why
`'website'` is an acceptable sender. Set `processed: true` when you've handled
one.

Emitter:
[`emitBotEvent` in `src/lib/inhouse/commands.ts`](../src/lib/inhouse/commands.ts).

---

## 2. Events the website emits

### 2.1 `inhouse_ban_created`

Emitted by the admin panel when an admin bans someone from a match roster.

```jsonc
{
  "type": "inhouse_ban_created",
  "moderationId": "abc…",
  "gameId": "kQ2f…",              // the incident the ban came from; may be null
  "subjectSteamId32": "123456789", // may be null
  "subjectDiscordId": "2489…",     // may be null — but never both null
  "identityGap": "none",           // none | no_discord | no_steam
  "durationDays": 7,               // 0 = permanent
  "timestamp": "…"
}
```

By the time you see this the durable record (`inhouseModeration/{id}`) and the
enforcement index (`inhouseBans/d_…`, `inhouseBans/s_…`, **including every alt on
the person's account list**) are already written. Your job is the Discord half:
pull the role, DM them, log it.

**`identityGap` tells you what you can actually do.** With `no_discord` there is
no role to pull — the website already renders that gap to the admin explicitly
rather than hiding it, and you should log it rather than failing silently.

### 2.2 `inhouse_ban_lifted`

```jsonc
{ "type": "inhouse_ban_lifted", "moderationId": "abc…", "timestamp": "…" }
```

Emitted on revoke. The website has already set `revokedAt` / `revokedBy` and
deleted **every** index entry the ban wrote, alts included.

> ### ⚠️ This is currently a no-op on your side
>
> `DiscordModeration.liftBan()` exists but nothing calls it. Add an
> `inhouse_ban_lifted` case to the `onWorkerEvent` switch in
> `src/discord/watcher.ts` and wire it up — roughly ten lines, and until it
> lands, an unban restores lobby access but leaves the Discord role removed.

---

## 3. Document writes you should react to

All on `inhouseGames/{id}`. In each case the website sets `updatedAt` too.

| Website action | Fields written | What you do |
|---|---|---|
| Host publishes | `published: true`, `publishedAt`, `publishedByDiscordId` | Post the game card; ping any opted-in roles |
| Host or admin closes a lobby | `state: 'cancelled'`, `endedAt`, `endReason` | Edit the card to closed; clean up voice/event if you made one |
| Admin force-releases a bot account | `state: 'cancelled'`, `endReason` | Same |
| Website creates a game | full document in `draft`, then `lobbyName`, `lobbyPassword`, `botAccountId`, `state: 'lobby_creating'` | Nothing yet — wait for the worker to move it to `open` |

The website also **writes and reads** the `discord` block on the game document
but never populates it — those IDs are yours:

```jsonc
"discord": {
  "hostPanelChannelId": null, "hostPanelMessageId": null,
  "cardChannelId": null, "cardMessageId": null,
  "voiceChannelId": null, "scheduledEventId": null
}
```

It is initialised to nulls at creation so you can write into it without a
merge dance.

### 3.1 Games created from the website need a host panel

A host who opens a lobby at `/inhouse/new` gets no Discord DM today unless you
create the panel from the document write, the same way you would for a game
started from Discord. The website deliberately does not send you a command for
this — creation is a document write and you are already watching (§5.2 of the
main guide).

---

## 4. Identity and linking

`inhousePlayers/{discordId}` is shared between you and the website. Both sides
write it. This is the player object — one per person, Discord ID as the key:

```jsonc
{
  "discordId": "2489…",
  "discordName": "Wichura",            // per-server nickname; the name shown everywhere
  "steamIds": ["123456789", "98765"],  // ALL their accounts — people have alts
  "steamId32": "123456789",            // primary, denormalized from steamIds[0]
  "linkedAt": "…", "linkSource": "discord_connection",
  "gamesPlayed": 58,                   // finished matches
  "gamesPublished": 12, "nightsPlayed": 21,
  "distinctTeammates": 34, "heroesPlayed": 41,
  "firstSeenAt": "…", "lastPlayedAt": "…",
  "noShowCount": 0, "lastNoShowAt": null
}
```

Two rules that matter more than they look:

- **Resolve Steam IDs with `array-contains`, never equality.** Use
  `store.findPlayerBySteamId`. Matching only `steamId32` treats someone as a
  stranger on their smurf and lets a banned player back in on an alt.
- **A player who never linked has no document at all**, and that is the majority
  case. A missing document is normal, not an error.

`gamesPlayed` is maintained by result ingestion, which is now the **website's**
job — see §3a of the lobby-bot document. Don't increment it.

**The website writes it when:**

- someone completes Discord OAuth (scopes `identify`, `connections`,
  `guilds.members.read`) — including a free Steam link when they already have
  Steam connected in their Discord settings, stored with
  `linkSource: 'discord_connection'`
- someone completes Steam OpenID from the join dialog or `/inhouse/link` —
  `linkSource: 'steam_openid'`
- someone redeems a 4-character code from `!link` — `linkSource: 'lobby_code'`,
  consumed transactionally out of `inhouseLinkCodes/{CODE}`

**If you add a link path of your own** — a `/link` slash command, or writing the
Steam ID straight from a Discord connection you already have — route it through
`linkSteamAccount` from the shared core rather than writing `steamIds` yourself.
It is additive (a second or third account joins the list rather than replacing
the first, and the primary stays whatever was linked first), it refuses an
account already claimed by a different Discord profile, and it triggers the
retroactive backfill that stamps the new Discord ID onto that Steam ID's
historical `inhouseAttendance` rows. Hand-writing the array skips all three, and
the third is the thing that converts holdouts — *"we found your 34 previous
games"* is the whole pitch.

So, all four entry points, and who runs each:

| Entry point | Runs in | `linkSource` |
|---|---|---|
| Discord OAuth on the website (+ free Steam link from connections) | website | `discord_connection` |
| Steam OpenID on the website | website | `steam_openid` |
| `!link` in lobby chat → code redeemed on the website | lobby bot + website | `lobby_code` |
| Anything you add in Discord | **you** | pick one, or `manual` |

**Keep `discordName` current.** It is the per-server nickname, and it is the name
every surface prefers — Discord embeds, the website, lobby chat — over the Steam
persona, which is often something the person picked in 2013. The website shows it
on leaderboards and in the join dialog and has no other way to learn it.

### 4.1 The join dialog

Worth knowing what the website now offers, because it changes what people arrive
at Discord already having done. Pressing **Dołącz** on a lobby card opens a
dialog with two equal paths:

- **left** — the lobby name and password, and instructions to find it in Dota's
  lobby browser. Works with nothing linked, which is the majority case.
- **right** — Discord login, then Steam, then an **Invite me** button that
  creates a reservation and asks the worker for a Steam invite.

So a player may now link Steam↔Discord entirely from the website without ever
running `!link`. Nothing for you to do beyond not assuming `!link` is the only
origin of a linked player.

---

## 5. Configuration the website owns

The admin panel at `/admin/inhouse` writes these. Read them; don't cache them for
long.

| Document | Contents | Notes |
|---|---|---|
| `inhouseConfig/global` | Full `ResolvedSettings` — game mode, region, DotaTV delay, league ID, reservation TTL, publish gates, ban ladder, newcomer slots, pause setting | Whole-document `set`. Don't park extra fields here; they get dropped on the next save |
| `inhouseConfig/lobby` | `{ password, maxOpenLobbies }` | Shared lobby password and the cap on simultaneously recruiting **published** lobbies (default 2) |
| `inhouseConfig/admins` | `{ discordIds: [], steamIds: [] }` | Fail-closed: an unreadable or empty list grants nobody admin |
| `inhouseConfig/schedule` | `{ slots: RecurringSlot[] }` | Your scheduler already consumes this |
| `inhouseConfig/records` | `{ entries: [{ label, value, when }] }` | Sampled by `!record` |

The admin list is cached for 60 seconds on the shared store, so a role change
takes up to a minute to take effect in lobby chat.

### 5.1 The open-lobby cap

New, and it has a Discord-side consequence. The website refuses to open a third
recruiting lobby once `maxOpenLobbies` published lobbies exist, and tells the
user to join one instead.

**Unpublished lobbies deliberately do not count**, so a host quietly filling a
private game never blocks anyone else. If you add a create path in Discord,
apply the same rule — otherwise the cap is trivially bypassed by starting the
game from Discord rather than the site.

---

## 6. What the website shows, and what it needs from you

Mostly for context, so the two surfaces agree.

The landing page shows the three most recent games — whatever their state — as
cards, and the match history continues from the fourth. Cards are built from
`slotSnapshot` and `memberships` (see the lobby-bot document, §3.1–3.2), so the
things you need to keep true are:

- `discordName` on `inhousePlayers` — the name shown everywhere
- the participation counters `gamesPlayed`, `gamesPublished`, `nightsPlayed`,
  `distinctTeammates`, `heroesPlayed` — these drive the leaderboards, and they
  are cumulative, non-rivalrous and monotonic by design. Nothing here may decay,
  and nothing may be improved by playing selfishly.

The website never writes those counters except through the backfill on link.

### 6.1 One thing the website has that Discord doesn't

Lobby names now come from a fixed table of 1000 Polish nouns without diacritics
([`lobby-names.ts`](../src/lib/inhouse/lobby-names.ts)), assigned at creation and
stored on `game.lobbyName`. If your cards show a lobby name, read that field
rather than deriving one from the host's name, or the two surfaces will tell
people to search for different strings.

---

## 7. Open items — decisions needed from you

1. **`inhouse_ban_lifted` is unhandled** (§2.2). The only functional gap on this
   side. ~10 lines.
2. **Host panel for website-created games** (§3.1). Confirm whether your card
   creation already triggers off the document write, or whether it only fires for
   Discord-initiated games.
3. **DST on recurring slots.** `inhouseConfig/schedule` stores
   `timeZoneOffsetMinutes`, a fixed UTC offset. Nothing shifts it across DST, so
   a slot silently moves by an hour in March and October. Either the admin UI
   grows a warning or the field becomes an IANA zone name resolved with
   `Intl.DateTimeFormat`. The website will follow whichever you pick.
4. **Ping roles and regions.** `InhousePlayer.region` and `ReadyEntry.region`
   exist and nothing reads them. If the community ever spans EU/NA this needs to
   land before the live board and ping roles are built around a single region,
   not after.
5. **Auto-publish fallback.** If publish rate comes in low, the design doc's
   last-resort lever — auto-publishing any lobby short of ten for 30 minutes — is
   unimplemented. Worth agreeing the trigger while it is still hypothetical.
