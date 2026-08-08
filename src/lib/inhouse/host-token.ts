import 'server-only';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { requireEnv } from '@/lib/env';

// Proof that this browser opened a given lobby.
//
// Hosting no longer requires a linked account, so `initiatorDiscordId` can be
// empty — which would otherwise leave an anonymous host unable to cancel the
// lobby they just opened. This is the fallback identity for exactly that: a
// signed, HttpOnly list of game IDs this browser created.
//
// Deliberately narrow. It proves "you opened this game", nothing else — it is
// not a login, carries no identity, and grants nothing beyond host controls on
// the games it names. Same HMAC-signed-cookie approach as the Discord session
// next door, same secret.

const SECRET = requireEnv('PDL_SESSION_SECRET', process.env.PDL_SESSION_SECRET);
const COOKIE_NAME = 'inhouse_host';
const MAX_AGE = 60 * 60 * 12; // a lobby outlives its idle expiry, not a day
/** Keep the cookie small; nobody is hosting more than a couple at once. */
const MAX_GAMES = 5;

function hmac(data: string): string {
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
}

function sign(gameIds: string[]): string {
  const payload = Buffer.from(JSON.stringify(gameIds)).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

function verify(token: string): string[] {
  const decoded = decodeURIComponent(token);
  const dot = decoded.lastIndexOf('.');
  if (dot === -1) return [];
  const payload = decoded.slice(0, dot);
  const sig = decoded.slice(dot + 1);
  const expected = hmac(payload);
  if (sig.length !== expected.length) return [];
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return [];
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Remember that this browser opened `gameId`. Call right after createGame. */
export async function rememberHostedGame(gameId: string): Promise<void> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  const games = existing ? verify(existing) : [];
  const next = [gameId, ...games.filter((id) => id !== gameId)].slice(0, MAX_GAMES);
  store.set(COOKIE_NAME, sign(next), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

/** Whether this browser is the one that opened `gameId`. */
export async function hostedThisGame(gameId: string): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verify(token).includes(gameId);
}
