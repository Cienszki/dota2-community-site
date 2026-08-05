'use client';

import { useState, useTransition } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { revokeBan, type ModResult } from './actions';

export default function RevokeButton({ moderationId }: { moderationId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ModResult | null>(null);

  if (result?.ok) return <span className="text-xs text-emerald-400">{result.message}</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => start(async () => setResult(await revokeBan(moderationId)))}
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-60 transition-colors"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
        Zdejmij ban
      </button>
      {result && !result.ok && <span className="text-xs text-red-400">{result.message}</span>}
    </div>
  );
}
