'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { LogIn, Loader2, Copy, Check, Ban, Clock } from 'lucide-react';
import { joinGame } from '@/app/inhouse/actions';
import type { JoinResult } from '@/lib/inhouse/public';

// Web Join button. Calls the server action (which independently enforces the
// ban and reveals the password only on success) and renders the outcome inline
// — the link offer being the highest-converting moment in the product (§7.2).

export default function JoinButton({ gameId, full }: { gameId: string; full?: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<JoinResult | null>(null);

  const onClick = () =>
    start(async () => {
      setResult(await joinGame(gameId));
    });

  if (result) return <JoinOutcome result={result} onRetry={() => setResult(null)} />;

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-2 h-11 px-6 font-extrabold text-sm uppercase tracking-wide
                 bg-[#E7000B] text-white hover:bg-[#c10009] disabled:opacity-60 -skew-x-[12deg]
                 transition-colors"
    >
      <span className="flex items-center gap-2 skew-x-[12deg]">
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
        {full ? 'Dołącz do kolejki' : 'Dołącz'}
      </span>
    </button>
  );
}

function JoinOutcome({ result, onRetry }: { result: JoinResult; onRetry: () => void }) {
  switch (result.status) {
    case 'needs_link':
      return (
        <Panel tone="accent">
          <p className="font-bold text-white mb-1">Połącz konto — przytrzymamy Ci miejsce</p>
          <p className="text-slate-300 text-sm mb-3">
            Zarezerwujemy slot na 5 minut i zaprosimy Cię do lobby automatycznie.
          </p>
          <Link
            href="/inhouse/link"
            className="inline-flex items-center gap-2 h-10 px-5 font-extrabold text-xs uppercase tracking-wide
                       bg-[#E7000B] text-white hover:bg-[#c10009] -skew-x-[12deg] transition-colors"
          >
            <span className="skew-x-[12deg]">Połącz konto</span>
          </Link>
        </Panel>
      );
    case 'banned':
      return (
        <Panel tone="error">
          <p className="flex items-center gap-2 font-bold text-red-300">
            <Ban className="w-4 h-4" /> Nie możesz dołączyć do tej gry.
          </p>
        </Panel>
      );
    case 'reserved':
    case 'already_reserved':
    case 'in_lobby':
      return <Credentials result={result} />;
    case 'waitlisted':
      return (
        <Panel tone="accent">
          <p className="flex items-center gap-2 font-bold text-white">
            <Clock className="w-4 h-4" /> Lobby pełne — jesteś na liście{result.position ? ` (#${result.position})` : ''}.
          </p>
          <p className="text-slate-300 text-sm mt-1">Zaprosimy Cię, gdy tylko zwolni się miejsce.</p>
        </Panel>
      );
    case 'not_open':
      return <Panel tone="muted"><p className="text-slate-300">Ta gra już nie przyjmuje graczy.</p><Retry onRetry={onRetry} /></Panel>;
    case 'locked':
      return <Panel tone="muted"><p className="text-slate-300">Lobby jest chwilowo zablokowane.</p><Retry onRetry={onRetry} /></Panel>;
    default:
      return <Panel tone="muted"><p className="text-slate-300">Coś poszło nie tak. Spróbuj ponownie.</p><Retry onRetry={onRetry} /></Panel>;
  }
}

function Credentials({
  result,
}: {
  result: Extract<JoinResult, { status: 'reserved' | 'already_reserved' | 'in_lobby' }>;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!result.password) return;
    navigator.clipboard?.writeText(result.password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Panel tone="success">
      <p className="font-bold text-white mb-2">
        {result.status === 'in_lobby' ? 'Jesteś już w lobby' : 'Miejsce zarezerwowane!'}
      </p>
      <p className="text-slate-300 text-sm mb-3">
        Otwórz Dotę — wysłaliśmy Ci zaproszenie do lobby. Wejdź hasłem poniżej.
      </p>
      <div className="flex items-center gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-slate-500">
            {result.lobbyName ?? 'Lobby'}
          </div>
          <div className="text-2xl font-black tracking-[0.2em] text-white">
            {result.password ?? '—'}
          </div>
        </div>
        {result.password && (
          <button
            onClick={copy}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Skopiowano' : 'Kopiuj'}
          </button>
        )}
      </div>
    </Panel>
  );
}

function Retry({ onRetry }: { onRetry: () => void }) {
  return (
    <button onClick={onRetry} className="mt-2 text-xs text-slate-400 underline hover:text-slate-200">
      Spróbuj ponownie
    </button>
  );
}

function Panel({
  tone,
  children,
}: {
  tone: 'accent' | 'error' | 'success' | 'muted';
  children: React.ReactNode;
}) {
  const styles = {
    accent: 'bg-[#E7000B]/10 border-[#E7000B]/30',
    error: 'bg-red-500/10 border-red-500/30',
    success: 'bg-emerald-500/10 border-emerald-500/30',
    muted: 'bg-white/5 border-white/10',
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 ${styles}`}>{children}</div>;
}
