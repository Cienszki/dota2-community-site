import Link from 'next/link';
import { Settings, ShieldCheck, ArrowLeft, Gamepad2 } from 'lucide-react';
import { isInhouseConfigured, getDb } from '@/lib/firebase-admin';
import { getInhouseStore } from '@/lib/inhouse/store';
import type { ResolvedSettings } from '@/lib/inhouse/core/types';
import SettingsForm from './SettingsForm';
import AdminsForm from './AdminsForm';

export const dynamic = 'force-dynamic';

export default async function InhouseAdminPage() {
  const configured = isInhouseConfigured();

  let defaults: ResolvedSettings | null = null;
  let discordIds: string[] = [];
  let steamIds: string[] = [];

  if (configured) {
    try {
      defaults = await getInhouseStore().getAdminDefaults();
      const snap = await getDb().collection('inhouseConfig').doc('admins').get();
      const data = snap.data();
      if (data) {
        discordIds = Array.isArray(data.discordIds) ? data.discordIds : [];
        steamIds = Array.isArray(data.steamIds) ? data.steamIds : [];
      }
    } catch (err) {
      console.error('inhouse admin load failed', err);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Panel Admina
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/25 flex items-center justify-center">
          <Gamepad2 className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Inhouse</h1>
          <p className="text-slate-500 text-sm">Ustawienia domyślne gier i lista adminów bota</p>
        </div>
      </div>

      {!configured ? (
        <div className="bg-slate-900/40 border border-slate-700 rounded-2xl p-8 text-center">
          <p className="text-slate-300">
            Firestore nie jest skonfigurowany. Ustaw <code className="text-slate-100">FIREBASE_SERVICE_ACCOUNT_BASE64</code>,
            aby zarządzać ustawieniami inhouse.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="bg-slate-900/40 border border-slate-700 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-1">
              <Settings className="w-5 h-5 text-red-500" /> Ustawienia domyślne
            </h2>
            <p className="text-slate-500 text-sm mb-6">
              Każda gra dziedziczy te wartości w momencie utworzenia. Zmiana nie wpływa na gry już otwarte.
            </p>
            {defaults && <SettingsForm initial={defaults} />}
          </section>

          <section className="bg-slate-900/40 border border-slate-700 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-red-500" /> Administratorzy bota
            </h2>
            <p className="text-slate-500 text-sm mb-6">
              Lista fail-closed: pusty dokument nie daje nikomu uprawnień admina w bocie.
            </p>
            <AdminsForm discordIds={discordIds} steamIds={steamIds} />
          </section>
        </div>
      )}
    </div>
  );
}
