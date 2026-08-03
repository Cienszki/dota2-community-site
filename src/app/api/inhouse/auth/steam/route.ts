import { NextResponse } from 'next/server';
import { getDiscordSession } from '@/lib/inhouse/session';
import { buildSteamAuthUrl } from '@/lib/inhouse/steam-openid';
import { requestOrigin } from '@/lib/inhouse/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The Steam OpenID link entry point. A Steam login only attaches to a Discord
// profile, so require the Discord session first and route there if it's absent.

export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const ds = await getDiscordSession();
  if (!ds) {
    return NextResponse.redirect(`${origin}/api/inhouse/auth/discord?next=/inhouse/link`);
  }

  const returnTo = `${origin}/api/inhouse/auth/steam/callback`;
  return NextResponse.redirect(buildSteamAuthUrl(returnTo, origin));
}
