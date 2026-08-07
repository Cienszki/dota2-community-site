import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { ingestFinishedMatch } from '@/lib/inhouse/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The lobby bot's "this match is over" webhook.
//
// A push rather than a Firestore watch: the website is request-scoped, so a
// long-lived listener is not something it can be relied on to hold, and the bot
// is the side that knows the moment the lobby tore down. The cron sweep exists
// as the safety net for anything this misses (a deploy mid-match, a network
// blip), so the bot may treat a failure here as non-fatal — but retrying is
// still cheaper than waiting for the sweep.
//
//   POST /api/inhouse/matches/finished
//   Authorization: Bearer <INHOUSE_BOT_WEBHOOK_SECRET>
//   { "gameId": "kQ2f…", "dotaMatchId": 7123456789 }
//
// Idempotent: a repeat for a game that already has a match record is a 200 with
// `already_done`, so retries are safe and expected.

function authorized(request: Request): boolean {
  const secret = process.env.INHOUSE_BOT_WEBHOOK_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : header;

  // Compare over fixed-length digests so the check can't be timed, and so
  // mismatched lengths don't throw inside timingSafeEqual.
  const a = crypto.createHash('sha256').update(presented).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isInhouseConfigured()) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  let body: { gameId?: unknown; dotaMatchId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
  if (!gameId) {
    return NextResponse.json({ error: 'gameId is required' }, { status: 400 });
  }

  const raw = body.dotaMatchId;
  const dotaMatchId =
    typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : null;
  if (dotaMatchId !== null && !Number.isFinite(dotaMatchId)) {
    return NextResponse.json({ error: 'dotaMatchId must be a number' }, { status: 400 });
  }

  try {
    const outcome = await ingestFinishedMatch(gameId, dotaMatchId);

    // `not_ready` is the expected answer in the first minute or two after a
    // match: OpenDota has not ingested it yet. 202 says "accepted, the sweep
    // will finish this" so the bot doesn't treat it as a failure worth retrying
    // in a tight loop.
    const status = outcome.status === 'not_ready' ? 202 : outcome.status === 'error' ? 422 : 200;
    return NextResponse.json(outcome, { status });
  } catch (err) {
    console.error('inhouse match finished webhook', err);
    return NextResponse.json({ error: 'ingest failed' }, { status: 500 });
  }
}
