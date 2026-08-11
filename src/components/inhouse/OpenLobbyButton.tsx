'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Loader2 } from 'lucide-react';
import { createInhouseGame, type CreateResult } from '@/app/inhouse/new/actions';

// Opening a lobby is one press, in place.
//
// It used to navigate to /inhouse/new, which was a whole page load to show a
// single button — and hosting needs no account and no settings (everything
// comes from admin defaults), so there was never anything to ask. The lobby is
// created straight from the board and shows up in the list a moment later, via
// the same live feed that carries everyone else's.

type Variant = 'card' | 'header';

export default function OpenLobbyButton({ variant }: { variant: Variant }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CreateResult | null>(null);

  const open = () =>
    start(async () => {
      setResult(null);
      const res = await createInhouseGame({ newcomerFriendly: false });
      setResult(res);
      // The live feed carries `lobby_creating`, so the new lobby appears on its
      // own within a second. This just makes the server-rendered half agree
      // without waiting for the next snapshot.
      if (res.status === 'ok') router.refresh();
    });

  const busy = pending || result?.status === 'ok';

  // Outlined, skewed — the "Obecne mecze" section header's CTA in the v5
  // mockup, standing in for the plain-text link and the old section title.
  if (variant === 'header') {
    return (
      <div className="relative">
        <button
          onClick={open}
          disabled={busy}
          className="inline-flex items-center gap-2 h-[35px] px-5 font-extrabold text-sm uppercase
                     tracking-wide text-white border-[1.5px] border-[#E7000B] hover:bg-[#E7000B]/15
                     disabled:opacity-60 -skew-x-[12deg] transition-colors"
        >
          <span className="flex items-center gap-2 skew-x-[12deg]">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="font-black">+</span>
            )}
            {busy ? 'Tworzenie…' : 'Nowa gra'}
          </span>
        </button>
        {result && result.status !== 'ok' && (
          <p
            role="status"
            className="absolute left-0 top-full mt-2 w-64 z-20 rounded-xl border border-amber-400/30
                       bg-zinc-900 px-3.5 py-2.5 text-xs leading-relaxed text-amber-100 shadow-xl"
          >
            <Message result={result} />
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={open}
        disabled={busy}
        className="inline-flex w-fit items-center h-11 px-6 font-extrabold text-sm uppercase
                   tracking-wide bg-[#E7000B] text-white hover:bg-[#c10009] disabled:opacity-60
                   -skew-x-[12deg] transition-colors"
      >
        <span className="flex items-center gap-2 skew-x-[12deg]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {busy ? 'Tworzenie lobby…' : 'Otwórz lobby'}
        </span>
      </button>
      {result && result.status !== 'ok' && (
        <p className="text-xs leading-relaxed text-amber-300">
          <Message result={result} />
        </p>
      )}
    </div>
  );
}

function Message({ result }: { result: CreateResult }) {
  switch (result.status) {
    case 'too_many_open':
      return (
        <>
          Otwarte są już {result.max} lobby — to wystarczy. Dołącz do jednego z nich zamiast
          otwierać kolejne, inaczej żadne się nie zapełni.
        </>
      );
    case 'no_bots':
      return <>Wszystkie boty lobby są teraz zajęte. Spróbuj za chwilę.</>;
    case 'banned':
      return <>Nie możesz teraz tworzyć gier.</>;
    case 'unavailable':
      return <>Integracja z botem lobby jest chwilowo niedostępna.</>;
    default:
      return (
        <>
          Coś poszło nie tak. Spróbuj ponownie albo{' '}
          <Link href="/inhouse/new" className="underline">
            otwórz lobby na osobnej stronie
          </Link>
          .
        </>
      );
  }
}
