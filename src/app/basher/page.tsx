import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import ClientLightPillar from '@/components/ClientLightPillar';
import BasherMagazine from '@/components/BasherMagazine';
import { supabase } from '@/lib/supabase';

export const metadata: Metadata = {
  title: 'Magazyn Basher - Satyryczny Kącik Społeczności',
  description: 'Społecznościowy magazyn i gazetka Polish Dota2 Inhouse, przedstawiająca w satyryczny sposób wydarzenia i historie z życia naszej ligi.',
};

interface BasherIssue {
  id: string;
  issue_number: number;
  title: string;
  publish_date: string;
  pages: string[];
  link_url?: string | null;
}

export default async function BasherPage() {
  const { data: issues, error } = await supabase
    .from('basher_issues')
    .select('*')
    .eq('status', 'published')
    .order('issue_number', { ascending: false });

  if (error) {
    console.error('Failed to fetch basher issues:', error.message);
  }

  const allIssues = (issues ?? []) as BasherIssue[];
  const newestIssue = allIssues[0] ?? null;
  const olderIssues = allIssues.slice(1);

  return (
    <main className="relative min-h-screen bg-[#050505] text-slate-100 overflow-x-hidden">
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

      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        <div className="text-center mb-12 pt-[30px]">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4 drop-shadow-lg">
            Basher
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Magazyn społeczności Dota 2 Inhouse
          </p>
        </div>

        {allIssues.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-500 text-lg">Brak wydań magazynu Basher. Wróć później.</p>
          </div>
        ) : (
          <BasherMagazine
            issues={olderIssues}
            newestIssue={newestIssue!}
          />
        )}
      </section>
    </main>
  );
}
