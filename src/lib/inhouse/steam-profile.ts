import 'server-only';
import { getInhouseStore } from './store';
import { toSteam64 } from './display';
import type { InhousePlayer } from './core/types';

// Steam persona and avatar for a linked player.
//
// Stored on `inhousePlayers/{discordId}` rather than fetched per render: it
// changes rarely, and the profile card would otherwise make an external call on
// every page load.
//
// The awkward part is *when* to capture it. Accounts get linked four ways —
// the website's Steam OpenID and Discord-connections paths, a `!link` code
// typed in lobby chat, and anything the Discord bot adds — and the last two run
// inside the bot, through the vendored core's `linkSteamAccount`, which this
// repo must not edit. So capture can't live on the link itself.
//
// Instead this is **self-healing on read**: the stored avatar records which
// Steam ID it belongs to, and the profile refreshes it whenever that no longer
// matches the player's current primary account, or when it has gone stale. A
// link made from lobby chat is picked up the next time that player opens their
// profile, with no bot-side cooperation at all.

/** Refresh anything older than this, so a changed persona eventually shows. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60_000;

const FETCH_TIMEOUT_MS = 8_000;

export interface SteamProfile {
  /** Which account this belongs to — the trigger for refetching. */
  steamId32: string;
  personaName: string | null;
  /** 32px. */
  avatarSmall: string | null;
  /** 64px. */
  avatarMedium: string | null;
  /** 184px. */
  avatarFull: string | null;
  fetchedAt: string;
}

interface SteamSummary {
  personaname?: string;
  avatar?: string;
  avatarmedium?: string;
  avatarfull?: string;
}

/**
 * Steam's own summary endpoint. Authoritative and the freshest source, but it
 * needs an API key.
 */
async function fromSteam(steamId32: string): Promise<SteamSummary | null> {
  const key = process.env.STEAM_API_KEY;
  if (!key) return null;

  const base = process.env.STEAM_API_BASE_URL || 'https://api.steampowered.com';
  const url =
    `${base}/ISteamUser/GetPlayerSummaries/v0002/` +
    `?key=${encodeURIComponent(key)}&steamids=${toSteam64(steamId32)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: { players?: SteamSummary[] } };
    return data.response?.players?.[0] ?? null;
  } catch (err) {
    console.error(`steam profile: summary fetch failed for ${steamId32}`, err);
    return null;
  }
}

/**
 * OpenDota's copy of the same three avatar sizes.
 *
 * A fallback rather than the primary, but a real one: it needs no key, and it
 * carries `avatar`/`avatarmedium`/`avatarfull` under `profile` exactly as Steam
 * does. Without it, an unset `STEAM_API_KEY` would mean no avatars at all —
 * and the key is currently only used by the vendored core, which the website no
 * longer calls for ingestion.
 */
async function fromOpenDota(steamId32: string): Promise<SteamSummary | null> {
  const base = process.env.OPENDOTA_BASE_URL || 'https://api.opendota.com/api';
  try {
    const res = await fetch(`${base}/players/${steamId32}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { profile?: SteamSummary | null };
    return data.profile ?? null;
  } catch (err) {
    console.error(`steam profile: opendota fallback failed for ${steamId32}`, err);
    return null;
  }
}

/** Fetch a Steam profile, Steam first and OpenDota second. */
export async function fetchSteamProfile(steamId32: string): Promise<SteamProfile | null> {
  const summary = (await fromSteam(steamId32)) ?? (await fromOpenDota(steamId32));
  if (!summary) return null;

  return {
    steamId32,
    personaName: summary.personaname ?? null,
    avatarSmall: summary.avatar ?? null,
    avatarMedium: summary.avatarmedium ?? null,
    avatarFull: summary.avatarfull ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

function needsRefresh(stored: SteamProfile | undefined, steamId32: string): boolean {
  if (!stored) return true;
  // A different account is now primary — the player linked or unlinked one.
  if (stored.steamId32 !== steamId32) return true;
  const age = Date.now() - Date.parse(stored.fetchedAt);
  return !Number.isFinite(age) || age > STALE_AFTER_MS;
}

/** An `InhousePlayer` with the website-owned profile field attached. */
export type PlayerWithProfile = InhousePlayer & { steamProfile?: SteamProfile };

/**
 * Return the player's Steam profile, fetching and persisting it if it is
 * missing, stale, or belongs to an account they no longer play on.
 *
 * Never throws and never blocks rendering on a bad fetch: a profile card with
 * no avatar is a smaller problem than a profile page that fails.
 */
export async function ensureSteamProfile(
  player: PlayerWithProfile,
): Promise<SteamProfile | null> {
  const steamId32 = player.steamId32 ?? player.steamIds?.[0] ?? null;
  if (!steamId32) return null;

  const stored = player.steamProfile;
  if (!needsRefresh(stored, steamId32)) return stored ?? null;

  const fresh = await fetchSteamProfile(steamId32);

  // Persist the attempt even when it failed, with the fields left null. A
  // private or deleted Steam profile never resolves, and without a recorded
  // attempt `needsRefresh` would stay true and fire two external requests on
  // every single page render for as long as that account is linked. Writing
  // the timestamp turns that into one attempt a week.
  const result: SteamProfile = fresh ?? {
    steamId32,
    personaName: null,
    avatarSmall: null,
    avatarMedium: null,
    avatarFull: null,
    fetchedAt: new Date().toISOString(),
  };

  try {
    await getInhouseStore().upsertPlayer(player.discordId, {
      steamProfile: result,
    } as Partial<InhousePlayer>);
  } catch (err) {
    // Persisting is an optimisation; the caller still gets what we resolved.
    console.error(`steam profile: could not persist for ${player.discordId}`, err);
  }
  return result;
}
