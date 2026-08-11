import { Fragment } from 'react';
import Link from 'next/link';
import { Trophy, MapPin, ExternalLink } from 'lucide-react';
import type { PublicGame } from '@/lib/inhouse/public';
import { modeName, regionName } from '@/lib/inhouse/display';
import JoinDialog from './JoinDialog';
import BorderGlow from '@/components/ui/BorderGlow';

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
//
// Layout: the host name with an inline state pill, a segmented committed/10
// progress ring, the mode/region meta line, the in-lobby roster in rows of
// five, and a state-dependent footer (recruiting → slots + Dołącz, in
// progress → a label, finished → Dotabuff).

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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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
  const rows = chunk(game.roster, 5);

  return (
    <BorderGlow className="w-[400px] h-[200px] shrink-0" {...BORDER_GLOW_PROPS}>
      <div className="p-5">
      {/* header: host + state pill, and the committed ring */}
      <div className="flex items-start justify-between gap-3 mb-2 min-h-[40px]">
        <div className="min-w-0">
          {/* The lobby name, not the host's — this is the string a player types
              into Dota's lobby browser, so it is the one line on the card that
              has a job beyond identification. */}
          <h3 className="mt-0.5 min-w-0 flex items-center gap-2 text-[22px] font-bold text-white">
            <span className="truncate">{game.lobbyName ?? game.initiatorName}</span>
            <Pill
              badge={(() => {
                const b = stateBadge(game.state);
                // The mockup folds the head-count into the badge. It is also on
                // the ring, but the ring is a shape you read at a glance and
                // this is the number you read when you want the number.
                return recruiting ? { ...b, label: `${b.label} ${committed}/10` } : b;
              })()}
            />
            {game.newcomerFriendly && <Pill badge={NEWCOMER_BADGE} />}
          </h3>
          {game.lobbyName && (
            <p className="text-[11px] text-slate-500 truncate">host: {game.initiatorName}</p>
          )}
        </div>

        {showRing && (
          <div
            className="relative shrink-0 -mt-2"
            style={{ width: 84, height: 84 }}
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
            <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-white">
              {committed}/10
            </span>
          </div>
        )}
      </div>

      {/* meta */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mb-4">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono">#{game.gameNumber}</span>
          <Trophy className="w-3.5 h-3.5" /> {modeName(game.settings.gameMode)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> {regionName(game.settings.serverRegion)}
        </span>
      </div>

      {/* in-lobby roster, in rows of five */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-4 text-xs text-slate-300">
          {rows.map((row, ri) => (
            <div key={ri} className="flex flex-wrap items-center gap-1.5">
              {row.map((name, pi) => (
                <Fragment key={`${name}-${pi}`}>
                  {pi > 0 && <span className="text-slate-600">|</span>}
                  <span className="truncate max-w-[10rem]">{name}</span>
                </Fragment>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* footer, by state */}
      {creating && (
        <div className="flex items-center gap-2 min-h-9 text-sm text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
          Bot tworzy lobby w Docie…
        </div>
      )}

      {inProgress && (
        <div className="flex items-center min-h-9">
          <p className="text-sm font-bold text-[#E7000B]">Trwający mecz</p>
        </div>
      )}

      {finished && (
        <div className="flex items-center justify-between gap-3 min-h-9">
          <span className="text-sm font-bold text-slate-300">Mecz zakończony</span>
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
        <div className="flex items-center justify-between gap-3 min-h-9">
          <p className={`text-sm font-semibold ${slotsOpen > 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
            {slotsOpen > 0
              ? `${slotsOpen} ${slotsOpen === 1 ? 'wolne miejsce' : 'wolnych miejsc'}`
              : 'Lobby pełne — kolejka'}
            {/* Names the amber arcs, so the two-tone ring reads without a legend. */}
            {held > 0 && (
              <span className="font-normal text-amber-300/90"> · {held} zarezerwowane</span>
            )}
          </p>
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
