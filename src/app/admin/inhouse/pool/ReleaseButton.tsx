'use client';

import { useState, useTransition } from 'react';
import { Loader2, Unlock } from 'lucide-react';
import { forceRelease } from './actions';

export default function ReleaseButton({ botAccountId }: { botAccountId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);

  if (msg?.ok) return <span className="text-xs text-emerald-400">{msg.message}</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => start(async () => setMsg(await forceRelease(botAccountId)))}
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-60 transition-colors"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
        Zwolnij
      </button>
      {msg && !msg.ok && <span className="text-xs text-red-400">{msg.message}</span>}
    </div>
  );
}
