import type { Metadata } from 'next';
import Link from 'next/link';
import { Trophy, ExternalLink, Medal } from 'lucide-react';
import InhouseShell from '@/components/inhouse/InhouseShell';
import SkewButton from '@/components/inhouse/SkewButton';
import LiveBoard from '@/components/inhouse/LiveBoard';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getBoard } from '@/lib/inhouse/live';
import { getLeaderboards } from '@/lib/inhouse/stats';
import { modeName } from '@/lib/inhouse/display';
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
    Znajdź grę w naborze poniżej — sprawdź, ile jest wolnych miejsc.
  </>,
  <>
    Kliknij <b className="text-white">Dołącz</b> — pokażemy Ci nazwę lobby i hasło.
  </>,
  <>
    Wejdź do lobby w Docie i graj — drużyny dobieracie sami.
  </>,
];

export default async function InhousePage() {
  let open: PublicGame[] = [];
  let recent: PublicGame[] = [];
  let topPlayers: Array<{ name: string; value: number }> = [];

  if (isInhouseConfigured()) {
    try {
      const [board, leaderboards] = await Promise.all([getBoard(), getLeaderboards()]);
      open = board.open;
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

      {/* ─── Live board ───────────────────────────────────────────────────── */}
      <section id="obecne-mecze" className="mt-14 scroll-mt-24">
        <LiveBoard initial={open} />
      </section>

      {/* ─── Top players + match history ──────────────────────────────────── */}
      <section className="mt-14 grid gap-12 lg:grid-cols-[minmax(300px,420px)_1fr] items-start">
        <TopPlayers rows={topPlayers} />
        <MatchHistory games={recent} />
      </section>

      {!isInhouseConfigured() && (
        <p className="mt-10 text-sm text-slate-500">
          Integracja z botem lobby jest w trakcie konfiguracji — ten widok odżyje, gdy wszystko będzie
          podłączone.
        </p>
      )}
    </InhouseShell>
  );
}

/* ─── Top players ────────────────────────────────────────────────────────── */

// Bronze, silver, gold in the usual order. Everyone below the podium shares the
// same muted treatment — this is a participation count, not a ladder (§10).
const MEDALS = ['#fbbf24', '#cbd5e1', '#d97706'];

function TopPlayers({ rows }: { rows: Array<{ name: string; value: number }> }) {
  return (
    <div>
      <h2 className="text-[22px] font-black text-white mb-4">Top gracze</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          Rankingi pojawią się, gdy pierwsze gry zostaną rozegrane.
        </p>
      ) : (
        <ol>
          {rows.map((row, i) => (
            <li
              key={`${row.name}-${i}`}
              className="flex items-center gap-3.5 py-3.5 border-b border-white/5"
            >
              <span
                className="shrink-0 w-7 text-center font-black text-base"
                style={{ color: MEDALS[i] ?? '#64748b' }}
              >
                {i + 1}
              </span>
              <h3 className="min-w-0 flex-1 text-[15px] font-bold text-white truncate">
                {row.name}
              </h3>
              <span className="shrink-0 inline-flex items-center gap-1.5 text-[13px] text-slate-400 tabular-nums">
                <Medal className="w-4 h-4" style={{ color: MEDALS[i] ?? '#64748b' }} />
                {row.value} gier
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5">
        <SkewButton href="/inhouse/leaderboards" variant="red" prefetch={false}>
          <Trophy className="w-4 h-4" /> Pełny ranking
        </SkewButton>
      </div>
    </div>
  );
}

/* ─── Match history ──────────────────────────────────────────────────────── */

function MatchHistory({ games }: { games: PublicGame[] }) {
  return (
    <div>
      <h2 className="text-[22px] font-black text-white mb-4">Historia meczów</h2>

      {games.length === 0 ? (
        <p className="text-sm text-slate-500">Jeszcze nic tu nie ma — pierwszy mecz przed nami.</p>
      ) : (
        <div>
          {games.map((g) => (
            <div
              key={g.id}
              className="grid grid-cols-[2.5rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]
                         items-center gap-x-2.5 py-2.5 border-b border-white/5"
            >
              <span className="text-[11px] font-mono text-slate-500">#{g.gameNumber}</span>
              <Link
                href={`/inhouse/${g.id}`}
                className="font-bold text-white text-[13px] truncate hover:text-[#E7000B] transition-colors"
              >
                {g.lobbyName ?? g.initiatorName}
              </Link>
              <span className="text-xs text-slate-400 truncate">
                {modeName(g.settings.gameMode)}
              </span>
              <span
                className={`text-xs font-bold truncate ${
                  g.result ? (g.result.radiantWin ? 'text-emerald-300' : 'text-red-300') : 'text-slate-500'
                }`}
              >
                {g.result ? (g.result.radiantWin ? 'Radiant wygrywa' : 'Dire wygrywa') : '—'}
              </span>
              <DotabuffLink game={g} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Dotabuff link, and only when there is a match ID to point it at.
 *
 * A game can be `finished` with the result ingested but no match ID recorded
 * (a lobby that never launched, an ingestion that ran on the Steam result
 * alone). Linking anyway would send people to a Dotabuff 404, so those rows
 * fall back to our own match page.
 */
function DotabuffLink({ game }: { game: PublicGame }) {
  if (!game.dotaMatchId) {
    return (
      <Link
        href={`/inhouse/${game.id}`}
        className="justify-self-end text-[11px] font-bold text-slate-500 hover:text-white transition-colors"
      >
        Szczegóły
      </Link>
    );
  }
  return (
    <a
      href={`https://www.dotabuff.com/matches/${game.dotaMatchId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="justify-self-end inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white transition-colors"
    >
      Dotabuff
      <ExternalLink className="w-2.5 h-2.5" />
    </a>
  );
}
