'use client';

import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { LogOut } from 'lucide-react';

export default function AdminLogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push('/ranking');
  };

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 text-sm font-medium transition-all border border-transparent hover:border-red-500/20"
    >
      <LogOut className="w-4 h-4" />
      Wyloguj
    </button>
  );
}
