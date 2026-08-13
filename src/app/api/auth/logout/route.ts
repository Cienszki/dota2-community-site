import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/session';
import { DISCORD_COOKIE_NAME } from '@/lib/inhouse/session';

// Sign out of both halves of the public identity at once.
//
// There are two independent session cookies — the Steam one set by
// /api/auth/steam/callback and the Discord one set by
// /api/inhouse/auth/discord/callback — and someone who clicks "Wyloguj"
// means both. Clearing only the one they happened to sign in with most
// recently would leave them still logged in with no obvious way out.
//
// Not touched: the Supabase admin session. That is a separate login with its
// own button in /admin, and dropping it from a footer link on a public page
// would be a surprise.
//
// POST only. A logout on GET is a logout any <img> tag on any page can
// perform on a visitor's behalf.

export async function POST(request: Request) {
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });

  // Same attributes the callbacks set, so the browser matches and replaces
  // these rather than keeping the originals alongside them.
  const secure = new URL(request.url).protocol === 'https:';
  for (const name of [SESSION_COOKIE_NAME, DISCORD_COOKIE_NAME]) {
    res.cookies.set(name, '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  return res;
}
