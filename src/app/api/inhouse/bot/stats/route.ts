import { NextResponse } from 'next/server';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore } from '@/lib/inhouse/store';
import { getLeaderboards, getPlayerOfWeek } from '@/lib/inhouse/stats';
import { sortMedals, medalTooltip, type Medal } from '@/lib/inhouse/medals';
import { botAuthorized } from '@/lib/inhouse/bot-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// `/ranking` and `/medale`.
//
//   GET /api/inhouse/bot/stats?view=ranking
//   GET /api/inhouse/bot/stats?view=medals&discordId=…
//
// Both read the same numbers the leaderboards page renders — `getLeaderboards`
// is cached against STATS_TAG and invalidated by result ingestion, so Discord
// and the website can never quote different totals for the same night.
//
// Medals live inline on the player document, so an unlinked player has none —
// not zero, *none*, and the bot says so rather than posting an empty board.

export async function GET(request: Request) {
  if (!botAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isInhouseConfigured()) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const view = params.get('view');

  if (view === 'ranking') {
    const [boards, playerOfWeek] = await Promise.all([getLeaderboards(), getPlayerOfWeek()]);
    return NextResponse.json(
      {
        gamesPlayed: boards.gamesPlayed.slice(0, 10),
        gamesPublished: boards.gamesPublished.slice(0, 10),
        playerOfWeek,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (view === 'medals') {
    const discordId = params.get('discordId')?.trim();
    if (!discordId) {
      return NextResponse.json({ error: 'discordId is required' }, { status: 400 });
    }

    const player = await getInhouseStore().getPlayer(discordId);
    if (!player || !player.steamIds?.length) {
      return NextResponse.json({ status: 'not_linked' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const raw = (player as { medals?: Medal[] }).medals;
    const medals = sortMedals(Array.isArray(raw) ? raw : []);

    return NextResponse.json(
      {
        status: 'ok',
        name: player.discordName,
        gamesPlayed: player.gamesPlayed ?? 0,
        medals: medals.map((m) => ({
          id: m.id,
          label: m.label,
          place: m.place,
          period: m.period,
          description: m.description,
          summary: medalTooltip(m),
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json({ error: 'unknown view' }, { status: 400 });
}
