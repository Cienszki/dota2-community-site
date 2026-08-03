import 'server-only';
import { toSteam32 } from './display';

// Steam OpenID 2.0 — the fallback link path, and the primary one for anyone who
// hasn't connected Steam in their Discord settings (§3.3). Steam does not do
// OAuth2/OIDC: no app registration, no client secret. The one non-negotiable
// step is re-verifying the response with `check_authentication`; skipping it
// makes the login trivially forgeable.
//
// The site already runs an OpenID flow for the public ranking
// (src/app/api/auth/steam/*). This is a separate, self-contained copy on
// purpose: that one signs a Steam session and writes to Supabase; this one
// attaches the verified Steam ID to the current Discord profile in Firestore.

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const STEAM_ID_PREFIX = 'https://steamcommunity.com/openid/id/';

export function buildSteamAuthUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `${STEAM_OPENID_URL}?${params.toString()}`;
}

/**
 * Verify a Steam OpenID callback and return the Steam32, or null if the
 * response is missing, malformed, or fails Steam's own signature re-check.
 */
export async function verifySteamCallback(url: URL): Promise<string | null> {
  const claimedId = url.searchParams.get('openid.claimed_id');
  if (!claimedId) return null;

  const verifyParams = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (key.startsWith('openid.')) verifyParams.set(key, value);
  }
  verifyParams.set('openid.mode', 'check_authentication');

  let res: Response;
  try {
    res = await fetch(STEAM_OPENID_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams.toString(),
    });
  } catch {
    return null;
  }

  const text = await res.text();
  const valid = text.split('\n').some((line) => line.trim().toLowerCase() === 'is_valid:true');
  if (!valid) return null;

  const steamId64 = claimedId.replace(STEAM_ID_PREFIX, '');
  if (!/^\d+$/.test(steamId64)) return null;

  try {
    return toSteam32(steamId64);
  } catch {
    return null;
  }
}
