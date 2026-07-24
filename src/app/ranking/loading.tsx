import { Trophy } from 'lucide-react';
import ClientLightPillar from '@/components/ClientLightPillar';
import Navbar from '@/components/Navbar';

export default function RankingLoading() {
  return (
    <main className="relative bg-[#050505] text-slate-100 overflow-x-hidden">
      {/* BACKGROUND */}
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

      <Navbar />

      {/* LEADERBOARD CONTAINER */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-[30px] pb-10">
        {/* HEADER SKELETON */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-red-600/10 rounded-xl flex items-center justify-center text-red-500 border border-red-500/20">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="h-10 w-48 bg-gray-800 rounded-lg mb-2" />
              <div className="h-6 w-72 bg-gray-800/80 rounded" />
            </div>
          </div>
          <div className="h-12 w-48 bg-gray-800 rounded-xl flex-shrink-0" />
        </div>

        {/* TABLE SKELETON */}
        <div className="w-full bg-[#12141a] border border-gray-800 rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="flex justify-between items-center p-4 border-b border-gray-800">
            <div className="h-4 w-16 bg-gray-800 rounded" />
            <div className="h-4 w-24 bg-gray-800 rounded" />
            <div className="h-4 w-20 bg-gray-800 rounded" />
          </div>

          {/* Table Rows (10 rows) */}
          <div className="divide-y divide-gray-800/50">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center p-4">
                {/* Position */}
                <div className="h-5 w-8 bg-gray-800/80 rounded animate-pulse" />

                {/* Avatar + Nickname */}
                <div className="flex items-center gap-3 w-1/3">
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex-shrink-0 animate-pulse" />
                  <div className="h-4 w-28 bg-gray-800/80 rounded animate-pulse" />
                </div>

                {/* Rank + MMR */}
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gray-800 animate-pulse" />
                  <div className="h-4 w-16 bg-gray-800/80 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
