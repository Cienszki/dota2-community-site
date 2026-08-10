import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore } from '@/lib/inhouse/store';
import { backfillLeague } from '@/lib/inhouse/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// League backfill — pull every match the league has ever played into
// `inhouseMatches`, so medals can be derived across the whole history rather
// than only from games this website happened to create.
//
// Separate from the ingest sweep on purpose. That one runs every ten minutes
// and must stay fast; this one walks a list that can be hundreds of matches
// long, each needing its own OpenDota fetch. It is bounded per call and safe to
// run repeatedly — dedupe is a document get on the match id, so a second run
// picks up where the first stopped.
//
//   GET /api/cron/inhouse-backfill[?league=18234&limit=25]
//   Authorization: Bearer <CRON_SECRET>
//
// With no `league`, it uses the configured League ID from the admin defaults —
// which is the one that matters, since it is the league every inhouse is played
// under.

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 60;

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

  const params = new URL(request.url).searchParams;

  let leagueId = Number(params.get('league'));
  if (!Number.isInteger(leagueId) || leagueId <= 0) {
    leagueId = (await getInhouseStore().getAdminDefaults()).leagueId;
  }
  if (!Number.isInteger(leagueId) || leagueId <= 0) {
    return NextResponse.json(
      { error: 'no league configured — set League ID in /admin/inhouse or pass ?league=' },
      { status: 400 },
    );
  }

  const requested = Number(params.get('limit'));
  const limit = Number.isInteger(requested) && requested > 0
    ? Math.min(requested, MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const result = await backfillLeague(leagueId, limit);
    return NextResponse.json(
      {
        ok: true,
        leagueId,
        ...result,
        // `found` is the league's whole history; `skipped` is what we already
        // had. Run again while ingested > 0.
        done: result.ingested === 0,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('inhouse league backfill', err);
    return NextResponse.json({ error: 'backfill failed' }, { status: 500 });
  }
}
