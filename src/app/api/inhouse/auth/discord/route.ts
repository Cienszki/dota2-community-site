import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireEnv } from '@/lib/env';
import { DISCORD_SCOPES, OAUTH_STATE_COOKIE, requestOrigin } from '@/lib/inhouse/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Step one of the Discord link (§3.2): bounce the user to Discord's consent
// screen. We request `connections` so that if they've already connected Steam
// in their Discord settings, we get their Steam ID for free on the way back.

export async function GET(request: Request) {
  const clientId = requireEnv('DISCORD_CLIENT_ID', process.env.DISCORD_CLIENT_ID);
  const origin = requestOrigin(request);

  const url = new URL(request.url);
  const requested = url.searchParams.get('next') ?? '/inhouse/link';
  const next = requested.startsWith('/') ? requested : '/inhouse/link';

  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `${origin}/api/inhouse/auth/discord/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DISCORD_SCOPES,
    state,
    prompt: 'consent',
  });

  const res = NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);

  // Bind the state + return path to this browser, httpOnly, short-lived.
  const payload = Buffer.from(JSON.stringify({ state, next })).toString('base64url');
  res.cookies.set(OAUTH_STATE_COOKIE, payload, {
    httpOnly: true,
    secure: origin.startsWith('https'),
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return res;
}
