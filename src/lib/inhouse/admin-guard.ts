import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ALLOWED_ADMIN_EMAILS } from '@/lib/admin-emails';

// Website-admin gate, reusing the site's existing Supabase-email auth (the same
// check AdminLayout and admin/actions.ts use). Authorization to reach the
// inhouse admin screens is email-based; `inhouseConfig/admins` (Discord/Steam
// IDs) is a separate thing the panel *edits* — it governs the bot's in-lobby
// !kick/!ban, not access to this panel.

export async function requireWebsiteAdmin(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Unauthenticated: No active session found.');
  if (!ALLOWED_ADMIN_EMAILS.includes(user.email ?? '')) {
    throw new Error('Unauthorized: You do not have administrator permissions.');
  }
  return user.email ?? '';
}

export function isAuthError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'))
  );
}
