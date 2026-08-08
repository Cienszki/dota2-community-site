# Inhouse integration — setup

The website talks to the lobby bot **only through Firestore** (the same database
the bot's Discord gateway and lobby workers use). There is no HTTP API on the
bot. See the full spec in [`website-integration.md`](../website-integration.md).

**Handing work to the bot developers?** Give them these two, which describe the
seam from their side and list what each still needs to implement:

- [`lobby-bot-integration.md`](./lobby-bot-integration.md) — the lobby worker:
  commands it receives, documents the website expects it to write.
- [`discord-bot-integration.md`](./discord-bot-integration.md) — the gateway:
  events, document writes to react to, shared configuration.

## 1. Environment variables

Add these to `.env.local` (and to the hosting provider in production):

| Var | What | Where to get it |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Base64 of the bot's Firebase service-account JSON | Firebase console → Project settings → Service accounts → Generate key, then base64 it |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord OAuth app | Discord developer portal. Scopes: `identify`, `connections` |
| `DISCORD_GUILD_ID` | The community's Discord server ID | Server → Copy Server ID |
| `NEXT_PUBLIC_SITE_URL` | Public origin, e.g. `https://dota2inhouse.pl` | Must equal the bot's own `SITE_URL` |
| `INHOUSE_BOT_WEBHOOK_SECRET` | Shared secret for the lobby bot's match-finished webhook | Generate one; set the **same value** on the bot |
| `CRON_SECRET` | Bearer token for `/api/cron/inhouse-ingest` | Generate one; set it on whatever runs the schedule |
| `OPENDOTA_API_KEY` | Optional. Raises the OpenDota rate limit | opendota.com → API keys. Unset works fine at this volume |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # a secret
```

Base64 a service-account file:

```bash
node -e "console.log(Buffer.from(require('fs').readFileSync('service-account.json')).toString('base64'))"
```

The site degrades gracefully when `FIREBASE_SERVICE_ACCOUNT_BASE64` is unset:
inhouse pages show an "unavailable" state instead of crashing.

## 2. Firestore security rules — nothing to deploy

Browsers never touch Firestore directly (§2.2) — all access is server-side via
the Admin SDK, which bypasses rules entirely regardless of what they say.

The bot's Firebase project (`tournament-tracker-f35tb`) is **shared with the
Tournament Tracker app**, which owns a large, actively-maintained ruleset —
teams, matches, standins, fantasy lineups, admin roles, and the bot
orchestrator's own collections (`botAccounts`, `botCommands`, `botEvents`,
`botLobbySessions`, `botSyncTasks` — the Next.js "orchestrator" side of the
same `worker-api.md` contract the Discord gateway uses on the other side).

**Verified 2026-08-08 by reading the live ruleset directly:** it ends in a
trailing `match /{document=**} { allow read, write: if false; }`, and nothing
above that catch-all names any `inhouse*` collection. Every `inhouseGames` /
`inhousePlayers` / `inhouseAttendance` / `inhouseModeration` / `inhouseBans` /
`inhouseConfig` / `inhouseLinkCodes` / `inhouseReadyPool` / `inhouseMatches` /
`inhouseCounters` document is already covered by that catch-all. **Do not**
`firebase deploy --only firestore:rules` from this repo — there is no
`firebase.json` here on purpose, so that command has nothing to point at. Doing
it anyway (e.g. by hand-authoring one) would replace the Tournament Tracker
app's entire ruleset with the single deny-all line in `./firestore.rules`,
which is kept only as documentation of the protection level these collections
need — already provided — not as something to deploy.

## 3. Composite indexes — deployed 2026-08-08, verified safe first

**Done.** All 6 rows below exist in the live project as of 2026-08-08, via
`firebase deploy --only firestore:indexes --project tournament-tracker-f35tb
--non-interactive` (no `--force`).

That command's actual behavior was verified by reading `firebase-tools`' own
source (`lib/firestore/api.js`, `FirestoreApi.deploy`) before running it, not
assumed: **index creation is unconditional** (always applied), while
**deletion of indexes present live but absent from the local file requires an
explicit `--force` flag** — without it, they're only logged
("there are N indexes... not present in your firestore indexes file. To
delete them, run this command with the --force flag") and left untouched. Ran
it, then listed indexes again to confirm: 16 → 22, and every one of
Tournament Tracker's original 16 (`teams`, `matches`, `standins`,
`notifications`, `botAccounts`, `botLobbySessions`, `botSyncTasks`, …) still
present, byte-for-byte.

So — corrected from the earlier caution in this doc — an **indexes-only**
deploy from this repo is safe here, same as any other Firestore project,
*as long as `--force` is never passed*. Rules remain the one thing to never
deploy from this repo (§2) — that operation has no such create-only
protection, it's a full replace.

If this needs re-running later (new query shape, new collection):
```bash
firebase deploy --only firestore:indexes --project tournament-tracker-f35tb --non-interactive
```

The authoritative list is `firestore.indexes.json` — derived by auditing every
`.where()`/`.orderBy()` in `src/lib/inhouse/**` (including the vendored core,
whose queries this site runs too) and cross-checked against the bot repo's
`inhouse-data-model.md`:

| Collection | Fields | Query |
|---|---|---|
| `inhouseGames` | `published` ASC, `state` ASC | the live board |
| `inhouseGames` | `state` ASC, `endedAt` **DESC** | `listRecentFinishedGames` (`.orderBy('endedAt','desc')`) |
| `inhouseGames` | `state` ASC, `endedAt` **ASC** | `getCommunityStats` (`.where('endedAt','>=',monthStart)`) |
| `inhouseGames` | `state` ASC, `updatedAt` ASC | ingest catch-up sweep |
| `inhouseGames` | `botAccountId` ASC, `state` ASC | `findGameByBotAccount` — the admin pool's force-release |
| `inhouseGames` | `state` ASC, `scheduledFor` ASC | the bot's scheduler |
| `inhouseGames` | `publishedByDiscordId` ASC, `publishedAt` ASC | the bot's publish-per-day gate |
| `inhouseModeration` | `kind` ASC, `subjectSteamId32` ASC | `countPriorBans` / ban ladder |
| `inhouseModeration` | `kind` ASC, `subjectDiscordId` ASC | as above, other identity |
| `inhouseMatches` | `parseState` ASC, `ingestedAt` ASC | parse follow-up sweep |

**Both `endedAt` directions are genuinely required** — this was the one that
bit. Firestore can scan an index backwards, but only by reversing *every*
field at once, so `(state ASC, endedAt DESC)` also serves
`(state DESC, endedAt ASC)` and **not** `(state ASC, endedAt ASC)`. A range
filter (`endedAt >= x`) with no explicit `.orderBy()` implies ASC, so it needs
its own index alongside the DESC one used by the ordered listing.

Single-field queries (`inhouseAttendance.steamId32`, `inhouseMatches.gameId`,
`inhousePlayers.steamIds array-contains`, every `createdAt >= x` on its own)
need nothing — Firestore indexes each field automatically. Only the multi-field
rows above need explicit creation, and `firestore.indexes.json` lists exactly
those.

## 3a. Result ingestion

The website resolves finished matches from OpenDota — ledger, player counters,
match record, replay-parse request. Two entry points:

- `POST /api/inhouse/matches/finished` — the lobby bot's push, authenticated with
  `INHOUSE_BOT_WEBHOOK_SECRET`. Fast path.
- `GET /api/cron/inhouse-ingest` — the sweep, authenticated with `CRON_SECRET`.
  Catches anything the webhook missed and polls for replay parses, which can take
  hours.
- `GET /api/cron/inhouse-backfill` — league backfill, same secret. Walks
  `/leagues/{id}/matches` and pulls in every match not already stored, so medals
  can be derived across the league's whole history and not just games this site
  created. Bounded per call; run it repeatedly until `ingested` comes back 0.
  Not on a schedule — run it by hand after setting the League ID, and again
  whenever you want to catch up:

  ```bash
  curl -sS -H "Authorization: Bearer $CRON_SECRET" \
    "https://<site>/api/cron/inhouse-backfill?limit=50"
  ```

**Schedule the cron every 10–15 minutes.** Both passes are bounded per run, so a
backlog drains over several runs. On Vercel, add to `vercel.json`:

```jsonc
{ "crons": [{ "path": "/api/cron/inhouse-ingest", "schedule": "*/10 * * * *" }] }
```

Vercel sends its own `Authorization: Bearer $CRON_SECRET`, so no extra wiring is
needed there. Anywhere else, a `curl` from any scheduler works:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/inhouse-ingest
```

Without the cron, matches still ingest via the webhook — but replay parses never
get folded in, so the silly awards never appear.

## 4. Shared domain code

`src/lib/inhouse/core/` is a **verbatim vendored copy** of the bot's
`@dota2inhouse/core` package (see `core/VENDORED.md`). It carries the
safety-critical reservation / moderation / slot-accounting logic that must stay
identical across both halves. Do not hand-edit it — fix the bot's copy and
re-sync.

Import surface:

```ts
import { getInhouseStore } from '@/lib/inhouse/store';   // server only
import { toPublicGame } from '@/lib/inhouse/public';      // pure, client-safe
import { modeName, formatDuration } from '@/lib/inhouse/display'; // pure
import type { InhouseGame } from '@/lib/inhouse/core/types'; // type-only, anywhere
```
