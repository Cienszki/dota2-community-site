import { NextResponse } from 'next/server';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { joinInfoFor, joinLobbyFor } from '@/lib/inhouse/join-lobby';
import { botAuthorized, identityForDiscord, requiredString } from '@/lib/inhouse/bot-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "Dołącz" in Discord — the same reservation, waitlist and Steam invite the
// website's join dialog performs (docs/discord-bot-integration.md §4.1).
//
//   GET  /api/inhouse/bot/join?gameId=…&discordId=…    → what to show
//   POST /api/inhouse/bot/join                          → actually reserve
//        { "gameId": "…", "discordId": "…", "discordName": "…" }
//
// The GET is what fills the ephemeral "how to join" message: lobby name,
// password, game mode and region for the manual path, plus whether this player
// can be invited automatically. The POST is the invite button behind it.
//
// A player with no linked Steam account comes back as `needs_link` rather than
// an error — that is the moment the bot offers linking, and it converts better
// than any other.

export async function GET(request: Request) {
  if (!botAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isInhouseConfigured()) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const url = new URL(request.url);
  const gameId = url.searchParams.get('gameId')?.trim();
  const discordId = url.searchParams.get('discordId')?.trim();
  if (!gameId || !discordId) {
    return NextResponse.json({ error: 'gameId and discordId are required' }, { status: 400 });
  }

  const identity = await identityForDiscord(discordId, url.searchParams.get('discordName'));
  const info = await joinInfoFor(identity, gameId);

  return NextResponse.json(info, { headers: { 'Cache-Control': 'no-store' } });
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

  const gameId = requiredString(body, 'gameId');
  const discordId = requiredString(body, 'discordId');
  if (!gameId || !discordId) {
    return NextResponse.json({ error: 'gameId and discordId are required' }, { status: 400 });
  }

  const identity = await identityForDiscord(discordId, requiredString(body, 'discordName'));
  const result = await joinLobbyFor(identity, gameId);

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
