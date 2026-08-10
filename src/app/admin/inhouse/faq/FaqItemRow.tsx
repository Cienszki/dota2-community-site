'use client';

import { useState, useTransition } from 'react';
import { Pencil, Trash2, Loader2, Check, X } from 'lucide-react';
import { updateFaq, deleteFaq, type FaqRow } from './actions';

const inputCls =
  'w-full bg-[#181a20] border border-white/10 rounded-lg px-3 py-2 text-slate-200 outline-none focus:ring-2 focus:ring-red-600';
const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

export default function FaqItemRow({ faq, index }: { faq: FaqRow; index: number }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startAction] = useTransition();
  const [deleting, startDelete] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startAction(async () => {
      const result = await updateFaq({ status: 'idle' }, formData);
      if (result.status === 'ok') {
        setEditing(false);
        setError(null);
      } else {
        setError(result.message ?? 'Nie udało się zapisać.');
      }
    });
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="bg-slate-900/40 border border-slate-700 rounded-xl p-4 space-y-3">
        <input type="hidden" name="id" value={faq.id} />
        <div>
          <label className={labelCls} htmlFor={`question-${faq.id}`}>Pytanie</label>
          <input id={`question-${faq.id}`} name="question" defaultValue={faq.question} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`answer-${faq.id}`}>Odpowiedź</label>
          <textarea
            id={`answer-${faq.id}`}
            name="answer"
            defaultValue={faq.answer}
            rows={3}
            className={`${inputCls} resize-y`}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold text-sm"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Zapisz
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 text-sm"
          >
            <X className="w-3.5 h-3.5" /> Anuluj
          </button>
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </form>
    );
  }

  return (
    <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-xs font-mono text-slate-600 mb-1">{String(index + 1).padStart(2, '0')}</div>
        <div className="font-semibold text-white">{faq.question}</div>
        <p className="text-sm text-slate-400 mt-1">{faq.answer}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setEditing(true)}
          title="Edytuj"
          className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => startDelete(async () => void (await deleteFaq(faq.id)))}
          disabled={deleting}
          title="Usuń"
          className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 text-slate-400 hover:text-red-300 hover:border-red-500/30 transition-colors"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
