import { NextResponse } from 'next/server';
import { getBoard } from '@/lib/inhouse/live';
import { isInhouseConfigured } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// JSON snapshot of the live board — the polling fallback LiveBoard uses when
// SSE isn't available, and handy for debugging. Published-open games only.

export async function GET() {
  if (!isInhouseConfigured()) {
    return NextResponse.json({ open: [], recent: [] });
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
