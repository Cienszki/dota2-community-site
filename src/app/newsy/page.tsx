import type { Metadata } from 'next';
import SiteBackground from '@/components/SiteBackground';
import Navbar from '@/components/Navbar';
import NewsPanel, { type NewsItem } from '@/components/NewsPanel';
import SmoothScroll from '@/components/SmoothScroll';
import { supabase } from '@/lib/supabase';

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
    // Same banner as the root layout, for the same reason: og-image.png is
    // 3.7 MB, above what Discord's image proxy fetches.
    images: [
      {
        url: '/images/og-embed.png',
        width: 3192,
        height: 700,
        alt: 'Polish Dota2 Inhouse',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aktualności i Wydarzenia | Polish Dota2 Inhouse',
    description: 'Aktualności o turniejach Dota 2, życiu polskiej społeczności oraz najważniejszych wydarzeniach ligowych.',
    images: ['/images/og-embed.png'],
  },
};

export default async function NewsyPage() {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .eq('status', 'published')
    .neq('category', 'SystemSettings')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Błąd pobierania newsów:', error.message);
  }

  const news = (data ?? []) as NewsItem[];

  return (
    <main className="relative min-h-screen bg-[#050505] text-slate-100 overflow-x-hidden">
      <SmoothScroll />

      <SiteBackground />

      <Navbar />

      {/* NEWSY CONTENT */}
      <div className="pt-[30px] pb-20">
        <NewsPanel news={news} />
      </div>

    </main>
  );
}