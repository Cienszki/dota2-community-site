import type { Metadata } from 'next';
import Link from 'next/link';
import { Megaphone, Gamepad2, CalendarDays, Users, Sparkles, Trophy } from 'lucide-react';
import InhouseShell from '@/components/inhouse/InhouseShell';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getLeaderboards, getCommunityStats, type LeaderRow, type Leaderboards } from '@/lib/inhouse/stats';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Rankingi społeczności',
  description:
    'Rankingi inhouse oparte na uczestnictwie, nie na wynikach — rozegrane gry, wieczory, otwarte gry, różnorodność. Bez MMR, bez KDA, bez „najlepszego gracza”.',
  alternates: { canonical: '/inhouse/leaderboards' },
};

export default async function LeaderboardsPage() {
  if (!isInhouseConfigured()) {
    return (
      <InhouseShell width="wide">
        <h1 className="text-4xl font-black uppercase tracking-tight mb-4">Rankingi</h1>
        <p className="text-slate-400">Integracja z botem lobby jest w trakcie konfiguracji.</p>
      </InhouseShell>
    );
  }

  let boards: Leaderboards | null = null;
  let stats: Awaited<ReturnType<typeof getCommunityStats>> | null = null;
  try {
    [boards, stats] = await Promise.all([getLeaderboards(), getCommunityStats()]);
  } catch (err) {
    console.error('leaderboards load failed', err);
  }

  return (
    <InhouseShell width="wide">
      <div className="mb-8">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">Rankingi społeczności</h1>
        <p className="text-slate-400 mt-2 text-lg max-w-2xl">
          Liczy się to, że grasz — nie jak grasz. Żadnego MMR, KDA ani „najlepszego gracza”.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          <StatCard icon={<Gamepad2 className="w-4 h-4" />} value={stats.totalGames} label="rozegranych gier łącznie" />
          <StatCard icon={<CalendarDays className="w-4 h-4" />} value={stats.gamesThisMonth} label="gier w tym miesiącu" />
          <StatCard icon={<Users className="w-4 h-4" />} value={stats.activePlayers7d} label="aktywnych graczy (7 dni)" />
          <StatCard icon={<Sparkles className="w-4 h-4" />} value={stats.distinctInitiatorsThisWeek} label="hostów w tym tygodniu" />
        </div>
      )}

      {boards ? (
        <div className="space-y-8">
          {/* Featured: gamesPublished — the generous act (§8.2) */}
          <Board
            featured
            icon={<Megaphone className="w-5 h-5" />}
            title="Najbardziej otwierają serwer"
            subtitle="Ci, którzy wpuszczają społeczność do gry"
            rows={boards.gamesPublished}
            unit="gier"
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <Board icon={<Gamepad2 className="w-5 h-5" />} title="Najwięcej gier" rows={boards.gamesPlayed} unit="gier" />
            <Board icon={<CalendarDays className="w-5 h-5" />} title="Najwięcej wieczorów" rows={boards.nightsPlayed} unit="wieczorów" />
            <Board icon={<Users className="w-5 h-5" />} title="Najwięcej różnych kolegów" rows={boards.distinctTeammates} unit="osób" />
            <Board icon={<Trophy className="w-5 h-5" />} title="Najwięcej bohaterów" rows={boards.heroesPlayed} unit="bohaterów" />
          </div>
        </div>
      ) : (
        <p className="text-slate-500">Rankingi pojawią się, gdy zostaną rozegrane pierwsze gry.</p>
      )}
    </InhouseShell>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="bg-zinc-900/40 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
      <div className="text-[#E7000B] mb-1">{icon}</div>
      <div className="text-3xl font-black text-white tabular-nums">{value.toLocaleString('pl-PL')}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function Board({
  icon,
  title,
  subtitle,
  rows,
  unit,
  featured = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  rows: LeaderRow[];
  unit: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-6 backdrop-blur-md border ${
        featured ? 'bg-[#E7000B]/[0.07] border-[#E7000B]/30' : 'bg-zinc-900/40 border-white/10'
      }`}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span className={featured ? 'text-[#E7000B]' : 'text-slate-400'}>{icon}</span>
        <div>
          <h2 className="font-bold text-white leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-slate-600 text-sm">Brak danych</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.discordId} className="flex items-center gap-3 py-1.5">
              <span className={`w-6 text-center font-black tabular-nums ${i < 3 ? 'text-[#E7000B]' : 'text-slate-600'}`}>
                {i + 1}
              </span>
              {r.steamId32 ? (
                <Link href={`/players/${r.steamId32}`} className="flex-1 text-slate-200 hover:text-white truncate transition-colors">
                  {r.name}
                </Link>
              ) : (
                <span className="flex-1 text-slate-200 truncate">{r.name}</span>
              )}
              <span className="text-sm text-slate-400 tabular-nums">
                {r.value} <span className="text-slate-600">{unit}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
