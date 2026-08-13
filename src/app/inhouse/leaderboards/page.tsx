import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Gamepad2, CalendarDays, Users, Trophy, ArrowLeft } from 'lucide-react';
import InhouseShell from '@/components/inhouse/InhouseShell';
import MedalBadge from '@/components/inhouse/MedalBadge';
import MedalStrip from '@/components/inhouse/MedalStrip';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import {
  getLeaderboards,
  getPlayerOfWeek,
  getRecentMedalAwards,
  type LeaderRow,
  type Leaderboards,
  type PlayerOfWeek,
  type RecentMedalAward,
} from '@/lib/inhouse/stats';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Klasyfikacja',
  description:
    'Rankingi inhouse oparte na uczestnictwie, nie na wynikach — rozegrane gry, wieczory, otwarte gry, różnorodność. Bez MMR, bez KDA, bez „najlepszego gracza”.',
  alternates: { canonical: '/inhouse/leaderboards' },
};

// Layout follows the designer's mockup (ZMIANY/Leaderboards Redesign.html):
// hero with a Gracz tygodnia panel, a feed of the community's newest medals,
// then a two-column grid — a long primary board on the left, three compact
// ones stacked on the right. The old featured "gamesPublished" board and the
// four stat tiles are gone; this is not a trim, it's the replacement design.

export default async function LeaderboardsPage() {
  if (!isInhouseConfigured()) {
    return (
      <InhouseShell width="wide">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Klasyfikacja</h1>
        <p className="text-slate-400">Integracja z botem lobby jest w trakcie konfiguracji.</p>
      </InhouseShell>
    );
  }

  let boards: Leaderboards | null = null;
  let playerOfWeek: PlayerOfWeek | null = null;
  let recentMedals: RecentMedalAward[] = [];
  try {
    [boards, playerOfWeek, recentMedals] = await Promise.all([
      getLeaderboards(),
      getPlayerOfWeek(),
      getRecentMedalAwards(),
    ]);
  } catch (err) {
    console.error('leaderboards load failed', err);
  }

  return (
    <InhouseShell width="wide">
      {/* Above the h1, where the same link sits on every /admin/inhouse page —
          this is a leaf page reached from the board, and the only way back was
          the browser button or the navbar. */}
      <Link
        href="/inhouse"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Inhouse
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-8">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white">Klasyfikacja</h1>
          <p className="text-slate-400 mt-3 text-lg max-w-2xl leading-relaxed">
            Liczy się to, że grasz — nie jak grasz. Żadnego MMR, KDA ani „najlepszego gracza”.
          </p>
        </div>

        {playerOfWeek && (
          <div className="shrink-0">
            <div className="text-[13px] uppercase tracking-wide text-slate-500 mb-4">Gracz tygodnia</div>
            <div className="flex items-center gap-[22px]">
              <WeekAvatar player={playerOfWeek} />
              <div className="min-w-0">
                <div className="text-[34px] font-black text-white leading-tight truncate">
                  {playerOfWeek.name}
                </div>
                <div className="text-base text-slate-400 mt-1.5">
                  {playerOfWeek.gamesThisWeek} {playerOfWeek.gamesThisWeek === 1 ? 'gra' : 'gier'} w tym tygodniu
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {recentMedals.length > 0 && (
        <div className="mt-12 pb-9 border-b border-white/10">
          {recentMedals.map((award, i) => (
            <div key={`${award.playerName}-${award.medal.id}-${i}`} className="flex items-center gap-4 py-3.5">
              <MedalBadge medal={award.medal} size={44} />
              <p className="text-base text-slate-300">
                <span className="font-black text-white">{award.playerName}</span> otrzymał nową odznakę —{' '}
                <span className="font-black text-[#E7000B]">{award.medal.label}</span>
                {award.medal.description ? ` - ${award.medal.description}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {boards ? (
        <div className="grid gap-12 lg:grid-cols-2 mt-9 mb-20">
          <MainBoard icon={<Gamepad2 className="w-4 h-4" />} title="Najwięcej gier" rows={boards.gamesPlayed} unit="gier" />

          <div className="flex flex-col gap-8">
            <SideBoard icon={<CalendarDays className="w-3.5 h-3.5" />} title="Najwięcej wieczorów" rows={boards.nightsPlayed} unit="wieczorów" />
            <SideBoard icon={<Users className="w-3.5 h-3.5" />} title="Najwięcej różnych kolegów" rows={boards.distinctTeammates} unit="osób" />
            <SideBoard icon={<Trophy className="w-3.5 h-3.5" />} title="Najwięcej bohaterów" rows={boards.heroesPlayed} unit="bohaterów" />
          </div>
        </div>
      ) : (
        <p className="text-slate-500 mt-12">Rankingi pojawią się, gdy zostaną rozegrane pierwsze gry.</p>
      )}
    </InhouseShell>
  );
}

/**
 * The Gracz tygodnia photo.
 *
 * `avatarFull` is Steam's 184px size, for an 88px circle. The 64px
 * `avatarMedium` would be upscaled and visibly soft, and these come straight
 * from Steam's CDN already square, so `unoptimized` skips a transformation that
 * would buy nothing.
 *
 * Falls back through the smaller sizes and then to an initial: a private Steam
 * profile is normal, and a broken image would be worse than no image.
 */
function WeekAvatar({ player }: { player: PlayerOfWeek }) {
  const src =
    player.steam?.avatarFull ?? player.steam?.avatarMedium ?? player.steam?.avatarSmall ?? null;

  if (!src) {
    return (
      <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full border border-[#E7000B]/30 bg-[#E7000B]/10">
        <span className="text-3xl font-black text-[#E7000B]">
          {player.name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={88}
      height={88}
      unoptimized
      className="h-[88px] w-[88px] shrink-0 rounded-full border border-[#E7000B]/30 object-cover"
    />
  );
}

function PlayerLink({ row, className }: { row: LeaderRow; className: string }) {
  if (!row.steamId32) return <span className={className}>{row.name}</span>;
  return (
    <Link href={`/players/${row.steamId32}`} className={`${className} hover:text-white transition-colors`}>
      {row.name}
    </Link>
  );
}

/** The one long list — up to 30 rows, medal badges beside each name. */
function MainBoard({
  icon,
  title,
  rows,
  unit,
}: {
  icon: React.ReactNode;
  title: string;
  rows: LeaderRow[];
  unit: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <span className="text-slate-500">{icon}</span>
        <h2 className="text-[15px] font-bold uppercase tracking-wide text-white">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">Brak danych</p>
      ) : (
        <div>
          {rows.map((r, i) => (
            // `items-center`, matching Top gracze on /inhouse. It was
            // `items-baseline`, which sat the medals on the text baseline — so
            // a 31px badge next to a 19px name hung its whole overhang above
            // the line and looked like it had floated up out of the row.
            <div
              key={r.discordId}
              className="flex min-h-[53px] items-center gap-3.5 border-b border-white/5 py-[11px]"
            >
              <span className={`w-[26px] shrink-0 text-[16px] font-black ${i < 3 ? 'text-[#E7000B]' : 'text-slate-500'}`}>
                {i + 1}
              </span>
              <PlayerLink row={r} className="shrink-0 text-[19px] text-slate-200 whitespace-nowrap" />
              <MedalStrip medals={r.medals} max={6} size={31} className="min-w-0 flex-1" />
              <span className="ml-auto shrink-0 w-[60px] text-right text-[15px] text-slate-500 tabular-nums">
                {r.value}
              </span>
              <span className="sr-only">{unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A compact stacked board — rank, name, count, nothing else. */
function SideBoard({
  icon,
  title,
  rows,
  unit,
}: {
  icon: React.ReactNode;
  title: string;
  rows: LeaderRow[];
  unit: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3.5">
        <span className="text-slate-500">{icon}</span>
        <h2 className="text-xs font-bold uppercase tracking-wide text-white">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">Brak danych</p>
      ) : (
        <div>
          {rows.map((r, i) => (
            <div key={r.discordId} className="flex items-baseline gap-2.5 py-1">
              <span className={`w-[18px] shrink-0 text-xs font-black ${i < 3 ? 'text-[#E7000B]' : 'text-slate-500'}`}>
                {i + 1}
              </span>
              <PlayerLink row={r} className="min-w-0 flex-1 truncate text-sm text-slate-200" />
              <span className="shrink-0 text-xs text-slate-500 tabular-nums">{r.value}</span>
              <span className="sr-only">{unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
