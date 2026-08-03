'use client';

import { useEffect, useState } from 'react';
import { Radio, Users } from 'lucide-react';
import type { PublicGame } from '@/lib/inhouse/public';
import GameCard from './GameCard';

// Live board. Renders the SSR snapshot immediately, then upgrades to the SSE
// feed; if SSE can't hold (function-duration limits, proxies), it falls back to
// polling /api/inhouse/board every 5s (§4.3, §10.1).

export default function LiveBoard({ initial }: { initial: PublicGame[] }) {
  const [games, setGames] = useState<PublicGame[]>(initial);
  const [live, setLive] = useState(false);

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
          const data = (await res.json()) as { open?: PublicGame[] };
          if (!cancelled) setGames(data.open ?? []);
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
          const data = JSON.parse(e.data) as PublicGame[];
          if (!cancelled) {
            setGames(data);
            setLive(true);
          }
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (!cancelled) setLive(false);
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          Gry na żywo
          {live && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-red-400">
              <Radio className="w-3 h-3 animate-pulse" /> live
            </span>
          )}
        </h2>
        <span className="text-sm text-slate-500">
          {games.length} {games.length === 1 ? 'gra' : 'gier'}
        </span>
      </div>

      {games.length === 0 ? (
        <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-12 text-center backdrop-blur-md">
          <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-300 mb-1">Teraz nikt nie gra</h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            Otwórz lobby albo zajrzyj na Discorda — inhouse&apos;y ruszają najczęściej wieczorami.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}
