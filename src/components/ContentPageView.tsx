import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import ClientLightPillar from '@/components/ClientLightPillar';
import SmoothScroll from '@/components/SmoothScroll';
import { CONTENT_PAGES, type ContentPageMeta } from '@/lib/content-pages';

// Shared renderer for the DB-backed content pages. Each explicit route
// (rekrutacja, o-nas, polityka-prywatnosci) passes its slug; the markup and the
// Supabase read are identical to the old `app/[slug]` page, just without the
// dynamic segment that used to swallow tournament paths.

export default async function ContentPageView({ slug }: { slug: keyof typeof CONTENT_PAGES }) {
  const meta: ContentPageMeta = CONTENT_PAGES[slug];

  let content: string | null = null;
  try {
    const { data } = await supabase
      .from('news')
      .select('content')
      .eq('category', 'ContentPage')
      .eq('title', slug)
      .maybeSingle();
    if (data) content = data.content as string;
  } catch {
    // Fall through to the placeholder.
  }

  return (
    <main className="relative bg-[#050505] text-slate-100 overflow-x-hidden min-h-screen">
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
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-24">
        {content ? (
          <>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-12">
              {meta.title}
            </h1>
            <div
              className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed
                prose-a:text-red-400 prose-a:no-underline hover:prose-a:text-red-300
                prose-strong:text-slate-100 prose-ul:text-slate-300"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </>
        ) : (
          <div className="text-center py-24">
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-4 text-slate-600">
              {meta.title}
            </h1>
            <p className="text-slate-500 text-lg">Ta strona jest w trakcie konfiguracji.</p>
          </div>
        )}
      </div>
    </main>
  );
}
