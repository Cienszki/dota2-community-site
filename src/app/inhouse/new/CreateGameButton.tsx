'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Rocket, Loader2, Sparkles } from 'lucide-react';
import { createInhouseGame } from './actions';
import type { CreateResult } from '@/lib/inhouse/public';

export default function CreateGameButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newcomer, setNewcomer] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);

  const create = () =>
    start(async () => {
      const res = await createInhouseGame({ newcomerFriendly: newcomer });
      setResult(res);
      if (res.status === 'ok') router.push(`/inhouse/${res.gameId}`);
    });

  return (
    <div>
      <label className="flex items-center gap-2 text-slate-300 mb-5 cursor-pointer">
        <input type="checkbox" checked={newcomer} onChange={(e) => setNewcomer(e.target.checked)} className="w-4 h-4 accent-red-600" />
        <Sparkles className="w-4 h-4 text-emerald-400" />
        Gra przyjazna dla nowych (rezerwuje miejsca dla graczy z małą liczbą gier)
      </label>

      <button
        onClick={create}
        disabled={pending || result?.status === 'ok'}
        className="inline-flex items-center gap-2.5 h-13 px-8 py-3.5 font-extrabold text-base uppercase tracking-wide
                   bg-[#E7000B] text-white hover:bg-[#c10009] disabled:opacity-60 -skew-x-[12deg] transition-colors"
      >
        <span className="flex items-center gap-2.5 skew-x-[12deg]">
          {pending || result?.status === 'ok' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Rocket className="w-5 h-5" />}
          Utwórz lobby teraz
        </span>
      </button>

      {result && result.status !== 'ok' && (
        <div className="mt-4">
          {result.status === 'banned' && <p className="text-sm text-red-400">Nie możesz teraz tworzyć gier.</p>}
          {result.status === 'no_bots' && (
            <p className="text-sm text-amber-300">Wszystkie boty lobby są teraz zajęte. Spróbuj za chwilę.</p>
          )}
          {result.status === 'too_many_open' && (
            <p className="text-sm text-amber-300">
              Otwarte są już {result.max} lobby — to wystarczy.{' '}
              <Link href="/inhouse" className="text-red-400 underline">
                Dołącz do jednego z nich
              </Link>{' '}
              zamiast otwierać trzecie, inaczej żadne się nie zapełni.
            </p>
          )}
          {(result.status === 'unavailable' || result.status === 'error') && (
            <p className="text-sm text-red-400">Coś poszło nie tak. Spróbuj ponownie.</p>
          )}
        </div>
      )}
    </div>
  );
}
