import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import AdminLogoutButton from './AdminLogoutButton';
import Link from 'next/link';
import { Toaster } from 'sonner';
import { ALLOWED_ADMIN_EMAILS } from '@/lib/admin-emails';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin-login');
  }

  const isAuthorized = ALLOWED_ADMIN_EMAILS.includes(user.email ?? '');

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-10 backdrop-blur-sm">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Odmowa dostępu</h1>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              Nie posiadasz uprawnień do zarządzania tą stroną.
              <br />
              Jeśli uważasz, że to błąd, skontaktuj się z administratorem.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                         bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white
                         text-sm font-medium transition-all"
            >
              ← Powrót do strony głównej
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Admin header bar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-[#0d0e12]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white tracking-tight">Panel Admina</span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium border border-zinc-700/50 rounded-md px-2 py-0.5">
              {user.email}
            </span>
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      <main>{children}</main>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#181a20',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#e2e8f0',
          },
        }}
      />
    </div>
  );
}
