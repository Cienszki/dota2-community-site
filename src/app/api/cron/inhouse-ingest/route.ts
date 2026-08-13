import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import crypto from 'crypto';
import { getDb, isInhouseConfigured } from '@/lib/firebase-admin';
import { checkParse, ingestFinishedMatch } from '@/lib/inhouse/ingest';
import { getMatchRecord, listAwaitingParse } from '@/lib/inhouse/match-record';
import { reconcileLobbies } from '@/lib/inhouse/sweep';
import { sweepRankingEnrolment } from '@/lib/inhouse/ranking-enrol';
import { STATS_TAG } from '@/lib/inhouse/stats';
import type { InhouseGame } from '@/lib/inhouse/core/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The other half of ingestion, on a timer.
//
// Two jobs, and they exist for different reasons:
//
//   1. **Catch-up.** Any game that reached a played state without getting a
//      match record — the webhook never arrived, or OpenDota hadn't ingested
//      the match yet when it did. This is what makes the webhook optional
//      rather than load-bearing.
//   2. **Parse follow-up.** A replay parse takes minutes to hours. Nothing
//      request-scoped can wait for it, so pending records are polled here and
//      the awards folded in whenever they land.
//   3. **Ranking enrolment.** Everyone who has played an inhouse, or linked
//      their accounts, belongs in the site's ranking. Reconciled here rather
//      than hooked onto the link paths, because two of those run inside the bot
//      and a hook would silently cover only half of them.
//   4. **Stuck-lobby recovery.** A game the worker never turned into a real
//      Dota lobby blocks the concurrent-lobby cap and holds a Steam account
//      until something writes it off. The bot's own sweeper runs inside the
//      worker, so it is down in exactly the case that causes this.
//
// Suggested cadence: every 10–15 minutes. Both passes are bounded per run, so
// a backlog drains over several runs rather than blowing the invocation limit.
//
//   GET /api/cron/inhouse-ingest
//   Authorization: Bearer <CRON_SECRET>

const CATCH_UP_LIMIT = 10;
const PARSE_LIMIT = 15;

/** States a game can be in and still be owed a match record. */
const PLAYED_STATES = ['in_progress', 'finished'];

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : header;
  const a = crypto.createHash('sha256').update(presented).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isInhouseConfigured()) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const ingested: string[] = [];
  const pending: string[] = [];
  const parsed: string[] = [];
  const gaveUp: string[] = [];

  try {
    // ── Pass 0: lobbies the worker stopped tending ──
    //
    // First, because it is the one that unblocks hosting for everyone else and
    // it is cheap — one indexed query that is empty on a healthy system.
    //
    // Forced past the throttle: this is the backstop for the hours when nobody
    // is on the site to trigger it from a page load, which is exactly when a
    // stranded lobby would otherwise sit holding an account until morning.
    const reconciled = await reconcileLobbies({ force: true });
    const swept = [...reconciled.failed, ...reconciled.expired];

    // Additive and idempotent, and it must never take the sweep down with it:
    // a Supabase hiccup should not stop matches being ingested.
    let enrolled = null;
    try {
      enrolled = await sweepRankingEnrolment();
    } catch (err) {
      console.error('inhouse ingest cron: ranking enrolment failed', err);
    }
    // ── Pass 1: games that have been played but have no match record ──
    //
    // Ordered oldest-first on updatedAt so a backlog drains from the front
    // rather than starving whatever has been waiting longest.
    const snap = await getDb()
      .collection('inhouseGames')
      .where('state', 'in', PLAYED_STATES)
      .orderBy('updatedAt', 'asc')
      .limit(CATCH_UP_LIMIT * 3)
      .get();

    for (const doc of snap.docs) {
      if (ingested.length + pending.length >= CATCH_UP_LIMIT) break;

      const game = doc.data() as InhouseGame;
      if (!game.dotaMatchId) continue;
      if (await getMatchRecord(game.dotaMatchId)) continue;

      const outcome = await ingestFinishedMatch(game.id, game.dotaMatchId);
      if (outcome.status === 'ingested') ingested.push(game.id);
      else if (outcome.status === 'not_ready') pending.push(game.id);
      else if (outcome.status === 'gave_up') gaveUp.push(game.id);
    }

    // ── Pass 2: records waiting on a replay parse ──
    for (const record of await listAwaitingParse(PARSE_LIMIT)) {
      const outcome = await checkParse(record);
      const label = record.gameId ?? `match:${record.dotaMatchId}`;
      if (outcome === 'parsed') parsed.push(label);
      else if (outcome === 'gave_up') gaveUp.push(label);
    }

    // Anything that changed a counter invalidates the boards, same as the
    // webhook. Parsed replays count too: that is when medals and awards land.
    if (ingested.length > 0 || parsed.length > 0) revalidateTag(STATS_TAG, { expire: 0 });

    return NextResponse.json(
      {
        ok: true,
        sweptStuckLobbies: swept,
        rankingEnrolment: enrolled,
        ingested,
        awaitingOpenDota: pending,
        parsed,
        gaveUp,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('inhouse ingest cron', err);
    return NextResponse.json({ error: 'sweep failed' }, { status: 500 });
  }
}
