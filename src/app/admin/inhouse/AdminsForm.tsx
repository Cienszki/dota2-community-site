'use client';

import { useActionState } from 'react';
import { Save, Loader2, Info } from 'lucide-react';
import { saveInhouseAdmins, type FormState } from './actions';

const INITIAL: FormState = { status: 'idle' };

const areaCls =
  'w-full bg-[#181a20] border border-white/10 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all';
const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

export default function AdminsForm({
  discordIds,
  steamIds,
}: {
  discordIds: string[];
  steamIds: string[];
}) {
  const [state, action, pending] = useActionState(saveInhouseAdmins, INITIAL);

  return (
    <form action={action} className="space-y-5">
      <p className="flex items-start gap-2 text-slate-400 text-sm">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        Oba pola są potrzebne. Steam ID jest wymagane, aby admin mógł użyć <code className="text-slate-200">!kick</code> /{' '}
        <code className="text-slate-200">!ban</code> w czacie lobby, gdzie nie ma tożsamości Discord. Rozdziel
        spacją, przecinkiem lub nową linią.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="discordIds">Discord IDs</label>
          <textarea id="discordIds" name="discordIds" rows={6} defaultValue={discordIds.join('\n')} className={areaCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="steamIds">Steam IDs (32-bit)</label>
          <textarea id="steamIds" name="steamIds" rows={6} defaultValue={steamIds.join('\n')} className={areaCls} />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold text-sm transition-colors"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Zapisz adminów
        </button>
        {state.status === 'ok' && <span className="text-sm text-emerald-400">{state.message}</span>}
        {state.status === 'error' && <span className="text-sm text-red-400">{state.message}</span>}
      </div>
    </form>
  );
}
