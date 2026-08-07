import type { Metadata } from 'next';
import InhouseShell from '@/components/inhouse/InhouseShell';
import InhouseBoard from '@/components/inhouse/InhouseBoard';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getBoard, MAX_OPEN_LOBBIES } from '@/lib/inhouse/live';
import { getLeaderboards } from '@/lib/inhouse/stats';
import type { PublicGame } from '@/lib/inhouse/public';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Inhouse 5v5',
  description:
    'Prawdziwi ludzie, prawie każdego wieczoru. Zobacz, które lobby właśnie się zapełnia, dołącz jednym kliknięciem i sprawdź historię rozegranych meczów.',
  alternates: { canonical: '/inhouse' },
};

const STEPS = [
  <>
    Kliknij &quot;Dołącz&quot; poniżej, pokażemy ci jak wejść do lobby w Docie - to bardzo proste.
  </>,
  <>
    Gdy zbierze się 10 graczy, Gra wystartuje.
  </>,
  <>
    Składy wybieracie już w grze. Powodzenia!
  </>,
];

export default async function InhousePage() {
  let live: PublicGame[] = [];
  let recent: PublicGame[] = [];
  let topPlayers: Array<{ name: string; value: number }> = [];

  if (isInhouseConfigured()) {
    try {
      const [board, leaderboards] = await Promise.all([getBoard(), getLeaderboards()]);
      live = board.live;
      recent = board.recent;
      topPlayers = leaderboards.gamesPlayed.slice(0, 5).map((row) => ({
        name: row.name,
        value: row.value,
      }));
    } catch (err) {
      console.error('inhouse landing data load failed', err);
    }
  }

  return (
    <InhouseShell width="wide">
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl">
        <h1 className="text-5xl md:text-6xl font-black tracking-tighter uppercase leading-[0.95]">
          Inhouse <span className="text-[#E7000B]">5v5</span>
        </h1>
        <p className="text-slate-300 text-xl mt-4 leading-relaxed">
          Prawdziwi ludzie, prawie każdego wieczoru. Nie liga. Bez tryhardów.
        </p>
      </section>

      {/* ─── How to join ──────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-5">
          Jak dołączyć
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={i} className="flex gap-3.5">
              <span
                className="shrink-0 w-8 h-8 rounded-full bg-[#E7000B]/15 border border-[#E7000B]/40
                           text-[#f87171] font-black text-[15px] flex items-center justify-center"
              >
                {i + 1}
              </span>
              <p className="text-[15px] text-slate-200 leading-relaxed">{step}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Board and history are one feed sliced in two, so they live together. */}
      <InhouseBoard
        initialLive={live}
        initialRecent={recent}
        topPlayers={topPlayers}
        maxOpenLobbies={MAX_OPEN_LOBBIES}
      />

      {!isInhouseConfigured() && (
        <p className="mt-10 text-sm text-slate-500">
          Integracja z botem lobby jest w trakcie konfiguracji — ten widok odżyje, gdy wszystko będzie
          podłączone.
        </p>
      )}
    </InhouseShell>
  );
}
