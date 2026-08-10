'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { XCircle, Loader2 } from 'lucide-react';
import { cancelGame, type CancelResult } from './actions';

// Closing a lobby frees the Steam account it is holding, so it is worth doing
// promptly — but it also drops everyone who already joined, which is why it
// asks first rather than firing on the initial click.

export default function CancelButton({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<CancelResult | null>(null);

  const cancel = () =>
    start(async () => {
      const res = await cancelGame(gameId);
      setResult(res);
      if (res.ok) router.refresh();
    });

  if (result?.ok) {
    return <span className="text-sm text-slate-400">Lobby zamknięte.</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={cancel}
            disabled={pending}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-red-600/90 hover:bg-red-600
                       disabled:opacity-60 text-white text-sm font-bold transition-colors"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Tak, zamknij lobby
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Anuluj
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-slate-500 hover:text-red-300 transition-colors"
        >
          <XCircle className="w-4 h-4" /> Zamknij lobby
        </button>
      )}

      {result && !result.ok && (
        <span className="text-xs text-red-400">
          {result.reason === 'forbidden'
            ? 'Tylko host lub administrator może zamknąć to lobby.'
            : result.reason === 'already_started'
              ? 'Mecz już wystartował — nie da się go anulować.'
              : 'Nie udało się zamknąć lobby. Spróbuj ponownie.'}
        </span>
      )}
    </div>
  );
}
