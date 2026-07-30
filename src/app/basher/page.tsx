import type { Metadata } from 'next';
import Image from 'next/image';
import { Newspaper } from 'lucide-react';
import Navbar from '@/components/Navbar';
import ClientLightPillar from '@/components/ClientLightPillar';
import BasherMagazine from '@/components/BasherMagazine';
import { supabase } from '@/lib/supabase';
import SmoothScroll from '@/components/SmoothScroll';

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
      <SmoothScroll />
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
        <div className="flex items-center gap-4 pt-[30px] mb-12">
          <Image
            src="/images/basher.png"
            alt="Basher"
            width={251}
            height={295}
            className="h-20 w-auto shrink-0 drop-shadow-[0_0_14px_rgba(239,68,68,0.35)]"
            priority
          />
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white">Basher</h1>
            <p className="text-slate-400 text-lg mt-0.5">Satyryczno-komediowa pseudo gazetka społeczności PD2IH.</p>
          </div>
        </div>

        {allIssues.length === 0 ? (
          <div className="bg-slate-900/20 border border-white/5 rounded-3xl p-16 text-center backdrop-blur-md">
            <div className="w-16 h-16 mx-auto mb-5 bg-red-600/10 rounded-full flex items-center justify-center text-red-400 border border-red-500/25">
              <Newspaper className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-slate-200 mb-2">Brak wydań magazynu Basher</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              Pierwszy numer pojawi się tutaj zaraz po publikacji w panelu admina.
            </p>
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
