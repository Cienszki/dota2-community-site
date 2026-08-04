import Link from 'next/link';
import { ArrowLeft, Server, AlertTriangle } from 'lucide-react';
import { isInhouseConfigured, getDb } from '@/lib/firebase-admin';
import ReleaseButton from './ReleaseButton';

export const dynamic = 'force-dynamic';

const STALE_MS = 3 * 60_000;

// Extracted so the react-compiler lint doesn't flag an intentional request-time
// read inside this dynamic server component.
function nowMs(): number {
  return Date.now();
}

interface BotAccount {
  id: string;
  enabled?: boolean;
  status?: string;
  leasedByGameId?: string | null;
  leasedAt?: string | null;
  leaseHeartbeatAt?: string | null;
}

export default async function PoolPage() {
  if (!isInhouseConfigured()) {
    return <Wrap><p className="text-slate-400">Firestore nie jest skonfigurowany.</p></Wrap>;
  }

  const snap = await getDb().collection('botAccounts').get();
  const accounts: BotAccount[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BotAccount, 'id'>) }));

  const now = nowMs();
  const isStale = (a: BotAccount) =>
    Boolean(a.leasedByGameId) && (!a.leaseHeartbeatAt || Date.parse(a.leaseHeartbeatAt) < now - STALE_MS);
  const leased = accounts.filter((a) => a.leasedByGameId).length;

  return (
    <Wrap>
      <p className="text-slate-500 text-sm mb-6">
        {leased} / {accounts.length} kont zajętych. Pula jest wymiarowana dla równoległych{' '}
        <b className="text-slate-300">otwartych lobby</b>, nie meczów — start ją od 6–8.
      </p>

      {accounts.length === 0 ? (
        <p className="text-slate-500 text-sm">Brak kont bota w puli.</p>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => {
            const stale = isStale(a);
            return (
              <div
                key={a.id}
                className={`bg-slate-900/40 border rounded-xl p-4 flex items-center justify-between gap-4 ${
                  stale ? 'border-amber-500/40' : 'border-slate-700'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Server className="w-4 h-4 text-slate-500" /> {a.id}
                    {stale && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded px-1.5 py-0.5">
                        <AlertTriangle className="w-3 h-3" /> lease przeterminowany
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
                    <span>status: {a.status ?? '—'}</span>
                    <span>gra: {a.leasedByGameId ?? '—'}</span>
                    <span>heartbeat: {a.leaseHeartbeatAt ? new Date(a.leaseHeartbeatAt).toLocaleTimeString('pl-PL') : '—'}</span>
                  </div>
                </div>
                {a.leasedByGameId && <ReleaseButton botAccountId={a.id} />}
              </div>
            );
          })}
        </div>
      )}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/admin/inhouse" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Inhouse
      </Link>
      <h1 className="text-2xl font-bold text-white mb-1">Pula kont bota</h1>
      {children}
    </div>
  );
}
