import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { requireEnv } from '@/lib/env';
import { ALLOWED_ADMIN_EMAILS } from '@/lib/admin-emails';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session — this exchanges the auth code for a session cookie
  // if present, and silently refreshes the session if it's about to expire.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdminPath = request.nextUrl.pathname.startsWith('/admin');
  const isApiAdminPath = request.nextUrl.pathname.startsWith('/api/admin');

  if (isAdminPath || isApiAdminPath) {
    if (!user) {
      if (isApiAdminPath) {
        return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      if (!url.pathname.startsWith('/admin-login')) {
        url.pathname = '/admin-login';
        return NextResponse.redirect(url);
      }
    } else {
      const isAuthorized = ALLOWED_ADMIN_EMAILS.includes(user.email ?? '');
      if (!isAuthorized) {
        if (isApiAdminPath) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        // Redirect non-authorized authenticated users to root or showing layout's access denied (layout already handles this, but redirecting from here is even safer)
        // If we let them through to /admin/..., AdminLayout will render the Access Denied block, which is a good UX.
        // But for /api/admin, we must return a 403 response.
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - any request ending in a static asset extension — images, plus the
     *   scripts/styles/fonts/maps of the Firebase tournament SPA that get
     *   proxied through here via the next.config fallback rewrite. Skipping
     *   them avoids running a Supabase session refresh on every asset request.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|mjs|map|woff|woff2|ttf|otf|eot)$).*)',
  ],
};
