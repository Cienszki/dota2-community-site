'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { Calendar } from 'lucide-react';

interface NewsItem {
  id: number;
  title: string;
  content: string;
  category: string;
  created_at: string;
  image_url?: string | null;
}

export default function NewsPanel() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNews() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase
          .from('news')
          .select('*')
          .eq('status', 'published')
          .neq('category', 'SystemSettings')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (data) setNews(data);
      } catch (error) {
        console.error('Błąd pobierania newsów:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchNews();
  }, []);

  return (
    <section className="relative z-10 max-w-7xl mx-auto px-6">
      <div className="mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">Newsy</h1>
        <p className="text-slate-400 text-sm">Najnowsze wieści ze społeczności dota2inhouse.pl</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : news.length === 0 ? (
        <div className="bg-slate-900/10 border border-white/5 rounded-3xl p-16 text-center backdrop-blur-md">
          <h3 className="text-xl font-bold text-slate-300 mb-2">Brak nowych newsów</h3>
          <p className="text-slate-500 text-sm">Wróć tu za jakiś czas, żeby sprawdzić najnowsze ogłoszenia.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {news.map((item) => (
            <article
              key={item.id}
              className="w-full bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm hover:border-slate-700 transition-all"
            >
              {/* ── Header sekcja ── */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-slate-800/60 bg-slate-900/30 gap-4">
                <h3 className="text-2xl font-extrabold text-slate-100 leading-tight text-left flex-1 min-w-0">
                  {item.title}
                </h3>
                
                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(item.created_at).toLocaleDateString('pl-PL', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border font-sans ${
                    item.category === 'PDL'
                      ? 'text-red-500 bg-red-500/10 border-red-500/20'
                      : item.category === 'Turniej'
                      ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                      : item.category === 'Społeczność'
                      ? 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20'
                      : 'text-slate-400 bg-slate-400/10 border-slate-400/20'
                  }`}>
                    {item.category}
                  </span>
                </div>
              </div>

              {/* ── Body sekcja ── */}
              <div className="px-6 py-5">
                <div
                  className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed
                    prose-a:text-red-400 prose-a:no-underline hover:prose-a:text-red-300
                    prose-strong:text-slate-100 prose-ul:text-slate-300"
                  dangerouslySetInnerHTML={{ __html: item.content }}
                />
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt=""
                    className="mt-4 rounded-xl max-h-[400px] w-full object-cover border border-white/5"
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}