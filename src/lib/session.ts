import { cookies } from 'next/headers';
import crypto from 'crypto';
import { requireEnv } from './env';

const SECRET = requireEnv('PDL_SESSION_SECRET', process.env.PDL_SESSION_SECRET);
const COOKIE_NAME = 'pdl_session';

function hmac(data: string): string {
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
}

export function sign(steamId: string): string {
  return `${steamId}:${hmac(steamId)}`;
}

export function verify(token: string): string | null {
  // Cookie value may be URL-encoded by the browser (':' → '%3A')
  const decoded = decodeURIComponent(token);
  const lastColon = decoded.lastIndexOf(':');
  if (lastColon === -1) return null;
  const steamId = decoded.slice(0, lastColon);
  const sig = decoded.slice(lastColon + 1);
  const expected = hmac(steamId);
  if (sig.length !== expected.length) return null;
  // Timing-safe comparison
  if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return steamId;
  }
  return null;
}

export async function getSessionSteamId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verify(token);
}
