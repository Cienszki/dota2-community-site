import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

// Called by .github/workflows/sync-player-stats.yml right after it finishes
// writing to Supabase, so /ranking (cached, see revalidate export there)
// picks up fresh data within seconds instead of waiting for its 6h fallback.
//
//   GET /api/cron/revalidate-ranking
//   Authorization: Bearer <CRON_SECRET>

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

  revalidatePath('/ranking');

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
