import type { Metadata } from 'next';
import ClientLightPillar from '@/components/ClientLightPillar';
import Navbar from '@/components/Navbar';
import NewsPanel from '@/components/NewsPanel';

export const metadata: Metadata = {
  title: 'Aktualności i Wydarzenia',
  description: 'Aktualności o turniejach Dota 2, życiu polskiej społeczności oraz najważniejszych wydarzeniach ligowych.',
  openGraph: {
    title: 'Aktualności i Wydarzenia | Polish Dota2 Inhouse',
    description: 'Aktualności o turniejach Dota 2, życiu polskiej społeczności oraz najważniejszych wydarzeniach ligowych.',
    url: 'https://dota2inhouse.pl/newsy',
    siteName: 'Polish Dota2 Inhouse',
    locale: 'pl_PL',
    type: 'website',
    images: [
      {
        url: '/images/og-image.png',
        width: 3840,
        height: 2160,
        alt: 'Polish Dota2 Inhouse Banner',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aktualności i Wydarzenia | Polish Dota2 Inhouse',
    description: 'Aktualności o turniejach Dota 2, życiu polskiej społeczności oraz najważniejszych wydarzeniach ligowych.',
    images: ['/images/og-image.png'],
  },
};

export default function NewsyPage() {
  return (
    <main className="relative min-h-screen bg-[#050505] text-slate-100 overflow-x-hidden">
      
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

      {/* NEWSY CONTENT */}
      <div className="pt-[30px] pb-20">
        <NewsPanel />
      </div>

    </main>
  );
}