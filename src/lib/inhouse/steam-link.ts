import 'server-only';
import { getInhouseStore } from '@/lib/inhouse/store';
import { backfillOnLink } from '@/lib/inhouse/core';
import { toSteam32 } from '@/lib/inhouse/display';

// Linking a Steam account from a pasted profile link.
//
// The website's own paths prove ownership (Steam OpenID, or a Steam connection
// on the Discord profile). This one does not: it takes the person's word for
// which account is theirs. That is a deliberate call — the incentive to claim
// somebody else's account is close to nil, since the stats are for fun, awards
// are checked by hand, and the practical effect of linking the wrong ID is that
// lobby invites go to a stranger rather than to you.
//
// The one hard protection stays: `linkSteamAccount` refuses an account already
// claimed by a different Discord profile, so nothing here can take an account
// away from someone who already linked it.

export type SteamResolution =
  | { ok: true; steamId32: string }
  | { ok: false; reason: 'unrecognised' | 'vanity_not_found' | 'lookup_failed' };

/**
 * Turn whatever the player pasted into a Steam32 id.
 *
 * Accepts every form people actually paste: a full profile URL of either kind,
 * a bare 64-bit id, a bare 32-bit account id, and the classic `STEAM_0:1:…`
 * textual form. Anything with a vanity name in it needs a Steam Web API call,
 * which is the only part that can fail for reasons the player can't see.
 */
export async function resolveSteamInput(raw: string): Promise<SteamResolution> {
  const input = raw.trim().replace(/^<|>$/g, '');
  if (!input) return { ok: false, reason: 'unrecognised' };

  // STEAM_X:Y:Z — universe is ignored, as every Dota account is universe 1.
  // Safe in plain numbers: the account id is what fits in 32 bits, unlike the
  // 64-bit form below.
  const legacy = input.match(/^STEAM_[0-5]:([01]):(\d+)$/i);
  if (legacy) {
    return { ok: true, steamId32: String(Number(legacy[2]) * 2 + Number(legacy[1])) };
  }

  // [U:1:123456789]
  const bracketed = input.match(/^\[U:1:(\d+)\]$/i);
  if (bracketed) return { ok: true, steamId32: bracketed[1] };

  const profiles = input.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profiles) return { ok: true, steamId32: toSteam32(profiles[1]) };

  const vanity = input.match(/steamcommunity\.com\/id\/([^/?#\s]+)/i);
  if (vanity) return resolveVanity(decodeURIComponent(vanity[1]));

  if (/^\d{17}$/.test(input)) return { ok: true, steamId32: toSteam32(input) };
  // A bare account id. Bounded above so a mistyped 64-bit id can't land here
  // as a plausible-looking account.
  if (/^\d{1,10}$/.test(input) && Number(input) < 4294967296) {
    return { ok: true, steamId32: input };
  }

  // A bare vanity name, or a URL shape we didn't match — try it as a vanity,
  // since that is the only remaining thing it can be.
  if (/^[A-Za-z0-9_-]{2,32}$/.test(input)) return resolveVanity(input);

  return { ok: false, reason: 'unrecognised' };
}

async function resolveVanity(name: string): Promise<SteamResolution> {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    console.error('resolveVanity: STEAM_API_KEY is not set — custom profile URLs cannot be resolved');
    return { ok: false, reason: 'lookup_failed' };
  }

  try {
    const url = new URL('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/');
    url.searchParams.set('key', key);
    url.searchParams.set('vanityurl', name);

    const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!response.ok) return { ok: false, reason: 'lookup_failed' };

    const body = (await response.json()) as { response?: { success?: number; steamid?: string } };
    // success 1 = resolved, 42 = no match. Anything else is Steam being Steam.
    if (body.response?.success !== 1 || !body.response.steamid) {
      return { ok: false, reason: body.response?.success === 42 ? 'vanity_not_found' : 'lookup_failed' };
    }
    return { ok: true, steamId32: toSteam32(body.response.steamid) };
  } catch (err) {
    console.error('resolveVanity', err);
    return { ok: false, reason: 'lookup_failed' };
  }
}

export type LinkOutcome =
  | { status: 'linked'; steamId32: string; gamesFound: number; total: number }
  | { status: 'already_linked'; steamId32: string }
  | { status: 'claimed_by_other' }
  | { status: 'unrecognised' | 'vanity_not_found' | 'lookup_failed' };

/**
 * Resolve and link in one step, exactly as the lobby-chat `!link` does.
 *
 * Routed through `linkSteamAccount` rather than writing `steamIds` directly
 * (docs/discord-bot-integration.md §4): it is additive, so a smurf joins the
 * list instead of replacing the main; it refuses an account someone else has
 * claimed; and the backfill afterwards is what stamps this Discord id onto the
 * historical attendance rows — "we found your 34 previous games" is the whole
 * reason anybody links at all.
 */
export async function linkSteamFromInput(
  discordId: string,
  discordName: string | null,
  raw: string
): Promise<LinkOutcome> {
  const resolved = await resolveSteamInput(raw);
  if (!resolved.ok) return { status: resolved.reason };

  const store = getInhouseStore();
  const link = await store.linkSteamAccount(discordId, resolved.steamId32, 'manual', discordName);

  if (!link.ok) return { status: 'claimed_by_other' };
  if (link.alreadyLinked) return { status: 'already_linked', steamId32: resolved.steamId32 };

  let gamesFound = 0;
  try {
    gamesFound = (await backfillOnLink(store, discordId, resolved.steamId32)).gamesFound;
  } catch (err) {
    console.error('linkSteamFromInput: backfill failed', err);
  }

  return { status: 'linked', steamId32: resolved.steamId32, gamesFound, total: link.total };
}
