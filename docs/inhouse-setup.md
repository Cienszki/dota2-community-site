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

## 2. Firestore security rules

Browsers never touch Firestore directly (§2.2) — all access is server-side via
the Admin SDK, which bypasses rules. Deploy the deny-all rules to the **same**
Firebase project the bot uses:

```bash
firebase deploy --only firestore:rules   # uses ./firestore.rules
```

## 3. Composite indexes

Firestore refuses the listing queries until these exist (it logs a creation link
on first failure). Full list in the bot repo's `inhouse-data-model.md`; the ones
this site hits:

| Collection | Fields |
|---|---|
| `inhouseGames` | `published` ASC, `state` ASC |
| `inhouseGames` | `state` ASC, `endedAt` DESC |
| `inhouseAttendance` | `steamId32` ASC |
| `inhouseModeration` | `kind` ASC, `subjectSteamId32` ASC |
| `inhouseModeration` | `kind` ASC, `subjectDiscordId` ASC |
| `inhouseGames` | `state` ASC, `updatedAt` ASC |  ← ingest catch-up sweep |
| `inhouseMatches` | `parseState` ASC, `ingestedAt` ASC | ← parse follow-up sweep |
| `inhouseMatches` | `gameId` ASC | ← match record for a given game |

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
