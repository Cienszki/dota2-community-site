'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Trophy, ExternalLink, ChevronDown } from 'lucide-react';
import type { PublicGame } from '@/lib/inhouse/public';
import { modeName } from '@/lib/inhouse/display';
import type { Medal as MedalAward } from '@/lib/inhouse/medals';
import MedalStrip from './MedalStrip';
import GameCard from './GameCard';
import OpenLobbyCard from './OpenLobbyCard';
import OpenLobbyButton from './OpenLobbyButton';
import SkewButton from './SkewButton';

// The board and the match history are one list, split in two places.
//
// Cards and history used to be independent queries, which meant the newest
// three games could appear in both, or fall between them, depending on how the
// two listings happened to be sliced. They are now one feed ordered newest
// first: the first three become cards, and history picks up at the fourth and
// carries on. That is also why this component owns both — they cannot be
// sliced consistently from two different places while one of them is live.

const CARD_SLOTS = 3;

/** The league every inhouse is played under — see the League ID in /admin/inhouse. */
const DOTABUFF_LEAGUE_URL = 'https://www.dotabuff.com/esports/leagues/20119';
const RECRUITING = ['open', 'ready'];
// Matches the Top gracze row count, so the two columns' rows line up.
const HISTORY_INITIAL = 5;
const HISTORY_STEP = 8;

/** Highest game number first. Game numbers are allocated from a counter, so
 *  this is a true creation order across every state — which `createdAt` vs
 *  `endedAt` sorting could not give us once the two lists merged. */
function newestFirst(a: PublicGame, b: PublicGame): number {
  return b.gameNumber - a.gameNumber;
}

export default function InhouseBoard({
  initialLive,
  initialRecent,
  topPlayers,
  maxOpenLobbies,
}: {
  initialLive: PublicGame[];
  initialRecent: PublicGame[];
  topPlayers: Array<{ name: string; value: number; medals: MedalAward[] }>;
  maxOpenLobbies: number;
}) {
  const [live, setLive] = useState<PublicGame[]>(initialLive);
  const [recent, setRecent] = useState<PublicGame[]>(initialRecent);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (poll) return;
      const tick = async () => {
        try {
          const res = await fetch('/api/inhouse/board', { cache: 'no-store' });
          if (!res.ok) return;
          const data = (await res.json()) as { live?: PublicGame[]; recent?: PublicGame[] };
          if (cancelled) return;
          setLive(data.live ?? []);
          if (data.recent) setRecent(data.recent);
        } catch {
          /* keep trying on the next tick */
        }
      };
      void tick();
      poll = setInterval(tick, 5000);
    };

    try {
      es = new EventSource('/api/inhouse/live');
      es.onmessage = (e) => {
        try {
          // Same { live, recent } shape as the polling response — the SSE feed
          // now carries a finished match into history the moment it lands,
          // instead of leaving it to the next poll or navigation.
          const data = JSON.parse(e.data) as { live?: PublicGame[]; recent?: PublicGame[] };
          if (!cancelled) {
            setLive(data.live ?? []);
            if (data.recent) setRecent(data.recent);
          }
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      cancelled = true;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, []);

  const { cards, history, openCount } = useMemo(() => {
    const seen = new Set(live.map((g) => g.id));
    const feed = [...live, ...recent.filter((g) => !seen.has(g.id))].sort(newestFirst);
    const open = live.filter((g) => RECRUITING.includes(g.state)).length;

    // With nothing to join, the first card slot becomes the invitation to open
    // one. It replaces a card rather than sitting above the grid so the row
    // keeps its shape on the ~90% of visits where nobody is recruiting.
    const take = open === 0 ? CARD_SLOTS - 1 : CARD_SLOTS;
    return { cards: feed.slice(0, take), history: feed.slice(take), openCount: open };
  }, [live, recent]);

  const atCapacity = openCount >= maxOpenLobbies;

  return (
    <>
      <section id="obecne-mecze" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-3 h-[35px] mb-4">
          <OpenLobbyLink atCapacity={atCapacity} max={maxOpenLobbies} />
          {/* A plain anchor, not a Link: this is a same-page jump, and the
              smooth scroll comes from `scroll-behavior` already set globally.
              FaqSection defaults to collapsed, so this also tells it to open —
              see the matching listener there. */}
          <a
            href="#faq"
            onClick={() => window.dispatchEvent(new Event('inhouse:open-faq'))}
            className="inline-flex h-[35px] items-center gap-2 border-[1.5px] border-[#E7000B] px-5
                       text-sm font-extrabold uppercase tracking-wide text-white
                       -skew-x-[12deg] transition-colors hover:bg-[#E7000B]/15"
          >
            <span className="flex skew-x-[12deg] items-center gap-2">
              FAQ
              <ChevronDown className="h-4 w-4" />
            </span>
          </a>
        </div>

        <div className="flex flex-wrap gap-4">
          {openCount === 0 && <OpenLobbyCard />}
          {cards.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-12 lg:grid-cols-[minmax(300px,420px)_1fr] items-stretch">
        <TopPlayers rows={topPlayers} />
        <MatchHistory games={history} />
      </section>
    </>
  );
}

/**
 * The header's route to hosting, or the reason there isn't one.
 *
 * At capacity it stops offering the action and explains why instead, next to
 * the lobbies that are the actual answer. Below capacity it opens a lobby in
 * place — the server action re-checks the cap regardless, so this is only
 * about not offering something that would be refused.
 */
function OpenLobbyLink({ atCapacity, max }: { atCapacity: boolean; max: number }) {
  const [notice, setNotice] = useState(false);

  if (!atCapacity) return <OpenLobbyButton variant="header" />;

  return (
    <div className="relative">
      <button
        onClick={() => setNotice((v) => !v)}
        className="inline-flex items-center gap-2 h-[35px] px-5 font-extrabold text-sm uppercase
                   tracking-wide text-slate-500 border-[1.5px] border-white/15 hover:text-slate-300
                   -skew-x-[12deg] transition-colors"
      >
        <span className="flex items-center gap-2 skew-x-[12deg]">Nowa gra</span>
      </button>
      {notice && (
        <p
          role="status"
          className="absolute left-0 top-full mt-2 w-64 z-20 rounded-xl border border-amber-400/30
                     bg-zinc-900 px-3.5 py-2.5 text-xs leading-relaxed text-amber-100 shadow-xl"
        >
          Otwarte są już {max} lobby — to wystarczy. Dołącz do jednego z nich zamiast otwierać
          trzecie, inaczej żadne się nie zapełni.
        </p>
      )}
    </div>
  );
}

/* ─── Top players ────────────────────────────────────────────────────────── */

// Gold, silver, bronze. Everyone below the podium shares the same muted
// treatment — this is a participation count, not a ladder (§10).
const MEDALS = ['#fbbf24', '#cbd5e1', '#d97706'];

function TopPlayers({ rows }: { rows: Array<{ name: string; value: number; medals: MedalAward[] }> }) {
  return (
    <div className="flex h-full flex-col">
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
              className="flex min-h-[63px] items-center gap-3.5 py-3.5 border-b border-white/5"
            >
              <span
                className="shrink-0 w-7 text-center font-black text-base"
                style={{ color: MEDALS[i] ?? '#64748b' }}
              >
                {i + 1}
              </span>
              <h3 className="min-w-0 flex-1 text-[15px] font-bold text-white truncate">{row.name}</h3>
              {/* Capped at four: past that the row stops being a name with
                  awards and becomes a wall of circles. The rest are counted by
                  the strip's "+N" chip rather than dropped. */}
              <MedalStrip medals={row.medals} max={4} size={35} className="shrink-0 gap-1.5" />
              <span className="shrink-0 text-[13px] text-slate-400 tabular-nums">
                {row.value} gier
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-auto pt-5">
        <SkewButton href="/inhouse/leaderboards" variant="red" prefetch={false}>
          <Trophy className="w-4 h-4" /> Klasyfikacja
        </SkewButton>
      </div>
    </div>
  );
}

/* ─── Match history ──────────────────────────────────────────────────────── */

function MatchHistory({ games }: { games: PublicGame[] }) {
  const [shown, setShown] = useState(HISTORY_INITIAL);
  const visible = games.slice(0, shown);
  const hasMore = shown < games.length;

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-[22px] font-black text-white mb-4">Historia meczów</h2>

      {games.length === 0 ? (
        <p className="text-sm text-slate-500">Jeszcze nic tu nie ma — pierwszy mecz przed nami.</p>
      ) : (
        <>
          <div>
            {visible.map((g) => (
              <div
                key={g.id}
                className="grid min-h-[63px] grid-cols-[2.5rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]
                           items-center gap-x-2.5 py-3.5 border-b border-white/5"
              >
                <span className="text-[11px] font-mono text-slate-500">#{g.gameNumber}</span>
                <Link
                  href={`/inhouse/${g.id}`}
                  className="font-bold text-white text-[15px] truncate hover:text-[#E7000B] transition-colors"
                >
                  {g.lobbyName ?? g.initiatorName}
                </Link>
                <span className="text-[13px] text-slate-400 truncate">{modeName(g.settings.gameMode)}</span>
                <span
                  className={`text-[13px] font-bold truncate ${
                    g.result
                      ? g.result.radiantWin
                        ? 'text-emerald-300'
                        : 'text-red-300'
                      : 'text-slate-500'
                  }`}
                >
                  {g.result ? (g.result.radiantWin ? 'Radiant wygrywa' : 'Dire wygrywa') : 'w toku'}
                </span>
                <HistoryLink game={g} />
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => setShown((s) => s + HISTORY_STEP)}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-white transition-colors"
            >
              Pokaż więcej meczów
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </>
      )}

      {/* Mirrors "Klasyfikacja" in the other column. Points at Dotabuff's own
          league page rather than a page of ours: it already lists every match
          ever played under league 20119, with nothing for us to maintain. */}
      <div className="mt-auto pt-5">
        <SkewButton href={DOTABUFF_LEAGUE_URL} variant="red" prefetch={false} external>
          <ExternalLink className="w-4 h-4" /> Pełna historia
        </SkewButton>
      </div>
    </div>
  );
}

/**
 * Dotabuff when there is a match ID to point at, our own page otherwise.
 *
 * A game can be finished with the result ingested but no match ID recorded, and
 * linking anyway sends people to a Dotabuff 404.
 */
function HistoryLink({ game }: { game: PublicGame }) {
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
