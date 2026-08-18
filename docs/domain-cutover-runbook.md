# Domain cutover runbook — dota2inhouse.pl

Moving the community site from `dota2-community-site-291p-zeta.vercel.app` to
`dota2inhouse.pl`, while `dota2inhouse.pl/<tournament-slug>` keeps serving the
Tournament Tracker on Firebase.

This is the **our-side** runbook. The tournament developer has their own
(`tournament-site-domain-cutover.md`); step 0 below is the only thing that
depends on them.

---

## How the split works after the cutover

Both sites answer on one domain because Vercel serves the domain and hands
everything it doesn't recognise to Firebase:

```
dota2inhouse.pl/inhouse      -> our app (a route it has)
dota2inhouse.pl/ranking      -> our app
dota2inhouse.pl/wiosenna     -> no route here, so the fallback rewrite proxies it
                                to tournament-tracker-f35tb.web.app/wiosenna
```

That's `rewrites().fallback` in `next.config.ts`. `fallback` runs **after** every
page, static file and dynamic route of ours, and before the 404 — so our routes
always win, and everything left over is the tournament site. Nobody maintains a
slug list.

The proxy target is Firebase's own `*.web.app` domain, which keeps working no
matter what DNS says. That is what makes rollback safe.

---

## Step 0 — Prerequisite (blocking)

**The tournament dev must have deployed `assetPrefix` and confirmed it is live.**

Why it blocks: their app is also Next.js. Without `assetPrefix` its pages ask
for `/_next/static/...` — and after the cutover that path is *ours*. Our app owns
`/_next`, so it would answer with its own bundles or a 404. Their pages would
arrive as unstyled HTML with dead JavaScript.

Verify before touching DNS:

```bash
curl -s https://tournament-tracker-f35tb.web.app/<a-real-slug> | grep -o 'src="[^"]*_next[^"]*"' | head -3
```

Every hit must be an **absolute** URL to their Firebase origin. If you see
`src="/_next/..."`, stop — they haven't deployed it.

---

## Step 1 — Lower the DNS TTL (do this a day ahead if you can)

Cloudflare → **DNS** → the existing `dota2inhouse.pl` records → set TTL to
**Auto** or 5 minutes.

Nothing else changes. This only means that if you need to roll back, the world
forgets the old answer in minutes instead of hours.

---

## Step 2 — Add the domain in Vercel (before DNS)

Vercel → your project → **Settings → Domains → Add**:

1. `dota2inhouse.pl`
2. `www.dota2inhouse.pl`

Set **`dota2inhouse.pl` as the primary** and let Vercel redirect `www` to it.
Everything in the codebase — sitemap, robots, canonical URLs, OAuth redirects —
already assumes the bare domain. A www/non-www mismatch is the classic way to
break Steam OpenID, which compares the realm against the return URL host.

Vercel will show **"Invalid Configuration"** until DNS points at it. That is
expected — it's telling you what to do in step 3, not that anything is wrong.

---

## Step 3 — Switch DNS in Cloudflare

Delete (or note down and replace) the existing A records that point at Firebase
Hosting, and add what Vercel's Domains page shows you. Typically:

| Type | Name | Value | Proxy |
|---|---|---|---|
| A | `@` | `76.76.21.21` | **DNS only (grey)** |
| CNAME | `www` | `cname.vercel-dns.com` | **DNS only (grey)** |

**Use exactly the values Vercel displays** — they are authoritative and do
change. Cloudflare supports CNAME flattening at the apex, so if Vercel offers a
CNAME for the root, that works too.

### Grey cloud, not orange — this matters

Turn the proxy **off** (grey cloud) for both records.

Vercel issues and renews the TLS certificate itself, and it validates over HTTP.
With Cloudflare proxying in front, that validation can fail, and if Cloudflare's
SSL mode is "Flexible" you get a redirect loop: Cloudflare talks HTTP to Vercel,
Vercel redirects to HTTPS, forever.

You lose nothing — Vercel already is a CDN. If you specifically want Cloudflare's
WAF later, turn the proxy on **after** the certificate is issued and set
SSL/TLS → **Full (strict)** first.

Then wait for Vercel to show **Valid Configuration** and issue the certificate —
usually a minute or two.

### Leave Firebase Hosting's custom domain alone

Don't remove `dota2inhouse.pl` from Firebase Hosting yet. It costs nothing while
DNS points elsewhere, and it is your rollback.

---

## Step 4 — Register the new OAuth callbacks (BEFORE step 5)

Order matters here. Step 5 makes the app *start using* these URLs; if they
aren't registered first, every login breaks the moment you redeploy.

**Add, don't replace** — the old URLs can stay for now, which is what keeps the
Vercel URL working as an escape hatch.

### Discord developer portal
Application → **OAuth2 → Redirects**, add:

```
https://dota2inhouse.pl/api/inhouse/auth/discord/callback
```

### Supabase
Dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://dota2inhouse.pl`
- **Redirect URLs**: add `https://dota2inhouse.pl/**`

This is the setting that sent admin logins to `localhost` before. It lives in
Supabase, not in the code.

### Steam
Nothing to register — Steam OpenID has no app registration. It derives the realm
from the origin, which is why the www/non-www decision in step 2 matters.

---

## Step 5 — Point the app at the new origin

Vercel → **Settings → Environment Variables**:

```
NEXT_PUBLIC_SITE_URL = https://dota2inhouse.pl
```

No trailing slash. This one variable now drives three things: the Discord OAuth
redirect URI, the Steam OpenID realm/return URL, and `metadataBase` — which is
what makes the Discord link preview show its image.

**Then redeploy.** `NEXT_PUBLIC_*` variables are inlined into the build, so
changing the value alone does nothing until a new build runs. Deployments →
latest → **Redeploy**.

---

## Step 6 — Update the GitHub Actions secret

`Cienszki/dota2-community-site` → **Settings → Secrets and variables → Actions**:

```
INHOUSE_SITE_URL = https://dota2inhouse.pl
```

This is the match-ingest cron. If it's left pointing at the Vercel URL it will
keep working, so this is tidiness rather than urgency — but the Vercel URL is not
a promise, and a stale one here means matches silently stop importing.

---

## Step 7 — The bot (message for the bot developer)

The bot calls the website over HTTP, so it has our base URL configured on its
side. It needs to change:

> The community site moves to **`https://dota2inhouse.pl`** on <date>.
>
> Please point the website base URL at that. It's the host for:
> - `POST /api/inhouse/matches/finished` (match-finished webhook)
> - `POST /api/inhouse/bot/identity`, `/bot/join`, `/bot/lobby`, `/bot/stats`
>   (the Discord buttons that run the site's own code paths)
>
> **`INHOUSE_BOT_WEBHOOK_SECRET` does not change** — same secret, same headers,
> same payloads. Only the host.
>
> The old Vercel URL keeps working for a while, so this is not a hard cutover
> for you — but please switch soon so we can retire it.

Nothing else on the bot side is affected. Everything else between the bot and
the site goes through Firestore, which has no notion of our domain.

---

## Step 8 — Verify

```bash
# Our app, on the domain
curl -sI https://dota2inhouse.pl/inhouse | head -1          # 200
curl -sI https://www.dota2inhouse.pl | head -1              # 307/308 to apex

# A tournament page still served, through the fallback rewrite
curl -sI https://dota2inhouse.pl/<a-real-slug> | head -1     # 200

# The tournament page's assets come from Firebase, not from us
curl -s https://dota2inhouse.pl/<a-real-slug> | grep -o 'src="[^"]*_next[^"]*"' | head -3
```

Then by hand:

- [ ] A tournament page renders **styled and interactive** (this is the
      `assetPrefix` check — unstyled means step 0 wasn't really done)
- [ ] Discord login works and lands back on `dota2inhouse.pl`
- [ ] Steam link works from `/inhouse`
- [ ] Admin login works and does **not** bounce to localhost
- [ ] Paste `https://dota2inhouse.pl` into Discord — the embed now shows the
      banner (this only works once step 5's redeploy is done)
- [ ] Open a lobby, and confirm the bot reacts
- [ ] `https://dota2inhouse.pl/sitemap.xml` and `/robots.txt` resolve — both
      have always claimed this domain, and are only now telling the truth

---

## Rollback

If anything is wrong: **put the Firebase A records back in Cloudflare.**

With a low TTL that is minutes, and the whole domain serves the tournament site
exactly as it does today. Our site stays reachable on the Vercel URL throughout,
so nothing is lost while you work out what happened.

You do **not** need to undo the Vercel domain, the env var, or the OAuth
registrations to roll back DNS — they simply go unused. The only thing that
would need reverting is `NEXT_PUBLIC_SITE_URL` (plus a redeploy), and only if
you want logins on the Vercel URL to keep working while you're rolled back.

---

## After it settles (a week or so)

- Remove the old Vercel-URL redirect from the Discord OAuth app
- Remove `dota2inhouse.pl` from Firebase Hosting's custom domains
- Ask the bot dev to confirm they've switched
- Consider turning on the Cloudflare proxy (orange cloud) with SSL/TLS set to
  **Full (strict)**, if you want the WAF
