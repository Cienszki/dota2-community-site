'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';
import ClientLightPillar from '@/components/ClientLightPillar';
import Navbar from '@/components/Navbar';
import SmoothScroll from '@/components/SmoothScroll';

export default function KontaktForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Parallax on the background tower art — same pattern as the homepage hero
  // art (HomeClient.tsx): direct style writes on scroll instead of React
  // state, so this doesn't trigger a re-render on every scroll pixel.
  const towerRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const PARALLAX_SPEED = 0.4;
    const onScroll = () => {
      if (towerRef.current) {
        towerRef.current.style.transform = `translateY(${window.scrollY * PARALLAX_SPEED}px)`;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !message) return;

    try {
      setStatus('loading');

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message }),
      });

      if (res.ok) {
        setStatus('success');
        setEmail('');
        setMessage('');
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  return (
    <main className="relative bg-[#050505] text-slate-100 overflow-x-hidden">
      <SmoothScroll />

      {/* BACKGROUND */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
        <ClientLightPillar topColor="#ff0000" bottomColor="#ff5500" intensity={0.7} rotationSpeed={0.2} glowAmount={0.002} pillarWidth={2.5} pillarHeight={0.3} noiseIntensity={0.5} pillarRotation={90} interactive={false} mixBlendMode="screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505]" />
      </div>

      <Navbar />

      <section className="relative z-10 max-w-4xl mx-auto px-6 pt-[30px] pb-10">
        {/* Static positioning (centering, the 2/3 horizontal offset) lives on
            this wrapper; the parallax ref sits on the img itself, which has
            no transform classes of its own — writing `style.transform`
            straight to it can't clobber a Tailwind-applied one. */}
        <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-2/3 h-[100%] w-auto pointer-events-none select-none z-0">
          <img
            ref={towerRef}
            src="/images/tower.png"
            alt=""
            aria-hidden="true"
            className="h-full w-auto object-contain opacity-70 will-change-transform"
          />
        </div>
        <div className="text-center mb-10 relative z-10">
          <Image
            src="/images/kurier.webp"
            alt=""
            width={550}
            height={550}
            className="h-32 w-32 object-contain mx-auto drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]"
            priority
          />
        </div>

        <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-8 backdrop-blur-md shadow-2xl relative z-10 overflow-hidden">

          {status === 'success' ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4 animate-bounce" />
              <h2 className="text-2xl font-bold text-slate-200 mb-2">Wiadomość została wysłana!</h2>
              <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">
                Dziękujemy za kontakt. Odpowiemy na Twój adres e-mail najszybciej, jak to możliwe.
              </p>
              <button
                onClick={() => setStatus('idle')}
                className="text-sm font-semibold text-red-400 hover:text-red-300 transition-colors"
              >
                Wyślij kolejną wiadomość
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">

              <div>
                <label htmlFor="email" className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Podaj swojego maila
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  disabled={status === 'loading'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="np. gracz@gmail.com"
                  className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-5 py-4 text-base text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-500/50 focus:bg-white/[0.04] transition-all disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Treść wiadomości
                </label>
                <textarea
                  id="message"
                  required
                  rows={10}
                  disabled={status === 'loading'}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Wpisz tutaj swoją wiadomość..."
                  className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-5 py-4 text-base text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-500/50 focus:bg-white/[0.04] transition-all resize-none disabled:opacity-50"
                />
              </div>

              {status === 'error' && (
                <div className="flex items-center gap-3 bg-red-950/20 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>Wystąpił błąd podczas wysyłania. Spróbuj ponownie za chwilę.</span>
                </div>
              )}

              <p className="text-xs text-slate-500 leading-relaxed">
                Przesyłając wiadomość, zgadzasz się na kontakt w celu odpowiedzi na Twoje zapytanie. Administrator danych: Polish Dota2 Inhouse. Zgodnie z{' '}
                <Link href="/polityka-prywatnosci" className="underline hover:text-slate-300 transition-colors">
                  Polityką Prywatności
                </Link>
                .
              </p>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-bold py-4 px-6 rounded-xl text-base transition-all shadow-lg shadow-red-900/20 group disabled:cursor-not-allowed"
                >
                  {status === 'loading' ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Wysyłanie...
                    </>
                  ) : (
                    <>
                      Wyślij wiadomość
                      <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </div>

            </form>
          )}

        </div>
      </section>

    </main>
  );
}
