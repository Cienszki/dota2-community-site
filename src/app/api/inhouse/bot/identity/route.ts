import { NextResponse } from 'next/server';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore } from '@/lib/inhouse/store';
import { linkSteamFromInput } from '@/lib/inhouse/steam-link';
import { botAuthorized, requiredString } from '@/lib/inhouse/bot-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "Połącz ze Steam" / `/link` / `/unlink`.
//
//   POST /api/inhouse/bot/identity
//   { "action": "link",   "discordId": "…", "discordName": "…", "steam": "<pasted>" }
//   { "action": "unlink", "discordId": "…" }
//   GET  /api/inhouse/bot/identity?discordId=…      → what is linked right now
//
// Linking goes through the shared `linkSteamAccount` + backfill, so an account
// joins the list rather than replacing it, one already claimed by a different
// Discord profile is refused, and the player's historical attendance rows are
// stamped with their Discord id on the way through.
//
// Unlink removes **every** Steam account, which is what the Discord command
// offers after a confirmation. Lobby chat's `!unlink` still removes only the
// one account the bot can see, which is why the store takes an optional id.

export async function GET(request: Request) {
  if (!botAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isInhouseConfigured()) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const discordId = new URL(request.url).searchParams.get('discordId')?.trim();
  if (!discordId) {
    return NextResponse.json({ error: 'discordId is required' }, { status: 400 });
  }

  const player = await getInhouseStore().getPlayer(discordId);
  return NextResponse.json(
    {
      linked: Boolean(player?.steamIds?.length),
      steamIds: player?.steamIds ?? [],
      steamId32: player?.steamId32 ?? null,
      discordName: player?.discordName ?? null,
      gamesPlayed: player?.gamesPlayed ?? 0,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  if (!botAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isInhouseConfigured()) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const discordId = requiredString(body, 'discordId');
  const action = requiredString(body, 'action');
  if (!discordId || (action !== 'link' && action !== 'unlink')) {
    return NextResponse.json({ error: 'discordId and a valid action are required' }, { status: 400 });
  }

  if (action === 'unlink') {
    const result = await getInhouseStore().unlinkSteamAccount(discordId);
    return NextResponse.json(
      { status: result.ok ? 'unlinked' : 'nothing_linked', removed: result.removed },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const steam = requiredString(body, 'steam');
  if (!steam) {
    return NextResponse.json({ error: 'steam is required' }, { status: 400 });
  }

  const outcome = await linkSteamFromInput(discordId, requiredString(body, 'discordName'), steam);
  return NextResponse.json(outcome, { headers: { 'Cache-Control': 'no-store' } });
}
