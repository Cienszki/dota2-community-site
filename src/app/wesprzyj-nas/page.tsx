import type { Metadata } from 'next';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import Navbar from '@/components/Navbar';
import ClientLightPillar from '@/components/ClientLightPillar';
import BorderGlow from '@/components/ui/BorderGlow';
import SmoothScroll from '@/components/SmoothScroll';

export const metadata: Metadata = {
  title: 'Wesprzyj Nas',
  description: 'Wesprzyj społeczność Polish Dota2 Inhouse jednorazowym napiwkiem przez Tipply lub regularną subskrypcją serwerową.',
};

export default function WesprzyjNasPage() {
  return (
    <main className="relative bg-[#050505] text-slate-100 overflow-x-hidden">
      <SmoothScroll />

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

      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-[30px] pb-10">
        <div className="flex items-center gap-4 mb-10">
          <Image
            src="/images/midas.png"
            alt=""
            width={64}
            height={64}
            className="w-16 h-16 object-contain shrink-0 drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]"
          />
          <h1 className="text-4xl font-extrabold tracking-tight uppercase">Dotacje</h1>
        </div>

        <div className="flex flex-wrap gap-7">
          <BorderGlow
            className="flex-1 min-w-[340px]"
            colors={["#ff0000", "#fff700", "#ff0000"]}
            backgroundColor="#050505"
            background="linear-gradient(135deg, rgba(43,43,43,0.8) 0%, rgba(5,5,5,0.8) 100%)"
            borderRadius={16}
            edgeSensitivity={30}
            glowRadius={40}
            glowIntensity={1.2}
          >
            <div className="p-8 flex flex-col gap-5 h-full">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0 overflow-hidden">
                  <Image src="/images/tipply.png" alt="Tipply" width={64} height={64} className="w-full h-full object-contain" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-white">Tip</h2>
                  <span className="inline-block mt-1.5 text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full text-red-400 bg-red-500/10 border border-red-500/20">
                    Jednorazowa wpłata
                  </span>
                </div>
              </div>
              <p className="text-slate-300 text-[15px] leading-relaxed flex-1">
                Dzięki waszemu wsparciu możemy fundować m.in. nagrody, kupić sprzęt, opłacać subskrypcje i wiele innych rzeczy dzięki którym możemy dostarczać dla was lepszy jakościowo kontent, dzięki serdeczne &lt;3
              </p>
              <a
                href="https://tipply.pl/@pd2ih"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wide text-sm transition-colors"
              >
                Przejdź do Tipply
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </BorderGlow>

          <BorderGlow
            className="flex-1 min-w-[340px]"
            colors={["#ff0000", "#fff700", "#ff0000"]}
            backgroundColor="#050505"
            background="linear-gradient(135deg, rgba(43,43,43,0.8) 0%, rgba(5,5,5,0.8) 100%)"
            borderRadius={16}
            edgeSensitivity={30}
            glowRadius={40}
            glowIntensity={1.2}
          >
            <div className="p-8 flex flex-col gap-5 h-full">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center shrink-0 overflow-hidden">
                  <Image src="/images/master.png" alt="Subskrypcja" width={64} height={64} className="w-full h-full object-contain" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-white">Subskrypcja</h2>
                  <span className="inline-block mt-1.5 text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full text-indigo-300 bg-indigo-500/10 border border-indigo-500/25">
                    Regularne mini dotacje
                  </span>
                </div>
              </div>
              <p className="text-slate-300 text-[15px] leading-relaxed flex-1">
                Subskrypcja serwerowa to regularna miesięczna wpłata (od 10 zł), która odblokowuje dodatkowe role, wyróżniający kolor nicku oraz dostęp do mini-perków. Subskrypcja również wspiera nas finansowo w realizacji celów dla rozwoju polskiej społeczności Dota 2. Można zrezygnować w dowolnym momencie.
              </p>
              <a
                href="https://mee6.xyz/en/m/947158056381337630"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold uppercase tracking-wide text-sm transition-colors"
              >
                Przejdź do MEE6
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </BorderGlow>
        </div>
      </section>

    </main>
  );
}
