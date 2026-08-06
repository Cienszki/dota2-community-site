import { Fragment } from 'react';
import Link from 'next/link';
import { MapPin, Sparkles, Trophy, Clock, Eye } from 'lucide-react';
import type { PublicGame } from '@/lib/inhouse/public';
import { modeName, regionName, formatDuration, stateLabel } from '@/lib/inhouse/display';
import Countdown from './Countdown';
import JoinDialog from './JoinDialog';

// A single game tile, shared by the live board (recruiting) and the recent
// results list (finished). Pure — no hooks — so it renders on the server for
// the finished list and inside the client LiveBoard alike.
//
// The heading is the *lobby* name, not the host's: it is the string a player
// types into Dota's lobby browser, so it is the one piece of text on the card
// that has a job to do. The host is demoted to a byline.

export default function GameCard({ game }: { game: PublicGame }) {
  const finished = game.state === 'finished';
  const inProgress = game.state === 'in_progress';

  return (
    <div className="group relative bg-zinc-900/40 border border-white/10 hover:border-[#E7000B]/40 rounded-2xl p-5 backdrop-blur-md transition-colors">
      {/* header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-500">#{game.gameNumber}</span>
            {game.newcomerFriendly && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded px-1.5 py-0.5">
                <Sparkles className="w-3 h-3" /> dla nowych
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-white truncate mt-0.5">
            {game.lobbyName ?? game.initiatorName}
          </h3>
          {game.lobbyName && (
            <p className="text-[11px] text-slate-500 truncate">host: {game.initiatorName}</p>
          )}
        </div>
        <StateBadge state={game.state} />
      </div>

      {/* meta */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mb-4">
        <span className="inline-flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5" /> {modeName(game.settings.gameMode)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> {regionName(game.settings.serverRegion)}
        </span>
      </div>

      {game.roster.length > 0 && <Roster names={game.roster} />}

      {finished ? (
        <FinishedBody game={game} />
      ) : inProgress ? (
        <SpectateBody game={game} />
      ) : (
        <RecruitingBody game={game} />
      )}

      {/* footer */}
      <div className="flex items-center justify-between gap-3 mt-4">
        <Link
          href={`/inhouse/${game.id}`}
          className="text-sm text-slate-400 hover:text-white transition-colors underline-offset-4 hover:underline"
        >
          Szczegóły →
        </Link>
        {!finished && !inProgress && game.state === 'open' && (
          <JoinDialog
            gameId={game.id}
            lobbyName={game.lobbyName}
            full={(game.slots?.slotsOpen ?? 1) <= 0}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Who is sitting in the lobby right now, pipe-separated.
 *
 * The bot is the source of these names, and the list length always matches the
 * in-lobby half of the "7/10" below it — the two are computed from the same
 * membership set precisely so they can never disagree on the same card.
 */
function Roster({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mb-4 text-xs text-slate-300">
      {names.map((name, i) => (
        <Fragment key={`${name}-${i}`}>
          {i > 0 && <span className="text-slate-600">|</span>}
          <span className="truncate max-w-[10rem]">{name}</span>
        </Fragment>
      ))}
    </div>
  );
}

function RecruitingBody({ game }: { game: PublicGame }) {
  const slots = game.slots;
  const committed = slots?.committed ?? 0;
  const slotsOpen = slots?.slotsOpen ?? Math.max(0, 10 - committed);
  const reserved = slots?.reserved ?? [];

  return (
    <div>
      {/* slot bar */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-[#E7000B] transition-[width] duration-500"
            style={{ width: `${Math.min(100, (committed / 10) * 100)}%` }}
          />
        </div>
        <span className="text-sm font-bold text-white tabular-nums">{committed}/10</span>
      </div>
      <p className="text-sm">
        {slotsOpen > 0 ? (
          <span className="text-emerald-300 font-semibold">
            {slotsOpen} {slotsOpen === 1 ? 'wolne miejsce' : 'wolnych miejsc'}
          </span>
        ) : (
          <span className="text-slate-400">Lobby pełne — dołącz do kolejki</span>
        )}
      </p>

      {reserved.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {reserved.map((r) => (
            <span
              key={r.discordId}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 bg-white/5 border border-white/10 rounded px-2 py-1"
              title="Miejsce zarezerwowane"
            >
              {r.playerName ?? 'Gracz'}
              <Countdown expiresAt={r.expiresAt} className="text-slate-500" />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The watch action for a running match.
 *
 * `spectateUrl` is null when no League ID is configured, and there is nothing
 * honest to offer in that case — the client has no way to find the game — so
 * the card says so rather than rendering a button that does nothing.
 */
function SpectateBody({ game }: { game: PublicGame }) {
  if (!game.spectateUrl) {
    return <p className="text-sm text-amber-300/90">Mecz w toku.</p>;
  }

  return (
    <div>
      <a
        href={game.spectateUrl}
        className="inline-flex items-center h-9 px-5 font-bold text-[13px] uppercase tracking-wide
                   border-[1.5px] border-amber-400/60 text-amber-200 hover:bg-amber-400/15
                   -skew-x-[12deg] transition-colors"
      >
        <span className="flex items-center gap-2 skew-x-[12deg]">
          <Eye className="w-4 h-4" /> Oglądaj mecz
        </span>
      </a>
      <p className="text-[11px] text-slate-500 mt-2">
        Otworzy Dotę 2 i włączy podgląd meczu z opóźnieniem transmisji.
      </p>
    </div>
  );
}

function FinishedBody({ game }: { game: PublicGame }) {
  const r = game.result;
  if (!r) return <p className="text-sm text-slate-400 mb-1">Rozegrana</p>;
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className={`font-bold ${r.radiantWin ? 'text-emerald-300' : 'text-red-300'}`}>
        {r.radiantWin ? 'Radiant' : 'Dire'} wygrywa
      </span>
      <span className="inline-flex items-center gap-1.5 text-slate-400">
        <Clock className="w-3.5 h-3.5" /> {formatDuration(r.durationSeconds)}
      </span>
    </div>
  );
}

function StateBadge({ state }: { state: PublicGame['state'] }) {
  const cls: Record<string, string> = {
    open: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
    ready: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
    in_progress: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
    finished: 'text-slate-300 bg-white/5 border-white/15',
  };
  return (
    <span
      className={`shrink-0 text-[10px] uppercase tracking-wide border rounded px-2 py-0.5 ${
        cls[state] ?? cls.finished
      }`}
    >
      {stateLabel(state)}
    </span>
  );
}
