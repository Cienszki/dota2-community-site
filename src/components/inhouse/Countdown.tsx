'use client';

import { useEffect, useState } from 'react';

// Reserved-slot countdown, rendered from `expiresAt` on the client so we never
// push a tick per second over SSE (§6.3).
export default function Countdown({ expiresAt, className = '' }: { expiresAt: string; className?: string }) {
  const [ms, setMs] = useState<number>(() => Date.parse(expiresAt) - Date.now());

  useEffect(() => {
    const id = setInterval(() => setMs(Date.parse(expiresAt) - Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (ms <= 0) return <span className={`tabular-nums ${className}`}>0:00</span>;

  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return (
    <span className={`tabular-nums ${className}`}>
      {m}:{String(s).padStart(2, '0')}
    </span>
  );
}
