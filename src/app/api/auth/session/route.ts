import { NextResponse } from 'next/server';
import { getSessionSteamId } from '@/lib/session';
import { getDiscordSession } from '@/lib/inhouse/session';

// "Is anyone signed in?", for the footer's logout link.
//
// A route rather than a server-side read in the Footer itself, because the
// Footer lives in the root layout: touching cookies there would opt every
// otherwise-static page in the site into dynamic rendering, to decide whether
// to show one small link. This keeps that cost on the one client that asks.
//
// Deliberately says nothing about *who* — the name isn't needed to render the
// link, and this endpoint is reachable by anything holding the cookie.

export const dynamic = 'force-dynamic';

export async function GET() {
  const [steamId, discord] = await Promise.all([getSessionSteamId(), getDiscordSession()]);

  return NextResponse.json(
    { signedIn: Boolean(steamId || discord) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
