import 'server-only';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { requireEnv } from '@/lib/env';
import { getSessionSteamId } from '@/lib/session';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore } from './store';

// The website's Discord-side identity. The site already has a signed Steam
// session (`pdl_session`, see src/lib/session.ts); this adds the Discord half,
// which the link flow needs to know *whose* profile a Steam account attaches
// to. Same HMAC-signed-cookie approach, one shared secret.
//
// Steam ID is the identity that always exists; Discord is the optional profile
// key (§3.1). So `getInhouseViewer` resolves both and the linked player record.

const SECRET = requireEnv('PDL_SESSION_SECRET', process.env.PDL_SESSION_SECRET);
export const DISCORD_COOKIE_NAME = 'inhouse_did';
export const DISCORD_COOKIE_MAXAGE = 60 * 60 * 24 * 365;

export interface DiscordSession {
  discordId: string;
  discordName: string | null;
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
}

export function signDiscordSession(s: DiscordSession): string {
  const payload = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

export function verifyDiscordSession(token: string): DiscordSession | null {
  const decoded = decodeURIComponent(token);
  const dot = decoded.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = decoded.slice(0, dot);
  const sig = decoded.slice(dot + 1);
  const expected = hmac(payload);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as DiscordSession;
  } catch {
    return null;
  }
}

export async function getDiscordSession(): Promise<DiscordSession | null> {
  const store = await cookies();
  const token = store.get(DISCORD_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyDiscordSession(token);
}

/** The full identity of whoever is looking at the page. */
export interface InhouseViewer {
  discordId: string | null;
  discordName: string | null;
  /** Primary Steam32 — from the linked player, falling back to the Steam session cookie. */
  steamId32: string | null;
  /** All Steam accounts linked to this Discord profile. */
  linkedSteamIds: string[];
  /** True once at least one Steam account is linked to the Discord profile. */
  linked: boolean;
}

/**
 * Resolve the viewer from the Discord session, the Steam session and the
 * linked player record. Never throws on a Firestore hiccup — pages that show
 * the viewer must still render, so a store error degrades to the cookie-only
 * identity.
 */
export async function getInhouseViewer(): Promise<InhouseViewer> {
  const [ds, steamFromCookie] = await Promise.all([getDiscordSession(), getSessionSteamId()]);

  let linkedSteamIds: string[] = [];
  let steamId32: string | null = steamFromCookie;
  let discordName = ds?.discordName ?? null;

  if (ds && isInhouseConfigured()) {
    try {
      const player = await getInhouseStore().getPlayer(ds.discordId);
      if (player) {
        linkedSteamIds = player.steamIds ?? [];
        steamId32 = player.steamId32 ?? steamId32;
        discordName = player.discordName ?? discordName;
      }
    } catch {
      // Firestore unavailable — fall back to the cookie identity.
    }
  }

  return {
    discordId: ds?.discordId ?? null,
    discordName,
    steamId32,
    linkedSteamIds,
    linked: linkedSteamIds.length > 0,
  };
}
