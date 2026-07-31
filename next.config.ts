import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: process.cwd(),
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
