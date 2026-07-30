'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { Share2, Link2, Check, X, Maximize2, ChevronDown } from 'lucide-react';
import { FaFacebook } from 'react-icons/fa';

interface NewsItem {
  id: number;
  title: string;
  content: string;
  category: string;
  created_at: string;
  image_url?: string | null;
}

const TAG_STYLES: Record<string, string> = {
  PDL: 'text-red-400 bg-red-500/10 border-red-500/20',
  Turniej: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'Społeczność': 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  Basher: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
};

const PAGE_SIZE = 4;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Share dropdown ──

function ShareMenu({ newsId }: { newsId: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const anchor = `news-${newsId}`;
  const shareUrl = () =>
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}#${anchor}`
      : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — no-op
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Udostępnij"
        className="w-8 h-8 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-slate-300 flex items-center justify-center transition-colors"
      >
        <Share2 className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-20 bg-[#1c1d21] border border-white/10 rounded-xl p-2 flex flex-col gap-0.5 shadow-2xl min-w-[180px]">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-slate-200 text-sm hover:bg-white/[0.06] transition-colors text-left"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
            {copied ? 'Skopiowano' : 'Kopiuj link'}
          </button>
          <div className="h-px bg-white/[0.08] my-1 mx-0.5" />
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl())}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-slate-200 text-sm hover:bg-white/[0.06] transition-colors"
          >
            <FaFacebook className="w-3.5 h-3.5" />
            Facebook
          </a>
        </div>
      )}
    </div>
  );
}

// ── Lightbox ──

function Lightbox({ imageUrl, onClose }: { imageUrl: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-10"
    >
      <div onClick={(e) => e.stopPropagation()} className="relative">
        <img
          src={imageUrl}
          alt=""
          className="w-[900px] max-w-[85vw] h-[560px] max-h-[80vh] object-contain bg-black rounded-2xl"
        />
        <button
          onClick={onClose}
          title="Zamknij"
          className="absolute -top-4 -right-4 w-9 h-9 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-2xl"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>,
    document.body
  );
}

export default function NewsPanel() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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

  const visibleNews = news.slice(0, visibleCount);
  const hasMore = visibleCount < news.length;

  return (
    <section className="relative z-10 max-w-7xl mx-auto px-6">
      <div className="flex items-center gap-4 mb-8">
        <Image
          src="/images/antena.png"
          alt=""
          width={256}
          height={256}
          className="w-16 h-16 object-contain shrink-0"
          priority
        />
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Newsy</h1>
          <p className="text-slate-400 text-lg mt-0.5">Najważniejsze wieści z PD2IH, czyli info o turniejach, spotkaniach i innych nowościach.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : news.length === 0 ? (
        <div className="bg-[#17181c]/50 border border-white/[0.06] rounded-3xl p-16 text-center backdrop-blur-md">
          <h3 className="text-xl font-bold text-slate-200 mb-2">Brak nowych newsów</h3>
          <p className="text-slate-500 text-sm">Wróć tu za jakiś czas, żeby sprawdzić najnowsze ogłoszenia.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-6">
            {visibleNews.map((item) => (
              <article
                key={item.id}
                id={`news-${item.id}`}
                className="w-full bg-[linear-gradient(135deg,rgba(43,43,43,0.8)_0%,rgba(5,5,5,0.8)_100%)] border border-white/[0.08] rounded-2xl overflow-visible transition-all duration-300 hover:shadow-[0_0_30px_rgba(239,68,68,0.12)] hover:-translate-y-0.5 scroll-mt-6"
              >
                <div className="flex gap-6 p-6 flex-wrap">
                  <div className="relative w-[220px] h-[140px] shrink-0">
                    {item.image_url ? (
                      <>
                        <img
                          src={item.image_url}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover rounded-xl border border-white/10"
                        />
                        <button
                          onClick={() => setLightboxUrl(item.image_url!)}
                          title="Powiększ"
                          className="absolute bottom-2 right-2 w-[30px] h-[30px] rounded-lg bg-black/65 text-white flex items-center justify-center backdrop-blur-sm hover:bg-black/80 transition-colors"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <div className="absolute inset-0 w-full h-full rounded-xl border border-white/5 bg-gradient-to-br from-slate-800 to-slate-900" />
                    )}
                  </div>

                  <div className="flex-1 min-w-[260px] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <h3 className="text-xl font-extrabold text-slate-50 flex-1 min-w-[200px]">
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full border ${TAG_STYLES[item.category] ?? 'text-slate-400 bg-slate-400/10 border-slate-400/20'}`}>
                          {item.category}
                        </span>
                        <span className="text-slate-500 text-xs font-mono whitespace-nowrap">
                          {formatDate(item.created_at)}
                        </span>
                        <ShareMenu newsId={item.id} />
                      </div>
                    </div>
                    <div
                      className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed
                        prose-a:text-red-400 prose-a:no-underline hover:prose-a:text-red-300
                        prose-strong:text-slate-100 prose-ul:text-slate-300"
                      dangerouslySetInnerHTML={{ __html: item.content }}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="flex items-center gap-5 mt-8 mb-10">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-white/[0.14]" />
            {hasMore ? (
              <button
                onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, news.length))}
                className="flex items-center gap-2 text-slate-400 hover:text-slate-100 text-sm font-semibold transition-colors shrink-0"
              >
                Pokaż starsze newsy
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            ) : null}
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-white/[0.14]" />
          </div>
        </>
      )}

      {lightboxUrl && <Lightbox imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </section>
  );
}
