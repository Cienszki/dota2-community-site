import type { NextConfig } from "next";

// The Firebase-hosted tournament SPA (tournament-tracker-f35tb.web.app). It
// serves dota2inhouse.pl/<tournament-slug> pages; new slugs are added straight
// from its own database, so they cannot be enumerated here.
const TOURNAMENT_ORIGIN = 'https://tournament-tracker-f35tb.web.app';

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: process.cwd(),
  },
  // Anything this app doesn't own falls through to the tournament SPA, so the
  // dynamic /<tournament> pages keep working under the main domain with no slug
  // list to maintain. `fallback` runs AFTER all pages/static/dynamic routes and
  // just before the 404 (see next.config rewrites docs), which is exactly why
  // the old greedy `app/[slug]` route had to go: a dynamic route matches before
  // fallback, so it would have 404'd every tournament path first.
  //
  // Only the SPA's HTML shell + JS/CSS bundle are proxied here; its data
  // (Firestore) and images (Firebase Storage) load straight from Google.
  //
  // ── Paths the tournament site owns. Do not create routes for these. ──
  //
  //   /api/session   Their session endpoint. It lived at /api/auth/session,
  //                  which collided with ours, and they moved it here in
  //                  Aug 2026 so we would not need an exception. It only keeps
  //                  working because we have no route at that path and the
  //                  fallback carries it — adding one would silently break
  //                  their auth, with no error on either side.
  //
  // The reverse list (everything we own, which they reserve as tournament
  // slugs) is in docs/tournament-site-domain-cutover.md. If either side adds a
  // top-level path, tell the other — this is the one class of change that
  // breaks the other app without failing anywhere visible.
  async rewrites() {
    return {
      fallback: [
        { source: '/:path*', destination: `${TOURNAMENT_ORIGIN}/:path*` },
      ],
    };
  },
  experimental: {
    serverActions: {
      // Basher issues can run to dozens of pages uploaded in one submit
      // (uploadBasherPages sends every page's File in a single FormData
      // request) — 10mb was truncating that upload mid-stream ("Unexpected
      // end of form"). Raised to comfortably fit a large multi-page issue
      // even at the per-file 8MB cap enforced in src/lib/validate-image.ts.
      bodySizeLimit: "150mb",
    },
    // This fork's proxy.ts (src/proxy.ts) buffers the ENTIRE request body in
    // memory so both proxy and the route/action can read it — capped at
    // 10mb by default, separately from serverActions.bodySizeLimit above.
    // Since proxy.ts's matcher covers /admin (where the Server Action
    // posts), large multi-page Basher uploads were getting truncated here
    // FIRST, before ever reaching the (already-raised) action body limit —
    // hence "Unexpected end of form" persisting even after that first fix.
    proxyClientMaxBodySize: "150mb",
  },
  images: {
    qualities: [75, 80],
    // Allows a `?v=<mtime>` cache-busting query string on local /public
    // images (e.g. the ranking page icon) — Next.js otherwise rejects any
    // search string on a local image src with a 400.
    localPatterns: [
      {
        pathname: '/images/**',
      },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        // Steam serves avatars from several CDN hostnames — avatars.steamstatic,
        // avatars.fastly.steamstatic, avatars.akamai.steamstatic — and which one
        // you get back varies by account and over time. Matching the suffix
        // avoids an avatar 400ing purely because Valve moved a CDN.
        hostname: '**.steamstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.steamstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'community.cloudflare.steamstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.cloudflare.steamstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'api.opendota.com',
      },
      {
        protocol: 'https',
        hostname: 'gjodbqwhhxzbpaozodaf.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

export default nextConfig;
