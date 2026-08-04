'use client';

import { useTransition } from 'react';
import { Power, Trash2, Loader2 } from 'lucide-react';
import { deleteSlot, toggleSlot } from './actions';

export default function SlotActions({ id, enabled }: { id: string; enabled: boolean }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => start(async () => void (await toggleSlot(id)))}
        disabled={pending}
        title={enabled ? 'Wyłącz' : 'Włącz'}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
          enabled
            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
            : 'bg-white/5 border-white/10 text-slate-400'
        }`}
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
        {enabled ? 'włączony' : 'wyłączony'}
      </button>
      <button
        onClick={() => start(async () => void (await deleteSlot(id)))}
        disabled={pending}
        title="Usuń"
        className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 text-slate-400 hover:text-red-300 hover:border-red-500/30 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
