import { NextResponse } from 'next/server';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { openLobbyFor } from '@/lib/inhouse/open-lobby';
import { botAuthorized, identityForDiscord, requiredString } from '@/lib/inhouse/bot-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "+ nowa gra" in Discord.
//
//   POST /api/inhouse/bot/lobby
//   Authorization: Bearer <INHOUSE_BOT_WEBHOOK_SECRET>
//   { "discordId": "2489…", "discordName": "Wichura",
//     "published": true, "newcomerFriendly": false }
//
// Runs `openLobbyFor`, the same function the website's own button calls — so
// the open-lobby cap, the lobby-name table, the shared password, the lease and
// the create command are all shared rather than reimplemented. The response is
// the website's `CreateResult` verbatim, including `too_many_open` with the
// configured maximum, which the bot shows the host as an ephemeral reply.
//
// `published` is the one parameter the website never varies: site lobbies are
// always public, while Discord asks the host whether this is for everyone or
// just for friends.

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
  if (!discordId) {
    return NextResponse.json({ error: 'discordId is required' }, { status: 400 });
  }

  const identity = await identityForDiscord(discordId, requiredString(body, 'discordName'));
  const result = await openLobbyFor(identity, {
    published: body.published !== false,
    newcomerFriendly: body.newcomerFriendly === true,
  });

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
