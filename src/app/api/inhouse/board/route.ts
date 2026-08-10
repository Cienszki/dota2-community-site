import { NextResponse } from 'next/server';
import { getBoard } from '@/lib/inhouse/live';
import { isInhouseConfigured } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// JSON snapshot of the board — the polling fallback InhouseBoard uses when SSE
// isn't available, and handy for debugging. Published games only, plus the
// recent finished list the board's feed continues into.

export async function GET() {
  if (!isInhouseConfigured()) {
    return NextResponse.json({ live: [], recent: [] });
  }
  try {
    const board = await getBoard();
    return NextResponse.json(board, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('inhouse board fetch failed', err);
    return NextResponse.json({ open: [], recent: [] }, { status: 503 });
  }
}
