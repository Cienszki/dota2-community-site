'use client';

import { useActionState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { saveLobbySettings, type FormState } from './actions';
import type { LobbyConfig } from '@/lib/inhouse/lobby-config';

// Site-level lobby policy, separate from the per-game defaults the bot reads.
// Lives in its own config document because the defaults form writes with a
// whole-document `set`, which would silently drop anything it doesn't know.

const INITIAL: FormState = { status: 'idle' };

const inputCls =
  'w-full bg-[#181a20] border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all';
const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

export default function LobbyForm({ initial }: { initial: LobbyConfig }) {
  const [state, action, pending] = useActionState(saveLobbySettings, INITIAL);

  return (
    <form action={action} className="space-y-6">
      <div>
        <label className={labelCls} htmlFor="password">
          Hasło do lobby
        </label>
        <input
          id="password"
          name="password"
          type="text"
          maxLength={32}
          defaultValue={initial.password}
          placeholder="np. pd2ih"
          autoComplete="off"
          spellCheck={false}
          className={`${inputCls} max-w-xs font-mono tracking-widest`}
        />
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          Gracze przepisują je z karty lobby do przeglądarki lobby w Docie, więc bez spacji i raczej
          krótkie. Widzą je wszyscy, którzy klikną „Dołącz” — poza osobami z banem.
        </p>
      </div>

      <div>
        <label className={labelCls} htmlFor="maxOpenLobbies">
          Limit otwartych lobby
        </label>
        <input
          id="maxOpenLobbies"
          name="maxOpenLobbies"
          type="number"
          min={1}
          max={10}
          defaultValue={initial.maxOpenLobbies}
          className={`${inputCls} max-w-[7rem]`}
        />
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          Po osiągnięciu limitu strona przestaje proponować otwarcie kolejnego lobby i kieruje graczy
          do tych, które już zbierają. Liczone są tylko lobby opublikowane — prywatne, których host
          jeszcze nie ogłosił, nie blokują nikomu hostowania.
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
          Zapisz
        </button>
        {state.status === 'ok' && <span className="text-sm text-emerald-400">{state.message}</span>}
        {state.status === 'error' && <span className="text-sm text-red-400">{state.message}</span>}
      </div>
    </form>
  );
}
