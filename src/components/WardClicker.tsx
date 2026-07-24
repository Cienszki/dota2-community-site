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
    <section className="relative z-10 w-full flex flex-col items-center">
      <button
        onClick={handleClick}
        className="cursor-pointer hover:scale-105 active:scale-95 transition-transform"
        aria-label="Postaw warda"
      >
        <img
          src="/images/ward.png"
          alt="Observer Ward"
          width={160}
          height={160}
          loading="lazy"
          className="w-40 h-40 object-contain select-none drop-shadow-[0_0_12px_rgba(251,146,60,0.35)]"
          draggable={false}
        />
      </button>
      <div className="mt-4 flex flex-col items-center">
        <span className="text-slate-400 text-sm font-bold uppercase tracking-widest">
          Postawiono już
        </span>
        <div className="font-mono text-4xl font-black text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]">
          {clicks === null ? '…' : clicks.toLocaleString('pl-PL')}
        </div>
        <span className="text-slate-400 text-sm font-bold uppercase tracking-widest">
          wardów!
        </span>
        {message && (
          <p className="mt-2 text-sm font-semibold text-red-400 transition-opacity">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
