import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalendarClock, Medal, Megaphone, Handshake } from 'lucide-react';
import InhouseShell from '@/components/inhouse/InhouseShell';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore } from '@/lib/inhouse/store';
import { mostPlayedWeekday } from '@/lib/inhouse/stats';

export const dynamic = 'force-dynamic';

type Params = Promise<{ steamId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { steamId } = await params;
  return {
    title: `Profil gracza`,
    description: `Statystyki inhouse gracza ${steamId} — uczestnictwo, nie wyniki.`,
    robots: { index: false, follow: true },
  };
}

export default async function PlayerPage({ params }: { params: Params }) {
  const { steamId } = await params;
  if (!/^\d+$/.test(steamId)) notFound();

  if (!isInhouseConfigured()) {
    return (
      <InhouseShell width="default">
        <p className="text-slate-400">Integracja z botem lobby jest w trakcie konfiguracji.</p>
      </InhouseShell>
    );
  }

  const store = getInhouseStore();
  const stats = await store.getStatsForSteamId(steamId);

  // A Steam ID nobody has ever played on has no profile.
  if (stats.gamesPlayed === 0 && !stats.linked) notFound();

  // Aggregate attendance across all their accounts for the weekday breakdown.
  const histories = await Promise.all(stats.steamIds.map((id) => store.listAttendanceForSteamId(id)));
  const weekday = mostPlayedWeekday(histories.flat().map((r) => r.playedOn));

  // gamesPublished / distinctTeammates live on the linked player record only.
  let gamesPublished = 0;
  let distinctTeammates = 0;
  if (stats.linked && stats.discordId) {
    const player = await store.getPlayer(stats.discordId);
    gamesPublished = player?.gamesPublished ?? 0;
    distinctTeammates = player?.distinctTeammates ?? 0;
  }

  const name = stats.displayName ?? `Gracz ${steamId}`;
  const joined = stats.firstPlayedOn
    ? new Date(`${stats.firstPlayedOn}T12:00:00Z`).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
    : null;

  const badges: { icon: React.ReactNode; label: string }[] = [];
  const gamesBadge = [200, 100, 50, 25, 10].find((t) => stats.gamesPlayed >= t);
  if (gamesBadge) badges.push({ icon: <Medal className="w-4 h-4" />, label: `${gamesBadge} gier` });
  const pubBadge = [50, 25, 10, 5].find((t) => gamesPublished >= t);
  if (pubBadge) badges.push({ icon: <Megaphone className="w-4 h-4" />, label: `Otworzył ${pubBadge} gier` });
  const mateBadge = [200, 100, 50, 25].find((t) => distinctTeammates >= t);
  if (mateBadge) badges.push({ icon: <Handshake className="w-4 h-4" />, label: `Grał z ${mateBadge} osobami` });

  return (
    <InhouseShell width="default">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-8 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight">{name}</h1>
          {joined && <p className="text-slate-500 mt-1">gra od {joined}</p>}
        </div>
        {!stats.linked && (
          <span className="text-xs text-slate-500 border border-white/10 rounded px-2.5 py-1">
            konto niepołączone
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat value={stats.gamesPlayed} label="rozegranych gier" />
        <Stat value={stats.nightsPlayed} label="wieczorów gry" />
        <Stat value={stats.heroesPlayed} label="bohaterów" />
        {stats.linked && <Stat value={distinctTeammates} label="różnych kolegów" />}
        {stats.linked && <Stat value={gamesPublished} label="otwartych gier" />}
        {weekday && (
          <div className="bg-zinc-900/40 border border-white/10 rounded-xl px-4 py-5">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] uppercase tracking-wide mb-1">
              <CalendarClock className="w-3.5 h-3.5" /> ulubiony dzień
            </div>
            <div className="text-xl font-bold text-white capitalize">{weekday}</div>
          </div>
        )}
      </div>

      {badges.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {badges.map((b, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 bg-[#E7000B]/10 border border-[#E7000B]/25 text-slate-200 rounded-lg px-3 py-2 text-sm font-semibold"
            >
              <span className="text-[#E7000B]">{b.icon}</span>
              {b.label}
            </span>
          ))}
        </div>
      )}
    </InhouseShell>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-zinc-900/40 border border-white/10 rounded-xl px-4 py-5 text-center">
      <div className="text-4xl font-black text-white tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">{label}</div>
    </div>
  );
}
