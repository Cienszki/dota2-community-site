import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { listAccounts, type AccountsPage } from '@/lib/inhouse/accounts';
import AccountRow from './AccountRow';

export const dynamic = 'force-dynamic';

export default async function AccountsAdminPage() {
  const configured = isInhouseConfigured();

  let page: AccountsPage | null = null;
  let loadError = false;
  if (configured) {
    try {
      page = await listAccounts();
    } catch (err) {
      console.error('inhouse accounts load failed', err);
      loadError = true;
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/admin/inhouse"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" /> Inhouse
      </Link>

      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/25 bg-red-600/15">
          <Users className="h-5 w-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Konta graczy</h1>
          <p className="text-sm text-slate-500">
            Połączenia Steam ↔ Discord, obecność w rankingu i bany
          </p>
        </div>
      </div>

      {!configured ? (
        <Notice>Firestore nie jest skonfigurowany.</Notice>
      ) : loadError ? (
        <Notice>Nie udało się wczytać kont. Sprawdź logi serwera.</Notice>
      ) : !page || page.rows.length === 0 ? (
        <Notice>
          Nie ma jeszcze żadnych kont. Pojawią się, gdy ktoś połączy konta albo zagra pierwszy mecz.
        </Notice>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Stat label="połączonych" value={page.totals.linked} />
            <Stat label="bez Discorda" value={page.totals.unlinked} />
            <Stat label="w rankingu" value={page.totals.inRanking} />
            <Stat label="wykluczonych" value={page.totals.excluded} tone="amber" />
          </div>

          {!page.rankingAvailable && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Nie można odczytać stanu rankingu — prawdopodobnie nie uruchomiono migracji{' '}
              <code className="text-amber-100">024_ranking_inhouse_enrolment.sql</code>. Statusy
              „w rankingu” i „wykluczone” poniżej są nieprawdziwe, dopóki to nie zostanie zrobione.
            </div>
          )}

          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            Gracze trafiają do rankingu automatycznie po pierwszym meczu albo po połączeniu kont.
            „Usuń z rankingu” jest trwałe — konto nie wróci po kolejnych meczach, dopóki nie zostanie
            przywrócone tutaj.
          </p>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/40">
            {page.rows.map((row) => (
              <AccountRow key={row.key} row={row} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'amber';
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className={`text-lg font-black tabular-nums ${tone === 'amber' ? 'text-amber-300' : 'text-white'}`}
      >
        {value}
      </span>
      <span className="text-slate-500">{label}</span>
    </span>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-8 text-center text-slate-300">
      {children}
    </div>
  );
}
