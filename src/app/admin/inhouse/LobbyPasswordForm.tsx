'use client';

import { useActionState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { saveLobbyPassword, type FormState } from './actions';

const INITIAL: FormState = { status: 'idle' };

export default function LobbyPasswordForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState(saveLobbyPassword, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label
          className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5"
          htmlFor="password"
        >
          Hasło do lobby
        </label>
        <input
          id="password"
          name="password"
          type="text"
          maxLength={32}
          defaultValue={initial}
          placeholder="np. pd2ih"
          autoComplete="off"
          spellCheck={false}
          className="w-full max-w-xs bg-[#181a20] border border-white/10 rounded-lg px-3 py-2 font-mono tracking-widest
                     text-slate-200 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
        />
        <p className="text-slate-500 text-sm mt-2">
          Gracze przepisują je z karty lobby do przeglądarki lobby w Docie, więc bez spacji i raczej
          krótkie. Widzą je wszyscy, którzy klikną „Dołącz” — poza osobami z banem.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700
                     disabled:opacity-60 text-white font-bold text-sm transition-colors"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Zapisz hasło
        </button>
        {state.status === 'ok' && <span className="text-sm text-emerald-400">{state.message}</span>}
        {state.status === 'error' && <span className="text-sm text-red-400">{state.message}</span>}
      </div>
    </form>
  );
}
