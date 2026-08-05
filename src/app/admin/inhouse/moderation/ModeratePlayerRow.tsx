'use client';

import { useState, useTransition } from 'react';
import { Ban, AlertTriangle, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { banPlayer, warnPlayer, type ModResult } from './actions';

export interface RosterPlayer {
  steamId32: string;
  discordId: string | null;
  name: string;
  suggestedDays: number; // ladder rung
}

export default function ModeratePlayerRow({ gameId, player }: { gameId: string; player: RosterPlayer }) {
  const [mode, setMode] = useState<'none' | 'ban' | 'warn'>('none');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<number>(player.suggestedDays);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ModResult | null>(null);

  const submit = () => {
    start(async () => {
      const res =
        mode === 'ban'
          ? await banPlayer({
              gameId,
              subjectSteamId32: player.steamId32,
              subjectDiscordId: player.discordId,
              subjectName: player.name,
              reason,
              durationDays: days,
            })
          : await warnPlayer({
              gameId,
              subjectSteamId32: player.steamId32,
              subjectDiscordId: player.discordId,
              subjectName: player.name,
              reason,
            });
      setResult(res);
      if (res.ok) {
        setMode('none');
        setReason('');
      }
    });
  };

  return (
    <div className="bg-black/30 border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-white">{player.name}</div>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5" /> Steam {player.steamId32}
            </span>
            {player.discordId ? (
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5" /> Discord połączony
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <ShieldAlert className="w-3.5 h-3.5" /> brak Discorda — rola nie zostanie usunięta
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode(mode === 'warn' ? 'none' : 'warn')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-amber-500/10 border border-amber-500/25 text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" /> Ostrzeż
          </button>
          <button
            onClick={() => setMode(mode === 'ban' ? 'none' : 'ban')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-500/10 border border-red-500/25 text-red-300 hover:bg-red-500/20 transition-colors"
          >
            <Ban className="w-4 h-4" /> Ban
          </button>
        </div>
      </div>

      {mode !== 'none' && (
        <div className="mt-4 space-y-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Powód (widoczny w rekordzie moderacji)"
            className="w-full bg-[#181a20] border border-white/10 rounded-lg px-3 py-2 text-slate-200 text-sm outline-none focus:ring-2 focus:ring-red-600"
          />
          {mode === 'ban' && (
            <label className="flex items-center gap-2 text-sm text-slate-400">
              Czas (dni, 0 = na stałe):
              <input
                type="number"
                min={0}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-24 bg-[#181a20] border border-white/10 rounded-lg px-2 py-1 text-slate-200"
              />
              <span className="text-xs text-slate-600">sugestia z drabinki: {player.suggestedDays === 0 ? 'na stałe' : `${player.suggestedDays} dni`}</span>
            </label>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={pending}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-60 transition-colors ${
                mode === 'ban' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Potwierdź {mode === 'ban' ? 'ban' : 'ostrzeżenie'}
            </button>
            <button onClick={() => setMode('none')} className="text-sm text-slate-400 hover:text-slate-200">
              Anuluj
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className={`mt-3 text-sm ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>{result.message}</p>
      )}
    </div>
  );
}
