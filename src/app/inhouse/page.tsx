import type { Metadata } from 'next';
import Link from 'next/link';
import { Gamepad2, Plus, Trophy, Users } from 'lucide-react';
import InhouseShell from '@/components/inhouse/InhouseShell';
import SkewButton from '@/components/inhouse/SkewButton';
import JoinButton from '@/components/inhouse/JoinButton';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getBoard } from '@/lib/inhouse/live';
import { getLeaderboards } from '@/lib/inhouse/stats';
import { modeName, regionName } from '@/lib/inhouse/display';
import type { PublicGame } from '@/lib/inhouse/public';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Inhouse 5v5',
  description:
    'To prosty sposób na wspólną grę 5v5. Widzisz, czy ktoś gra teraz, kto prowadzi ranking i możesz otworzyć własne lobby w jednym kliknięciu.',
  alternates: { canonical: '/inhouse' },
};

export default async function InhousePage() {
  let open: PublicGame[] = [];
  let topPublishers: Array<{ name: string; value: number }> = [];

  if (isInhouseConfigured()) {
    try {
      const [board, leaderboards] = await Promise.all([getBoard(), getLeaderboards()]);
      open = board.open;
      topPublishers = leaderboards.gamesPublished.slice(0, 3).map((row) => ({
        name: row.name,
        value: row.value,
      }));
    } catch (err) {
      console.error('inhouse landing data load failed', err);
    }
  }

  const liveGame = open[0] ?? null;
  const slots = liveGame?.slots;
  const committed = slots?.committed ?? 0;
  const slotsOpen = slots?.slotsOpen ?? Math.max(0, 10 - committed);

  return (
    <InhouseShell width="default">
      <div className="mb-10 max-w-3xl">
        <h1 className="text-5xl md:text-6xl font-black tracking-tighter uppercase leading-[0.95]">
          Inhouse <span className="text-[#E7000B]">5v5</span>
        </h1>
        <p className="text-slate-300 text-xl mt-4 leading-relaxed max-w-2xl">
          To szybki sposób na wspólną grę bez komplikacji. Jeśli ktoś otworzył lobby, widzisz to
          od razu. Chcesz zagrać? Wchodzisz do gry. Chcesz hostować? Otwierasz nowe lobby jednym kliknięciem.
        </p>
        <div className="flex flex-wrap items-center gap-4 mt-7">
          <SkewButton href="/inhouse/new" variant="redSolid" prefetch={false}>
            <Plus className="w-4 h-4" /> Otwórz nowe lobby
          </SkewButton>
          <Link
            href="/inhouse/leaderboards"
            className="inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors font-semibold"
          >
            <Trophy className="w-4 h-4" /> Zobacz ranking
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] items-start">
        <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#E7000B]">Teraz gra</p>
              <h2 className="text-2xl font-black text-white mt-1">Czy ktoś jest na serwerze?</h2>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-wide text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-300" /> live
            </span>
          </div>

          {liveGame ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase tracking-[0.2em]">Lobby #{liveGame.gameNumber}</p>
                    <h3 className="text-xl font-bold text-white mt-1">{liveGame.initiatorName}</h3>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-300">
                    {liveGame.newcomerFriendly ? 'dla nowych' : 'open'}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Stat label="Tryb" value={modeName(liveGame.settings.gameMode)} />
                  <Stat label="Region" value={regionName(liveGame.settings.serverRegion)} />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-500" />
                    {slotsOpen} wolnych miejsc
                  </span>
                  <Link href={`/inhouse/${liveGame.id}`} className="text-white hover:text-[#E7000B] transition-colors">
                    Zobacz lobby →
                  </Link>
                </div>
              </div>

              <JoinButton gameId={liveGame.id} full={slotsOpen <= 0} />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-slate-300">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">Teraz nikt nie gra</h3>
              <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">
                Otwórz własne lobby i zacznij pierwszą grę. Reszta pójdzie naturalnie.
              </p>
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-md">
          <div className="flex items-center gap-2 text-[#E7000B] mb-4">
            <Trophy className="w-4 h-4" />
            <h2 className="text-lg font-bold text-white">Top ranking</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Najbardziej pomagają innym otwierać lobby i wpuścić społeczność do gry.
          </p>

          {topPublishers.length > 0 ? (
            <ol className="space-y-3">
              {topPublishers.map((row, index) => (
                <li key={`${row.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                  <span className="text-sm text-slate-300">
                    <span className="mr-2 font-black text-[#E7000B]">#{index + 1}</span>
                    {row.name}
                  </span>
                  <span className="text-sm text-slate-400 tabular-nums">{row.value} gier</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">Rankingi pojawią się, gdy pierwsze gry zaczną się rozgrywać.</p>
          )}
        </aside>
      </div>

      {!isInhouseConfigured() && (
        <p className="mt-10 text-sm text-slate-500">
          Integracja z botem lobby jest w trakcie konfiguracji — ten widok odżyje, gdy wszystko będzie podłączone.
        </p>
      )}
    </InhouseShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
