# Domain cutover — instructions for the lobby bot developer

The community site is moving from

```
https://dota2-community-site-291p-zeta.vercel.app
```

to its real domain

```
https://dota2inhouse.pl
```

**One configuration value changes on your side. Nothing else.** No new
endpoints, no changed payloads, no new secret, no code changes. This document is
long only because it says precisely what does *not* change, so you can be
confident without re-reading the integration spec.

---

## 1. What you change

Whatever holds the website's base URL in the worker/gateway config — the value
the bot prefixes onto every website call:

```diff
- https://dota2-community-site-291p-zeta.vercel.app
+ https://dota2inhouse.pl
```

No trailing slash. Both bots (the lobby worker and the Discord gateway) call the
site, so if they read separate config, both need it.

That is the entire task.

---

## 2. What that value is used for

Every HTTP call from your side to ours. There are two groups.

**The match webhook** — the worker, when a match ends:

| Method | Path |
|---|---|
| POST | `/api/inhouse/matches/finished` |

**The Discord button surface** — the gateway, so that pressing a button in
Discord runs the website's own code paths rather than a second implementation:

| Method | Path |
|---|---|
| GET, POST | `/api/inhouse/bot/identity` |
| GET, POST | `/api/inhouse/bot/join` |
| POST | `/api/inhouse/bot/lobby` |
| GET | `/api/inhouse/bot/stats` |

Paths, methods, request bodies, response shapes and status codes are all
**unchanged**. Only the host in front of them.

---

## 3. What explicitly does NOT change

- **`INHOUSE_BOT_WEBHOOK_SECRET` is the same secret.** Same value, same
  `Authorization: Bearer <secret>` header, same fixed-length comparison on our
  side. Do not rotate it as part of this — that would turn a one-line change
  into two things failing at once.
- **Everything over Firestore.** The command queue (`botCommands/{account}/queue`),
  `inhouseGames`, memberships, reservations, the waitlist, `botAccounts` leasing
  and the heartbeat — none of it involves our domain, or any domain. It is
  unaffected in every respect.
- **Lobby creation, invites, reservations, ingestion, awards.** All of it is
  either Firestore or the endpoints above.
- **Your deploys, your hosting, your Steam accounts.**

If it isn't an HTTP call to the website, this cutover cannot touch it.

---

## 4. Timing — this is not a hard cutover for you

The Vercel URL **keeps working after the domain goes live**. Vercel serves the
project on both, so a bot still pointing at the old URL continues to function.

That means:

- You can change it **before** the cutover — the domain resolves to us the
  moment DNS flips, and until then the old URL still works. There is no window
  where both are broken.
- You can change it **after**, at your convenience.
- We are not asking you to coordinate to the minute.

We would like it switched within a week or so, because the Vercel URL is not a
stable promise — it is derived from the project name and can change. Nothing
breaks the day you miss; it is hygiene, not a deadline.

---

## 5. How to verify it worked

The endpoints are authenticated, so a plain `curl` gets you a `401`. Send a real
header and an empty body — the *error you get back* tells you what you need:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://dota2inhouse.pl/api/inhouse/matches/finished \
  -H "Authorization: Bearer $INHOUSE_BOT_WEBHOOK_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

| Result | Meaning |
|---|---|
| **400** | ✅ **This is success.** Reached us, authenticated, and got as far as "gameId is required" — exactly right for an empty body |
| 401 | Wrong or missing secret |
| 503 | Reached us, but our Firebase config is missing — our problem, tell us |
| 404 | Wrong host or wrong path |
| Connection error / cert error | DNS has not propagated to you yet; wait and retry |

Then the real check: **finish one inhouse match** and confirm it appears on
`https://dota2inhouse.pl/inhouse`. That exercises the webhook end to end.

---

## 6. If something goes wrong

Point the base URL back at the Vercel URL. It keeps working throughout, so
reverting is immediate and total, and costs nothing but the ingest arriving via
the old host.

Then tell us what you saw — ideally the status code and the path.

---

## 7. Unrelated, but while we have your attention

Still outstanding from `bot-todo.md`, and not part of this cutover:

**An unconditional worker heartbeat.** Today the only liveness signal is
`leaseHeartbeatAt`, which exists solely while the worker holds a lease. A bot
that dies overnight with no lobby open is indistinguishable from a healthy one
until somebody tries to host — so our alerting can only fire at the moment the
failure has already cost a player something. A heartbeat written unconditionally,
say every 30 seconds regardless of lease state, would let us notice an outage
before a human does.

No rush, and entirely separate from the domain move.
