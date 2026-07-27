'use client';

import { useEffect, useRef, useState } from 'react';
import { getWardClicks } from '@/app/actions';

export default function WardClicker() {
  const [clicks, setClicks] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef(0);
  const messageTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    getWardClicks().then(setClicks);
  }, []);

  const handleClick = async () => {
    const id = ++requestId.current;
    setClicks((c) => (c ?? 0) + 1);

    try {
      const res = await fetch('/api/ward-click', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        if (id === requestId.current) setClicks(data.value);
        setMessage(null);
      } else if (res.status === 429) {
        if (id === requestId.current) setClicks(data.value);
        setMessage(data.error);
        if (messageTimer.current) clearTimeout(messageTimer.current);
        messageTimer.current = setTimeout(() => setMessage(null), 3000);
      }
    } catch {
      setClicks(await getWardClicks());
    }
  };

  return (
    <section className="relative z-10 w-full flex items-center justify-center gap-4 sm:gap-7">
      <div className="flex flex-col items-end text-right">
        <span className="text-slate-300 text-sm sm:text-base font-bold uppercase tracking-widest">
          Postawiono już
        </span>
        <div className="font-mono text-4xl sm:text-5xl font-black text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]">
          {clicks === null ? '…' : clicks.toLocaleString('pl-PL')}
        </div>
        <span className="text-slate-300 text-sm sm:text-base font-bold uppercase tracking-widest">
          wardów!
        </span>
        {message && (
          <p className="mt-2 text-sm font-semibold text-red-400 transition-opacity">
            {message}
          </p>
        )}
      </div>
      <button
        onClick={handleClick}
        className="cursor-pointer hover:scale-105 active:scale-95 transition-transform shrink-0"
        aria-label="Postaw warda"
      >
        <img
          src="/images/ward.png"
          alt="Observer Ward"
          width={192}
          height={192}
          loading="lazy"
          className="w-32 h-32 sm:w-48 sm:h-48 object-contain select-none drop-shadow-[0_0_12px_rgba(251,146,60,0.35)]"
          draggable={false}
        />
      </button>
    </section>
  );
}
