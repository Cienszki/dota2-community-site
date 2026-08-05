import { NextResponse } from 'next/server';
import { getDiscordSession } from '@/lib/inhouse/session';
import { verifySteamCallback } from '@/lib/inhouse/steam-openid';
import { requestOrigin } from '@/lib/inhouse/oauth';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore, backfillOnLink } from '@/lib/inhouse/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Steam OpenID return: verify Steam's signature, then attach the Steam ID to
// the current Discord profile and run the retroactive backfill (§3.6).

export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const back = (params: string) => NextResponse.redirect(`${origin}/inhouse/link?${params}`);

  const ds = await getDiscordSession();
  if (!ds) return back('error=nosession');

  const steamId32 = await verifySteamCallback(new URL(request.url));
  if (!steamId32) return back('error=steam');

  if (!isInhouseConfigured()) return back('error=unconfigured');

  try {
    const store = getInhouseStore();
    const link = await store.linkSteamAccount(ds.discordId, steamId32, 'steam_openid', ds.discordName);
    if (!link.ok && link.reason === 'claimed_by_other') return back('error=claimed');
    if (link.ok && link.alreadyLinked) return back('linked=already');
    const bf = await backfillOnLink(store, ds.discordId, steamId32);
    return back(`linked=1&games=${bf.gamesFound}`);
  } catch {
    return back('error=store');
  }
}
