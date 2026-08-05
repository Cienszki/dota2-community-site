'use client';

import { useActionState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { redeemCode, type RedeemState } from './actions';

const INITIAL: RedeemState = { status: 'idle' };

export default function LinkCodeForm() {
  const [state, formAction, pending] = useActionState(redeemCode, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex items-stretch gap-2">
        <input
          name="code"
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="7QK2"
          aria-label="Kod z lobby"
          className="w-36 bg-black/40 border border-white/15 focus:border-[#E7000B] outline-none
                     text-center text-2xl font-black tracking-[0.3em] uppercase text-white
                     px-3 py-2.5 rounded-md placeholder:text-slate-600 transition-colors"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-6 font-extrabold text-sm uppercase tracking-wide
                     bg-[#E7000B] text-white hover:bg-[#c10009] disabled:opacity-60 rounded-md
                     transition-colors"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          Połącz
        </button>
      </div>

      {state.status === 'error' && (
        <p className="text-sm text-red-400">{state.message}</p>
      )}
      {state.status === 'ok' && (
        <p className="text-sm text-emerald-400">
          {state.message}
          {state.games ? ` Znaleźliśmy Twoje ${state.games} wcześniejszych gier.` : ''}
        </p>
      )}
    </form>
  );
}
