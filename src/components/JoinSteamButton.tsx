'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogIn, ShieldCheck } from 'lucide-react';

export default function JoinSteamButton() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((data) => setHidden(data.linked === true))
      .catch(() => setHidden(false));
  }, []);

  if (hidden) return null;

  return (
    <div className="inline-flex flex-col items-start sm:items-end gap-2">
      <Link
        href="/api/auth/steam"
        prefetch={false}
        className="inline-flex drop-shadow-[0_0_8px_rgba(220,38,38,0.25)] hover:drop-shadow-[0_0_15px_rgba(220,38,38,0.45)] transition-[filter] duration-300"
      >
        <span className="flex items-center gap-2.5 h-12 px-7 bg-transparent border-[1.5px] border-[#E7000B] text-white font-extrabold text-sm uppercase tracking-wide -skew-x-[12deg] transition-colors duration-300 hover:bg-[#E7000B]/15">
          <span className="flex items-center gap-2 skew-x-[12deg] whitespace-nowrap">
            <LogIn className="w-[18px] h-[18px]" />
            Zaloguj przez Steam
          </span>
        </span>
      </Link>
      <p className="flex items-start gap-1.5 text-xs text-slate-500 max-w-[260px] sm:text-right">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
        <span>
          Logowanie jest bezpieczne — sprawdzamy tylko Twój SteamID, więcej w {' '}
          <Link href="/polityka-prywatnosci" className="underline hover:text-slate-300 transition-colors">
            Polityka prywatności
          </Link>
        </span>
      </p>
    </div>
  );
}
