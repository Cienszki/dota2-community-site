'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { addFaq, type FaqFormState } from './actions';

const INITIAL: FaqFormState = { status: 'idle' };
const inputCls =
  'w-full bg-[#181a20] border border-white/10 rounded-lg px-3 py-2 text-slate-200 outline-none focus:ring-2 focus:ring-red-600';
const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

export default function AddFaqForm() {
  const [state, action, pending] = useActionState(addFaq, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'ok') formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="question">Pytanie</label>
        <input id="question" name="question" placeholder="Czy muszę mieć Discorda, żeby dołączyć?" className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="answer">Odpowiedź</label>
        <textarea id="answer" name="answer" rows={3} className={`${inputCls} resize-y`} />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold text-sm"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Dodaj pytanie
        </button>
        {state.status === 'ok' && <span className="text-sm text-emerald-400">{state.message}</span>}
        {state.status === 'error' && <span className="text-sm text-red-400">{state.message}</span>}
      </div>
    </form>
  );
}
