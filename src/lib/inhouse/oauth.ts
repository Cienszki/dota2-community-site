import 'server-only';

// Shared OAuth/OpenID plumbing for the identity routes. Kept out of the
// route.ts files because Next only permits a fixed set of exports from a route
// module — a stray `export const` there is a build error.

export const OAUTH_STATE_COOKIE = 'inhouse_oauth_state';

/** Discord scopes: identity, connected accounts (free Steam link, §3.2), and
 *  the guild-member read used to prefer the server nickname (§3.1a). */
export const DISCORD_SCOPES = 'identify connections guilds.members.read';

/**
 * The public origin to build redirect/return URLs against.
 *
 * In production we prefer `NEXT_PUBLIC_SITE_URL` so the value is stable and
 * matches both the Discord-registered redirect URI and the Steam OpenID realm
 * exactly — a www/non-www drift there fails verification. Locally we honour the
 * request host so dev on any port just works.
 */
export function requestOrigin(request: Request): string {
  const host = request.headers.get('host') ?? '';
  if (host.includes('localhost') || host.startsWith('127.')) {
    return `http://${host}`;
  }
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (configured) return configured;
  return `https://${host}`;
}
