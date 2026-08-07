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
