'use client';

import { useState, useTransition } from 'react';
import { Megaphone, Loader2, Check } from 'lucide-react';
import { publishGame, type PublishResult } from './actions';

// Publish CTA, shown to the host on an unpublished game. Publishing is the one
// deliberate growth lever in the system — it opens the game to the whole server
// and makes the Dota lobby findable in the in-game browser.

export default function PublishButton({ gameId }: { gameId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PublishResult | null>(null);

  if (result?.ok) {
    return (
      <span className="inline-flex items-center gap-2 text-emerald-300 text-sm font-semibold">
        <Check className="w-4 h-4" /> Opublikowano — gra jest teraz widoczna dla wszystkich.
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => start(async () => setResult(await publishGame(gameId)))}
        disabled={pending}
        className="inline-flex items-center gap-2 h-11 px-6 font-extrabold text-sm uppercase tracking-wide
                   bg-[#E7000B] text-white hover:bg-[#c10009] disabled:opacity-60 -skew-x-[12deg]
                   transition-colors"
      >
        <span className="flex items-center gap-2 skew-x-[12deg]">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
          Opublikuj grę
        </span>
      </button>
      {result && !result.ok && (
        <span className="text-xs text-red-400">
          {result.reason === 'forbidden'
            ? 'Tylko host może opublikować tę grę.'
            : 'Nie udało się opublikować. Spróbuj ponownie.'}
        </span>
      )}
    </div>
  );
}
