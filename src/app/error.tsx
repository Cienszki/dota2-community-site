'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import ClientLightPillar from '@/components/ClientLightPillar';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <Navbar />
      <div className="relative min-h-[calc(100vh-64px)] overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
          <ClientLightPillar
            topColor="#ff0000"
            bottomColor="#ff5500"
            intensity={0.7}
            rotationSpeed={0.2}
            glowAmount={0.002}
            pillarWidth={2.5}
            pillarHeight={0.3}
            noiseIntensity={0.5}
            pillarRotation={90}
            interactive={false}
            mixBlendMode="screen"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505]" />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4 pb-16 text-center">
          <span className="text-[4.8rem] sm:text-[6rem] font-black text-red-500 mb-6 tracking-wider drop-shadow-[0_0_15px_rgba(239,68,68,0.4)]">
            Ups!
          </span>

          <p className="text-2xl sm:text-3xl text-gray-400 mb-2 max-w-md leading-relaxed">
            Coś poszło nie tak po naszej stronie.
          </p>
          <p className="text-slate-500 text-sm mb-8">
            Spróbuj ponownie za chwilę — jeśli problem się powtarza, daj nam znać.
            {error.digest && (
              <>
                <br />
                Kod błędu: <span className="font-mono text-slate-600">{error.digest}</span>
              </>
            )}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => unstable_retry()}
              className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-all shadow-lg shadow-red-600/30 hover:scale-105 active:scale-95"
            >
              Spróbuj ponownie
            </button>
            <Link
              href="/"
              className="px-6 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white font-semibold transition-all hover:scale-105 active:scale-95"
            >
              Wróć na Stronę Główną
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
