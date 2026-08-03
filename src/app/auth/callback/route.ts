import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { requireEnv } from '@/lib/env';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const requestedNext = searchParams.get('next');
  // Defense in depth: only ever redirect to a same-site path. Currently safe
  // regardless (this is concatenated onto `origin` as a raw string below, not
  // resolved via `new URL()`, so it can't escape the origin either way) — but
  // this keeps it safe even if that redirect logic is ever refactored.
  const next = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/admin';

  if (code) {
    // Collect cookies that supabase wants to set
    const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = [];

    const supabase = createServerClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
      requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookies) {
            cookiesToSet.push(...cookies);
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`);
      // Apply the cookies that exchangeCodeForSession asked to set
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          ...options,
        });
      }
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/admin-login?error=auth_failed`);
}
