'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, ExternalLink } from 'lucide-react';
import type { ProfileMatch, ProfileMatchPlayer } from '@/lib/inhouse/profile';
import { formatDuration } from '@/lib/inhouse/display';

// The viewer's last five games, and the detail view behind each one.
//
// Note what carries a K/D/A and what doesn't: the summary rows do, because they
// are the viewer's own record of their own games, but the rosters in the detail
// view show heroes and names only. §8 rules out per-player performance as a
// public comparison, and ten people's KDA side by side in a table is exactly
// that — your own line in your own history is not.

export default function MatchHistory({ matches }: { matches: ProfileMatch[] }) {
  const [open, setOpen] = useState<ProfileMatch | null>(null);
  const close = useCallback(() => setOpen(null), []);

  if (matches.length === 0) {
    return (
      <p className="mt-6 text-sm text-slate-500">
        Nie masz jeszcze rozegranych meczów — dołącz do lobby poniżej.
      </p>
    );
  }

  return (
    <>
      <div className="mt-6">
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-slate-600 mb-1">
          Ostatnie mecze
        </h3>
        <ul>
          {matches.map((m) => (
            <li key={m.dotaMatchId}>
              <button
                onClick={() => setOpen(m)}
                className="group flex w-full items-center gap-3 border-b border-white/5 py-2.5 text-left
                           transition-colors hover:bg-white/[0.03]"
              >
                <HeroIcon hero={m.you.hero} />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                  {m.you.hero?.name ?? 'Nieznany bohater'}
                </span>
                <Kda you={m.you} />
                <span
                  className={`w-[5.5rem] shrink-0 text-right text-xs font-bold ${
                    m.you.won ? 'text-emerald-300' : 'text-red-300'
                  }`}
                >
                  {m.you.won ? 'Wygrana' : 'Przegrana'}
                </span>
                <span className="hidden w-24 shrink-0 text-right text-xs text-slate-500 sm:block">
                  {shortDate(m.startedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {open && <MatchDialog match={open} onClose={close} />}
    </>
  );
}

function Kda({ you }: { you: ProfileMatch['you'] }) {
  if (you.kills === null || you.deaths === null || you.assists === null) {
    return <span className="w-24 shrink-0 text-right text-xs text-slate-600">—</span>;
  }
  return (
    <span className="w-24 shrink-0 text-right text-sm tabular-nums text-slate-300">
      {you.kills}<span className="text-slate-600">/</span>
      {you.deaths}<span className="text-slate-600">/</span>
      {you.assists}
    </span>
  );
}

function HeroIcon({ hero, size = 28 }: { hero: ProfileMatch['you']['hero']; size?: number }) {
  if (!hero?.icon) {
    return (
      <span
        className="shrink-0 rounded bg-white/5"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return (
    <Image
      src={hero.icon}
      alt={hero.name}
      width={size}
      height={size}
      unoptimized
      className="shrink-0 rounded"
    />
  );
}

/* ─── Detail ─────────────────────────────────────────────────────────────── */

function MatchDialog({ match, onClose }: { match: ProfileMatch; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const title = match.lobbyName ?? (match.gameNumber ? `Gra #${match.gameNumber}` : 'Mecz');

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Szczegóły meczu ${title}`}
        tabIndex={-1}
        className="relative my-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl outline-none backdrop-blur-md"
      >
        <button
          onClick={onClose}
          aria-label="Zamknij"
          className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="px-6 pt-6 sm:px-8 sm:pt-8">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white">{title}</h2>
            {match.gameNumber !== null && (
              <span className="font-mono text-sm text-slate-500">#{match.gameNumber}</span>
            )}
          </div>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-slate-400">
            <span className={match.you.won ? 'font-bold text-emerald-300' : 'font-bold text-red-300'}>
              {match.you.won ? 'Wygrana' : 'Przegrana'}
            </span>
            <span className="text-slate-700">·</span>
            <span>{formatDuration(match.durationSeconds)}</span>
            {match.radiantScore !== null && match.direScore !== null && (
              <>
                <span className="text-slate-700">·</span>
                <span className="tabular-nums">
                  <span className="text-emerald-300">{match.radiantScore}</span>
                  <span className="text-slate-600"> : </span>
                  <span className="text-red-300">{match.direScore}</span>
                </span>
              </>
            )}
            <span className="text-slate-700">·</span>
            <span>{fullDate(match.startedAt)}</span>
          </p>
        </div>

        <div className="grid gap-6 px-6 pb-6 pt-6 sm:grid-cols-2 sm:px-8 sm:pb-8">
          <Team
            label="Radiant"
            players={match.radiant}
            won={match.radiantWin}
            accent="text-emerald-300"
          />
          <Team label="Dire" players={match.dire} won={!match.radiantWin} accent="text-red-300" />
        </div>

        <div className="border-t border-white/10 px-6 py-4 sm:px-8">
          <a
            href={`https://www.dotabuff.com/matches/${match.dotaMatchId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 transition-colors hover:text-white"
          >
            Dotabuff <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Team({
  label,
  players,
  won,
  accent,
}: {
  label: string;
  players: ProfileMatchPlayer[];
  won: boolean;
  accent: string;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <span className={accent}>{label}</span>
        {won && (
          <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
            wygrana
          </span>
        )}
      </h3>
      <ul className="space-y-1">
        {players.map((p, i) => (
          <li
            key={`${p.steamId32 ?? 'anon'}-${i}`}
            className={`flex items-center gap-2.5 rounded px-1.5 py-1 text-sm ${
              p.isYou ? 'bg-white/[0.06] text-white' : 'text-slate-300'
            }`}
          >
            <HeroIcon hero={p.hero} size={24} />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="shrink-0 truncate text-xs text-slate-500">{p.hero?.name ?? ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Dates ──────────────────────────────────────────────────────────────── */

// Fixed locale and timezone so the server and client renders agree — a
// hydration mismatch here would swap the text under the reader.
const SHORT = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Warsaw',
});
const FULL = new Intl.DateTimeFormat('pl-PL', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Warsaw',
});

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : SHORT.format(d);
}

function fullDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : FULL.format(d);
}
