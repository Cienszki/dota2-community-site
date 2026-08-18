# Domain cutover — instructions for the Tournament Tracker developer

`dota2inhouse.pl` is moving from Firebase Hosting to Vercel, where a new
community site will serve the root and most top-level pages. **Your tournament
pages keep working at exactly the same URLs** — `dota2inhouse.pl/wiosenna`,
`/pdl`, and every future tournament slug.

This document is everything you need to know, and the three things you need to
do. Written against your app as it actually runs today (probed 2026-08-08), not
against assumptions.

---

## 0. Status — we are ready on our side

Everything on the community-site side is built, deployed and verified. **The
cutover now waits on one thing: TASK 1 below (`assetPrefix`).**

Please reply with:

1. **Confirmation that `assetPrefix` is deployed to production.** We verify with:

   ```bash
   curl -s https://tournament-tracker-f35tb.web.app/<a-real-slug> \
     | grep -o 'src="[^"]*_next[^"]*"' | head -3
   ```

   Every result must be an absolute `https://tournament-tracker-f35tb.web.app/...`
   URL. If any is a bare `/_next/...`, it is not deployed yet.

2. **A date/time that suits you.** Pick a quiet hour. We flip DNS; you do
   nothing at that moment. Rollback is a DNS change and takes minutes.

3. **Anything in §4/§5 that doesn't match how your app actually works.** Those
   are the two checks we could not fully verify from outside.

Nothing here is urgent to the minute — but until `assetPrefix` ships, the
cutover would serve your pages unstyled, so we will not schedule it.

---

## 1. What is changing

Today, DNS for `dota2inhouse.pl` points at Firebase Hosting, and your app serves
every path.

After the cutover, DNS points at **Vercel**, and the community site owns the
paths it knows about. Everything it does not recognise **falls through to your
app**, proxied, with the URL unchanged in the browser.

```
                    ┌───────────────────────────────────────────┐
  dota2inhouse.pl → │  Vercel — community site (Next.js)        │
                    │                                            │
                    │  owns: /  /inhouse/*  /ranking  /newsy     │
                    │        /hall-of-fame  /basher  /streamy    │
                    │        /kontakt  /rekrutacja  /o-nas       │
                    │        /polityka-prywatnosci /wesprzyj-nas │
                    │        /players/*  /admin/*  /admin-login  │
                    │        /auth/*  /api/*                     │
                    │                                            │
                    │  everything else ──────┐                   │
                    └────────────────────────┼───────────────────┘
                                             ↓  (rewrite, URL unchanged)
                    ┌────────────────────────────────────────────┐
                    │  Firebase Hosting — tournament-tracker-f35tb│
                    │  /wiosenna  /pdl  /<any-new-slug>  …        │
                    └────────────────────────────────────────────┘
```

The mechanism is a Next.js **fallback rewrite** in the community site's config:

```ts
async rewrites() {
  return {
    fallback: [
      { source: '/:path*', destination: 'https://tournament-tracker-f35tb.web.app/:path*' },
    ],
  };
}
```

`fallback` runs *after* all of the community site's own pages, static files and
dynamic routes have been checked, and immediately before it would render a 404.
So it is a true "anything I don't handle is yours" rule — **no slug list to
maintain**. New tournaments added to your database work the instant they exist,
with no deploy or config change on either side.

---

## 2. What stays exactly the same

Worth stating plainly, because it is most of the system:

- **Your URLs.** `dota2inhouse.pl/wiosenna` stays `dota2inhouse.pl/wiosenna`. A
  rewrite proxies; it does not redirect, so the address bar never changes.
- **Your data.** Firestore and Firebase Storage are called directly from the
  browser to `*.googleapis.com`. They never touch the domain and are completely
  unaffected.
- **Your auth.** Firebase Auth talks to `identitytoolkit.googleapis.com`
  directly — same story. (One caveat in §6.)
- **Your deploys.** Keep deploying to Firebase Hosting exactly as you do now.
- **Your codebase**, apart from the one config line in §3.

---

## 3. TASK 1 — Set `assetPrefix` (the important one)

**This is the only change that is genuinely required, and it should be deployed
*before* the DNS cutover.**

### The problem

Your app and the community site are **both Next.js**, so you both serve
JavaScript and CSS from the same path namespace: `/_next/static/...`.

Right now your HTML asks the browser for relative paths:

```html
<script src="/_next/static/chunks/1255-eae4096fb21f1304.js">
```

After the cutover, `/_next/static/...` on `dota2inhouse.pl` hits **Vercel
first**. It works — Vercel doesn't have that file, so the fallback rewrite
proxies it to Firebase and the right bytes come back (verified end to end,
byte-identical). But relying on it is fragile and wasteful:

- **Every one of your JS/CSS requests round-trips through Vercel**, adding a
  hop of latency and counting against the community site's bandwidth quota.
- **Collisions are possible.** Two independent Next builds can, in principle,
  emit a chunk with the same filename and different contents. If that ever
  happens, Vercel serves *its* file for *your* page, and the tournament app
  breaks in a way that is genuinely horrible to debug.

### The fix

Tell your app to load its own assets from Firebase directly, by absolute URL:

```js
// next.config.js  (tournament-tracker)
const nextConfig = {
  assetPrefix:
    process.env.NODE_ENV === 'production'
      ? 'https://tournament-tracker-f35tb.web.app'
      : undefined,
  // …the rest of your existing config
};

module.exports = nextConfig;
```

Your HTML then emits absolute URLs:

```html
<script src="https://tournament-tracker-f35tb.web.app/_next/static/chunks/1255-….js">
```

Those bypass Vercel entirely. No collision surface, no proxy hop, no shared
bandwidth. **The page HTML itself still comes through Vercel** (that is what
keeps the URL on `dota2inhouse.pl`) — only the static assets go direct.

### You will probably also need CORS

Fonts are subject to CORS **unconditionally**, and Next.js may add
`crossorigin` to its script tags. Once assets are cross-origin, both need
Firebase to say they may be loaded from another domain. Add to `firebase.json`:

```jsonc
{
  "hosting": {
    "headers": [
      {
        "source": "/_next/static/**",
        "headers": [
          { "key": "Access-Control-Allow-Origin", "value": "*" }
        ]
      }
    ]
  }
}
```

`*` is appropriate here — these are public, immutable, content-hashed build
artefacts with nothing user-specific in them. The header is harmless if it
turns out not to have been needed, so add it rather than waiting to find out
from a font that silently fails to load.

**How to verify it worked:** deploy, open
`https://tournament-tracker-f35tb.web.app/wiosenna`, and check the Network tab
— script/CSS requests should now show the absolute `tournament-tracker-f35tb`
URL rather than a relative path, and none should be red.

---

## 4. TASK 2 — Confirm no `/api/*` collision

The community site owns these five API namespaces. Anything under them will
**never** reach your app after cutover:

```
/api/auth/*        /api/contact/*     /api/cron/*
/api/inhouse/*     /api/ward-click/*
```

Everything else under `/api/` still falls through to you normally.

I probed your app and found `/api/auth`, `/api/cron` and `/api/contact` all
return 404, so **there is no collision today**. But you know your codebase and
I only know its HTTP surface — please confirm, and avoid those five names in
future. If you do need one of them, say so and we will carve out an exception
in the community site's config.

---

## 5. TASK 3 — Confirm your image handling

I found **no `/_next/image` references** in your rendered HTML; your images load
straight from `firebasestorage.googleapis.com`. If that is true everywhere, you
have nothing to do here.

The reason it matters: `/_next/image` is Next's image **optimizer endpoint**,
and after cutover those requests would be served by *Vercel's* optimizer, which
validates the source URL against the **community site's** `remotePatterns`
allow-list. `firebasestorage.googleapis.com` is not on that list, so any image
going through the optimizer would start returning **400**.

So: if you use `next/image` anywhere with a Firebase Storage source, either
keep it `unoptimized`, or tell us and we will add
`firebasestorage.googleapis.com` to the community site's `remotePatterns`. A
quick `grep -r "next/image" src/` on your side settles it.

---

## 6. Things worth knowing (no action required, but don't be surprised)

### Your app currently returns **200 for unknown paths**

I checked: `/zzz-nonsense-xyz` on your app returns **HTTP 200** with a rendered
page, not a 404.

Combined with the fallback rewrite, this means that after cutover **no URL on
`dota2inhouse.pl` will ever return a real 404** — every typo falls through to
you and gets a 200. That is bad for SEO (search engines index infinite junk
URLs) and mildly confusing for users.

Not blocking, and entirely your call, but if you want real 404s the fix is on
your side: return a proper 404 status for a slug that matches no tournament.
In the App Router that is `notFound()` from `next/navigation`; the status code
is what matters, not the page content.

### Reserved slugs

Already handled — the community site's route names are reserved on your side so
a tournament can never be created with a slug that the community site would
shadow. Nothing further to do; just keep it in mind when adding top-level
routes to either app. If either of us adds a new top-level path, tell the
other.

The current, complete list of top-level paths we own — please check this against
your reserved-slug list, as two entries were missing from earlier versions of
this document (`admin-login`, `auth`):

```
admin          hall-of-fame   o-nas                  ranking
admin-login    inhouse        players                rekrutacja
api            kontakt        polityka-prywatnosci   streamy
auth           newsy          basher                 wesprzyj-nas
```

Plus the files `favicon.ico`, `icon1.png`, `icon2.png`, `robots.txt`,
`sitemap.xml`, and the `_next/` prefix — which is the one TASK 1 is about.

### SSR and caching

Your app is server-rendered (`X-Powered-By: Next.js`, `Cache-Control: private,
no-cache, no-store`). Those `no-store` headers pass through the proxy intact, so
behaviour is unchanged — but it does mean every tournament page view is a
Vercel request *and* a Firebase function invocation. If you were relying on
Firebase CDN caching for HTML, you weren't (the headers disable it), so nothing
regresses. Worth revisiting only if you later add caching.

### Firebase Auth redirect flows

If you use `signInWithRedirect` anywhere, Firebase's OAuth handler lives at
`/__/auth/handler` on your Firebase domain, and the authorised-domain list in
the Firebase console matters. After cutover `dota2inhouse.pl` will be serving
your pages, so **add `dota2inhouse.pl` to Firebase Console → Authentication →
Settings → Authorized domains** if it is not already there. If you only use
`signInWithPopup` or email/password, this does not apply — but it costs nothing
to add.

---

## 7. Testing before the cutover

You can validate almost everything without touching DNS:

1. Deploy the `assetPrefix` + CORS change to Firebase.
2. Confirm `https://tournament-tracker-f35tb.web.app/wiosenna` still works
   perfectly on its own — absolute asset URLs, no console errors. **This is the
   one that matters**, because `assetPrefix` is live for you from that moment,
   independent of the domain.
3. Ask us to run the fallback check against the community site's Vercel URL —
   `https://dota2-community-site-291p-zeta.vercel.app/wiosenna` already proxies
   to you today, so we can confirm the whole chain before any DNS change.

Step 3 has already been verified once with the current build; re-running it
after your `assetPrefix` deploy is the real test.

---

## 8. The cutover itself, and rollback

DNS is managed in **Cloudflare**. The switch is: point `dota2inhouse.pl` at
Vercel instead of Firebase Hosting, and add the domain in the Vercel project.
We will do that side.

**Rollback is fast and total.** If anything goes wrong, we point DNS back at
Firebase Hosting and you are serving the whole domain again exactly as today —
nothing about your app has changed except `assetPrefix`, which is harmless when
the domain is yours (absolute URLs to your own origin still resolve fine).

That is worth emphasising: **the `assetPrefix` change is safe to deploy now and
leave in place regardless of when — or whether — the cutover happens.**

---

## Summary — your checklist

| # | Task | Blocking? |
|---|---|---|
| 1 | Add `assetPrefix` to `next.config.js` + CORS header in `firebase.json`, deploy | **Yes — do before cutover** |
| 2 | Confirm no `/api/{auth,contact,cron,inhouse,ward-click}` routes | Yes, but likely already fine |
| 3 | Confirm no `next/image` with Firebase Storage sources | Yes, but likely already fine |
| 4 | Add `dota2inhouse.pl` to Firebase authorised domains (if using redirect auth) | Only if you use `signInWithRedirect` |
| 5 | Consider returning real 404s for unknown slugs | No — quality improvement |

Questions, or anything above that doesn't match how your app actually works —
say so before the cutover rather than after.
