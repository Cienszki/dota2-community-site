'use client';

import Link from 'next/link';
import Image from 'next/image';
import Navbar from '@/components/Navbar';
import ClientLightPillar from '@/components/ClientLightPillar';

export default function NotFound() {
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

        <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4 text-center">
          {/* Primary Message */}
          <p className="text-2xl sm:text-3xl text-gray-400 mb-6 max-w-md leading-relaxed">
            Zgubiłeś coś? Jeśli tak to tutaj tego nie ma
          </p>

          {/* Largo GIF Container (200x200) */}
          <div className="relative w-[200px] h-[200px] mb-6 rounded-2xl overflow-hidden border border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
            <Image
              alt="Largo 404"
              className="object-cover w-full h-full"
              height={200}
              src="/images/largo.gif"
              unoptimized
              width={200}
            />
          </div>

          {/* Big 404 Text */}
          <span className="text-9xl sm:text-[10rem] font-black text-red-500 mb-8 tracking-wider drop-shadow-[0_0_15px_rgba(239,68,68,0.4)]">
            404
          </span>

          {/* Return Button */}
          <Link
            className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-all shadow-lg shadow-red-600/30 hover:scale-105 active:scale-95"
            href="/"
          >
            Wróć na Stronę Główną
          </Link>
        </div>
      </div>
    </>
  );
}
