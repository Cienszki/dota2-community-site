import { Fragment } from 'react';
import Link from 'next/link';
import { Trophy, MapPin, ExternalLink } from 'lucide-react';
import type { PublicGame } from '@/lib/inhouse/public';
import { modeName, regionNameEn } from '@/lib/inhouse/display';
import JoinDialog from './JoinDialog';
import BorderGlow from '@/components/ui/BorderGlow';

// Layout follows the v5 mockup (ZMIANY/Inhouse Redesign v5 (standalone).html):
// badge moves under the title instead of beside it, the committed ring floats
// as a corner overlay instead of sitting in the header row, the roster is one
// wrapped, height-capped line instead of rows of five, and the state-specific
// footer keeps only the actionable link/button — the count and state are
// already carried by the badge, so a second line saying the same thing goes.

// Same mouse-reactive glow border as every other card on the site (Streamy,
// testimonials, tournaments, Wesprzyj nas) — see BorderGlow.tsx. The arena
// background (mecz_bg.png) rides along as the card's `background`, not a
// separate layer, so the glow border still paints above it correctly.
const BORDER_GLOW_PROPS = {
  colors: ['#ff0000', '#fff700', '#ff0000'],
  backgroundColor: '#050505',
  background:
    "linear-gradient(rgba(24,24,27,0.55),rgba(24,24,27,0.55)) center/cover no-repeat, url('/images/mecz_bg.png') center/cover no-repeat",
  borderRadius: 16,
  edgeSensitivity: 30,
  glowRadius: 40,
  glowIntensity: 1.2,
};

// A single lobby card on the live board (designer redesign). Pure — no hooks —
// so it renders on the server for any static list and inside the client
// LiveBoard alike.

const RING_SEGMENTS = 10;
const RING_SEG_DEG = 360 / RING_SEGMENTS; // 36°
const RING_GAP_DEG = 5;

const SEATED = '#E7000B'; // in the lobby right now
const HELD = '#fbbf24'; // slot reserved, player hasn't walked in yet
const EMPTY = 'rgba(255,255,255,0.1)';

/**
 * Conic-gradient donut, one arc per slot.
 *
 * Two colours, because "9/10" means two different things depending on how it
 * is made up: red is someone standing in the lobby, amber is a slot being held
 * for someone who pressed Join and hasn't arrived. A held slot can still lapse,
 * so a card that painted both the same would promise a game that is readier
 * than it is. The bot decides which is which — the website only renders the
 * split it is given.
 */
function ringGradient(seated: number, held: number): string {
  const stops: string[] = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const start = i * RING_SEG_DEG;
    const end = start + RING_SEG_DEG - RING_GAP_DEG;
    const color = i < seated ? SEATED : i < seated + held ? HELD : EMPTY;
    stops.push(`${color} ${start}deg ${end}deg`, `transparent ${end}deg ${start + RING_SEG_DEG}deg`);
  }
  return `conic-gradient(from 0deg, ${stops.join(', ')})`;
}

/**
 * Split `committed` into people present and slots merely held.
 *
 * `committed` is the number the card shows, and it counts both (§4.4). The
 * seated count is preferred from `inLobby` and only derived by subtraction as a
 * fallback, so a snapshot where the two disagree still renders something
 * coherent rather than an over-long ring.
 */
function slotSplit(slots: PublicGame['slots'], committed: number): { seated: number; held: number } {
  const held = Math.min(slots?.reserved?.length ?? 0, committed);
  const seated = Math.min(slots?.inLobby?.length ?? committed - held, committed - held);
  return { seated: Math.max(0, seated), held };
}

interface BadgeStyle {
  label: string;
  color: string;
  bg: string;
  border: string;
}

function stateBadge(state: PublicGame['state']): BadgeStyle {
  if (state === 'lobby_creating') {
    return { label: 'tworzenie', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)' };
  }
  if (state === 'in_progress') {
    return { label: 'na żywo', color: '#f87171', bg: 'rgba(231,0,11,0.1)', border: 'rgba(231,0,11,0.3)' };
  }
  if (state === 'finished') {
    return { label: 'zakończone', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)' };
  }
  return { label: 'otwarte', color: '#6ee7b7', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)' };
}

const NEWCOMER_BADGE: BadgeStyle = {
  label: 'dla nowych',
  color: '#6ee7b7',
  bg: 'rgba(16,185,129,0.1)',
  border: 'rgba(16,185,129,0.25)',
};

export default function GameCard({ game }: { game: PublicGame }) {
  const recruiting = game.state === 'open' || game.state === 'ready';
  const inProgress = game.state === 'in_progress';
  const finished = game.state === 'finished';
  // The couple of seconds between someone pressing "open lobby" and the worker
  // reporting the Dota lobby exists. On the board so the press has a visible
  // effect immediately; it can't be joined yet, so there's no button.
  const creating = game.state === 'lobby_creating';

  const committed = game.slots?.committed ?? 0;
  const slotsOpen = game.slots?.slotsOpen ?? Math.max(0, 10 - committed);
  const showRing = recruiting || inProgress;
  const { seated, held } = slotSplit(game.slots, committed);

  const badge = stateBadge(game.state);
  // The ring already shows the split visually; recruiting is the one state
  // where the plain X/10 count is worth spelling out too, in the badge that
  // otherwise would say nothing more than "open".
  const badgeLabel = recruiting ? `${badge.label} ${committed}/10` : badge.label;

  return (
    <BorderGlow className="w-[400px] h-[200px] shrink-0" {...BORDER_GLOW_PROPS}>
      <div className="relative p-5">
      {showRing && (
        <div
          className="absolute top-3 right-3 shrink-0"
          style={{ width: 100, height: 100 }}
          title={held > 0 ? `${seated} w lobby, ${held} zarezerwowanych` : `${seated} w lobby`}
        >
          <div
            className="w-full h-full rounded-full"
            style={{
              background: ringGradient(seated, held),
              WebkitMask: 'radial-gradient(closest-side, transparent 64%, #000 65%)',
              mask: 'radial-gradient(closest-side, transparent 64%, #000 65%)',
            }}
          />
        </div>
      )}

      {/* text column: kept narrower than the card so the ring overlay never
          has to fight it for space */}
      <div className="max-w-[270px]">
        {/* The lobby name, not the host's — this is the string a player types
            into Dota's lobby browser, so it is the one line on the card that
            has a job beyond identification. The host is one click away on
            the game's own page; the fixed 200px card has no room to spare
            for a second identity line the mockup doesn't carry either. */}
        <h3 className="min-w-0 text-[22px] leading-tight font-bold text-white truncate">
          {game.lobbyName ?? game.initiatorName}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Pill badge={{ ...badge, label: badgeLabel }} />
          {game.newcomerFriendly && <Pill badge={NEWCOMER_BADGE} />}
        </div>

        {/* meta */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono">#{game.gameNumber}</span>
            <Trophy className="w-3.5 h-3.5" /> {modeName(game.settings.gameMode)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> {regionNameEn(game.settings.serverRegion)}
          </span>
        </div>

        {/* in-lobby roster: one wrapped line, capped to two lines' worth of
            height rather than growing the card past 200px */}
        {game.roster.length > 0 && (
          <div className="mt-1 h-[34px] overflow-hidden flex flex-wrap items-start gap-1.5 text-xs text-slate-300">
            {game.roster.map((name, pi) => (
              <Fragment key={`${name}-${pi}`}>
                {pi > 0 && <span className="text-slate-600">|</span>}
                <span className="truncate max-w-[4.5rem]">{name}</span>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {/* footer, by state — the badge already says what's happening, so this
          row is only ever the one thing left to do about it */}
      {creating && (
        <div className="flex items-center gap-2 min-h-9 mt-1 text-sm text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
          Bot tworzy lobby w Docie…
        </div>
      )}

      {inProgress && <div className="min-h-9" />}

      {finished && (
        <div className="flex items-center justify-end min-h-9">
          {game.dotaMatchId ? (
            <a
              href={`https://www.dotabuff.com/matches/${game.dotaMatchId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white transition-colors"
            >
              Dotabuff <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ) : (
            <Link
              href={`/inhouse/${game.id}`}
              className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
            >
              Szczegóły
            </Link>
          )}
        </div>
      )}

      {recruiting && (
        <div className="flex items-center justify-end min-h-9">
          {game.state === 'open' && (
            <JoinDialog gameId={game.id} lobbyName={game.lobbyName} full={slotsOpen <= 0} />
          )}
        </div>
      )}
      </div>
    </BorderGlow>
  );
}

function Pill({ badge }: { badge: BadgeStyle }) {
  return (
    <span
      className="shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.border}` }}
    >
      {badge.label}
    </span>
  );
}
