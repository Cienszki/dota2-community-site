import Link from 'next/link';
import { ArrowLeft, TrendingUp, Megaphone, Users, XCircle } from 'lucide-react';
import { isInhouseConfigured, getDb } from '@/lib/firebase-admin';
import type { InhouseGame } from '@/lib/inhouse/core/types';

export const dynamic = 'force-dynamic';

const TERMINAL_UNPLAYED = ['cancelled', 'expired', 'failed', 'abandoned'];

// Request-time window bounds. Extracted so the react-compiler lint doesn't flag
// an intentional impure read inside a dynamic server component.
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export default async function MetricsPage() {
  if (!isInhouseConfigured()) {
    return <Wrap><p className="text-slate-400">Firestore nie jest skonfigurowany.</p></Wrap>;
  }

  const iso30 = isoDaysAgo(30);
  const iso7 = isoDaysAgo(7);

  const snap = await getDb().collection('inhouseGames').where('createdAt', '>=', iso30).get();
  const games = snap.docs.map((d) => d.data() as InhouseGame);

  const created = games.length;
  const published = games.filter((g) => g.published).length;
  const finished = games.filter((g) => g.state === 'finished').length;
  const failed = games.filter((g) => TERMINAL_UNPLAYED.includes(g.state)).length;
  const publishRate = created ? Math.round((published / created) * 100) : 0;
  const fillFailRate = created ? Math.round((failed / created) * 100) : 0;

  const weekGames = games.filter((g) => g.createdAt >= iso7);
  const distinctInitiators = new Set(weekGames.map((g) => g.initiatorDiscordId).filter(Boolean)).size;

  return (
    <Wrap>
      <p className="text-slate-500 text-sm mb-6">Ostatnie 30 dni.</p>

      {/* The two numbers that matter (§9.8) */}
      <div className="grid gap-4 sm:grid-cols-2 mb-6">
        <Big
          icon={<Users className="w-5 h-5" />}
          value={String(distinctInitiators)}
          label="Różnych hostów w tym tygodniu"
          hint="Jeśli gier przybywa, ale hostuje te same 5 osób — projekt zawodzi w swoim celu, wyglądając zdrowo."
        />
        <Big
          icon={<Megaphone className="w-5 h-5" />}
          value={`${publishRate}%`}
          label="Publish rate (opublikowane ÷ utworzone)"
          hint="Cały silnik wzrostu w jednej liczbie. Jeśli niski — napraw zachęty, zanim dodasz funkcje."
        />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Small icon={<TrendingUp className="w-4 h-4" />} value={created} label="utworzonych" />
        <Small icon={<Megaphone className="w-4 h-4" />} value={published} label="opublikowanych" />
        <Small icon={<TrendingUp className="w-4 h-4" />} value={finished} label="rozegranych" />
        <Small icon={<XCircle className="w-4 h-4" />} value={`${fillFailRate}%`} label="nierozegranych" />
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/admin/inhouse" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Inhouse
      </Link>
      <h1 className="text-2xl font-bold text-white mb-1">Metryki</h1>
      {children}
    </div>
  );
}

function Big({ icon, value, label, hint }: { icon: React.ReactNode; value: string; label: string; hint: string }) {
  return (
    <div className="bg-slate-900/40 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-red-400 mb-2">{icon}</div>
      <div className="text-4xl font-black text-white tabular-nums">{value}</div>
      <div className="text-sm font-semibold text-slate-300 mt-1">{label}</div>
      <p className="text-xs text-slate-500 mt-2 leading-relaxed">{hint}</p>
    </div>
  );
}

function Small({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
      <div className="text-slate-500 mb-1">{icon}</div>
      <div className="text-2xl font-black text-white tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
