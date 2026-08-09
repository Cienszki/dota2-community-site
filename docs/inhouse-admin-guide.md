# Inhouse admin guide — running the community, not the code

For whoever operates the inhouse system day to day: setting defaults, managing
the bot pool, adding admins. Not a developer document — no code changes here,
just the `/admin/inhouse` panel and a couple of one-time Firestore/GitHub
setup steps the panel doesn't cover.

All screenshots below describe the Polish UI as shipped; field names are
quoted exactly as they appear on screen.

---

## 1. Default game settings — `/admin/inhouse`, "Ustawienia domyślne"

Every new inhouse inherits these at the moment it's created. **Changing a
value here never touches a game that's already open** — only new ones.

### League ID

The one field that gates everything downstream of a match. Set to `0` it
means "unconfigured": games still run, but the match isn't publicly
retrievable, so attendance, match pages, awards and retroactive credit for
linking all stay empty — silently, with no error anywhere. Set this to your
league's real ID before the first inhouse.

### "Lobby" section

With these settings the bot opens the Dota lobby:

| Field | What it controls |
|---|---|
| Tryb gry | Game mode (All Pick, Captains Mode, etc.) |
| Region | Server region |
| Opóźnienie DotaTV | Broadcast delay |
| Pierwszy wybór | Coin flip vs. manual side/pick-order selection |
| Pauzy | Unlimited / limited / disabled pausing |
| Obserwatorzy | Allow spectators |
| Cheaty | Enable cheat commands (leave off) |
| Wypełnij botami | Fill empty slots with AI bots (leave off — inhouses run 10 humans) |
| Immortal Draft | Random captains draft their own teams |

**Immortal Draft note:** the panel's helper text currently says this "doesn't
work until the bot updates its Game Coordinator schema" — that's now stale.
The bot side was patched (2026-08) to send the field the GC actually expects.
It should work; it just hasn't been confirmed against a live match yet. Turn
it on for one test lobby and check whether teams actually get auto-drafted
before relying on it for a real inhouse — if the checkbox visibly does
nothing, leave it off and flag it back.

### "Sloty i rezerwacje" section

| Field | What it controls |
|---|---|
| Rezerwacja (s) | How long a held slot survives before it's released back |
| Odliczanie startu (s) | Countdown before `!start` actually launches |
| Wygaśnięcie lobby (min) | Idle lobby auto-closes after this many minutes with no activity |
| Sloty dla nowych | Slots reserved for newcomers |

### "Publikacja" section

Who can open a filling lobby to the whole server, and how often:

| Field | What it controls |
|---|---|
| Nudge publikacji (min) | After this long stalled at 5–9 players, the bot asks the host whether to publish |
| Gry przed publikacją | Games a *non-host* player needs before they're allowed to publish someone else's lobby. **The host of a lobby can always publish their own**, regardless of this number — that exemption was fixed on the bot side, so a first-time host is never silently blocked by their own gate. |
| Publikacje / dzień | Cap on publishes per person per day (`0` = unlimited) |

### "Moderacja" section

**Drabinka banów** — comma-separated days, e.g. `7, 30, 0`. Each repeat ban
against the same person walks one rung further; `0` means permanent. Applies
regardless of which Steam alt or Discord account the offense came from.

---

## 2. Lobby password and concurrent-lobby cap — same page, "Lobby i limity"

Separate box, separate save button — this is site-level policy, not a
per-game default.

- **Hasło do lobby** — one password shared by every lobby, whatever surface
  opened it (website or Discord). Players type it into Dota's in-game lobby
  browser, so keep it short and free of spaces. Changing it only affects
  lobbies created *after* the change — already-open lobbies keep the password
  they were created with.
- **Limit otwartych lobby** — how many lobbies may be *published and
  recruiting* at once. Once the cap is hit, the website stops offering "open a
  lobby" and points people at the ones already filling instead. Only
  published lobbies count — a host quietly filling a private game never
  blocks anyone else. Default is 2; a third concurrent lobby just splits the
  same players three ways and none of them reach ten.

---

## 3. Bot admins — same page, "Administratorzy bota"

Two text boxes, one Discord ID per line and one Steam32 ID per line.
**Both matter for the same person** — an admin needs their Steam ID to use
`!kick`/`!ban` from inside lobby chat, where there's no Discord identity to
check. This list is fail-closed: if it's empty or unreadable, *nobody* is an
admin, including you. Changes are cached up to 60 seconds by the bot, so
don't expect `!kick` to work the instant you save.

---

## 4. Bot account pool — `/admin/inhouse/pool`, "Pula botów"

**This page is read-only plus force-release — it cannot add a new account.**
It lists every `botAccounts` document (status, which game currently holds its
lease, last heartbeat) and lets you force-release a stale lease (heartbeat
older than 3 minutes, shown with an amber "lease przeterminowany" badge).

### Using the existing tournament accounts for inhouses too

Nothing to do. The pool is one shared collection (`botAccounts` in
Firestore) — the same accounts you've been running tournaments on are
eligible for inhouse lobbies automatically, as long as their document has
`enabled: true`. There's no separate "inhouse pool" vs. "tournament pool";
leasing is just "find an enabled account nobody else currently holds,"
regardless of which side asked. If your tournament accounts are actively
being leased for tournament matches today, they already satisfy that — no
setting to flip.

One thing worth a quick sanity check with whoever built the tournament
scheduling side: confirm it leases accounts through the *same*
`leasedByGameId`/`leaseHeartbeatAt` fields on `botAccounts`, not a separate
mechanism. If it does (which the existing shared-collection design strongly
suggests), a tournament match and an inhouse lobby can never double-claim the
same account. If for some reason it doesn't, the two could theoretically
collide — worth one conversation before a big tournament weekend doubles as
a busy inhouse night.

### Adding a *new* bot account (only if you outgrow the pool later)

There's no form for this — it has to be created directly in the Firestore
console, because the account's Steam login credentials live on the document
itself (the bot manager watches this collection and spawns a worker process
for every `enabled: true` account it finds — no separate deploy needed per
account).

1. Firebase console → Firestore → `botAccounts` collection → **Add document**.
2. Document ID: any short slug, e.g. `bot_09`.
3. Fields:

   | Field | Type | Value |
   |---|---|---|
   | `username` | string | the Steam login |
   | `encryptedPassword` | string | the Steam password, **base64-encoded** — run `node -e "console.log(Buffer.from('the-password').toString('base64'))"` and paste the output. (Named "encrypted" but it's plain base64 today, not real encryption — don't paste this account's actual password anywhere else once it's in Firestore, and treat the console access itself as the security boundary.) |
   | `steamGuardSharedSecret` | string | optional — only if Steam Guard is enabled on that account |
   | `displayName` | string | whatever name should show in bot logs |
   | `enabled` | boolean | `true` |

4. Save. The manager process picks up the new document via its own Firestore
   listener within seconds and spawns a worker for it — no restart needed.
5. Confirm it worked: back on `/admin/inhouse/pool`, the new account should
   appear with `status: idle` shortly after.

Disabling an account (pulling it from rotation without deleting history):
flip `enabled` to `false` on its document. The manager stops its worker
automatically; any lobby it's currently holding keeps running until the
lobby itself ends, since disabling doesn't force a mid-game teardown.

---

## 5. Replay-parse sweep — GitHub repository secrets, not the admin panel

The silly post-match awards (couriers lost, deaths, etc.) depend on OpenDota
having parsed the replay, which nothing requests unless asked. A scheduled
job already exists in this repo —
[`.github/workflows/inhouse-ingest.yml`](../.github/workflows/inhouse-ingest.yml) —
running every 10 minutes via GitHub Actions. It isn't wired up yet because it
needs two repository secrets:

1. GitHub → this repo → **Settings → Secrets and variables → Actions**.
2. Add:

   | Secret | Value |
   |---|---|
   | `INHOUSE_SITE_URL` | the site's public origin, no trailing slash (e.g. `https://dota2inhouse.pl` once the domain is live, or the current Vercel URL until then) |
   | `CRON_SECRET` | must be the **exact same value** already set as `CRON_SECRET` in the Vercel project's environment variables — this workflow doesn't create that value, it has to match an existing one |

3. That's it — no redeploy needed, GitHub Actions picks up new secrets on the
   next scheduled run (within 10 minutes) or trigger it immediately from the
   **Actions** tab → "Inhouse ingest sweep" → **Run workflow**.

Without this, matches still get their basic result via the bot's webhook —
winner, duration, rosters, attendance all still work. The only thing missing
is the awards, which stay silently empty rather than erroring.

**Do not** add this as a Vercel cron in `vercel.json` — Vercel's Hobby plan
rejects any schedule more frequent than once daily, and it fails the *entire
deployment* at build time when it sees one, not just the cron. This already
happened once (see the workflow file's own comment) and cost ten deploys
before anyone noticed. GitHub Actions has no such restriction.

---

## Things that are already done — no action needed here

Recorded so nobody re-does them or worries they're missing, per the current
setup docs (`inhouse-setup.md`):

- **Firestore security rules** — verified 2026-08-08 that the shared
  Firebase project's existing deny-all catch-all already covers every
  `inhouse*` collection. Nothing to deploy from this repo, and deploying the
  simple rules file here *would* be destructive — it would replace Tournament
  Tracker's entire ruleset, since the two apps share one Firebase project.
- **Composite indexes** — deployed 2026-08-08, confirmed all of Tournament
  Tracker's original indexes survived alongside the new ones (16 → 22 total).
