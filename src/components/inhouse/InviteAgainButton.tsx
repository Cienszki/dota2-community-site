'use client';

import { useEffect, useState, useTransition } from 'react';
import { Loader2, Check, Send } from 'lucide-react';
import { joinGame } from '@/app/inhouse/actions';
import type { JoinResult } from '@/lib/inhouse/public';

// "Send it again."
//
// A Steam invite delivered to a closed Dota client is simply lost, and that is
// the most common reason someone says the invite never arrived. The server side
// of the retry already existed — `joinLobbyFor` treats `already_reserved` as a
// request for another invite rather than re-showing credentials to someone who
// is telling us the first one didn't work — but the success panel offered no
// way back to it. The one action that fixes the problem was the one action the
// UI stopped showing the moment it became relevant.
//
// Holding a slot and holding an invite are different things, and this only
// touches the second: the reservation is looked up, found, and left alone, so
// pressing this cannot cost someone the place they already have. That is worth
// saying on the button, because "join again" reads like it might.
//
// Not rendered for `in_lobby` — they are already standing in the lobby, and the
// server correctly declines to send an invite to someone who does not need one.

/** Long enough to stop double-taps, short enough not to be in the way. */
const COOLDOWN_SECONDS = 15;

export default function InviteAgainButton({
  gameId,
  onResult,
}: {
  gameId: string;
  /** Lets the parent swap panels if the retry comes back with worse news. */
  onResult?: (result: JoinResult) => void;
}) {
  const [pending, start] = useTransition();
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Ticked from an effect rather than derived during render: reading the clock
  // in a render pass is impure, and the react compiler is right to reject it.
  useEffect(() => {
    if (sentAt === null) return;

    const tick = () =>
      setSecondsLeft(Math.max(0, COOLDOWN_SECONDS - Math.round((Date.now() - sentAt) / 1000)));

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sentAt]);

  const send = () =>
    start(async () => {
      const result = await joinGame(gameId);
      setSentAt(Date.now());
      onResult?.(result);
    });

  const cooling = secondsLeft > 0;

  return (
    <div className="mt-3">
      <button
        onClick={send}
        disabled={pending || cooling}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-white/10 hover:bg-white/20
                   disabled:opacity-60 disabled:hover:bg-white/10 text-slate-100 text-xs font-bold
                   uppercase tracking-wide transition-colors"
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : cooling ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Send className="w-3.5 h-3.5" />
        )}
        {pending
          ? 'Wysyłam…'
          : cooling
            ? `Wysłane — ponów za ${secondsLeft}s`
            : 'Zaproś mnie ponownie'}
      </button>
      <p className="text-slate-500 text-xs mt-2 leading-relaxed">
        Zaproszenie przychodzi tylko do włączonej Doty. Nie stracisz miejsca — to jest samo
        zaproszenie, rezerwacja zostaje.
      </p>
    </div>
  );
}
