import type { Metadata } from 'next';
import Link from 'next/link';
import { Gamepad2, Users, Search, ShieldCheck, Link2, Heart, ArrowRight } from 'lucide-react';
import InhouseShell from '@/components/inhouse/InhouseShell';
import SkewButton from '@/components/inhouse/SkewButton';

export const metadata: Metadata = {
  title: 'Jak działa inhouse',
  description:
    "Inhouse'y 5v5 Dota 2 z prawdziwymi ludźmi. Bez ligi, bez rankingu, bez tryhardów — griefing to jedyne prawdziwe przewinienie, każdy poziom mile widziany.",
  alternates: { canonical: '/inhouse/how-it-works' },
};

// The culture document (§6.1). Pure static content — no data access. It does
// real filtering work: people who want a competitive ladder self-select out
// before joining, which is how the vibe is protected at scale.

export default function HowItWorksPage() {
  return (
    <InhouseShell width="default">
      <div className="mb-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase">Jak działa inhouse</h1>
        <p className="text-slate-300 text-xl mt-3 leading-relaxed max-w-2xl">
          Zwykłe 5v5 z ludźmi ze społeczności. Nie liga. Bez rankingu. Bez tryhardów.
        </p>
      </div>

      <div className="space-y-5">
        <Section icon={<Gamepad2 className="w-5 h-5" />} title="Co to jest">
          Ktoś otwiera lobby, zbiera się dziesięć osób, gracie mecz. Tyle. Drużyny ustawiacie sami
          w lobby — bot nie przydziela stron i nie ma żadnego systemu oceny umiejętności.
        </Section>

        <Section icon={<Search className="w-5 h-5" />} title="Jak dołączyć">
          Najprościej: otwórz Dotę, znajdź lobby w przeglądarce gier w kliencie i wejdź hasłem.
          Możesz też kliknąć <b className="text-white">Dołącz</b> na tej stronie przy grze, która
          właśnie się zbiera — jeśli masz połączone konto, przytrzymamy Ci miejsce na 5 minut i
          wyślemy zaproszenie do lobby.
        </Section>

        <Section icon={<Users className="w-5 h-5" />} title="Drużyny">
          Gracze sami siadają na Radiant i Dire. Do startu potrzebny jest podział 5/5.
          Żadnego balansowania, żadnego „shuffle”, żadnej ukrytej liczby opisującej, jak dobry
          jesteś.
        </Section>

        <Section icon={<Heart className="w-5 h-5" />} title="Vibe">
          Każdy poziom umiejętności jest mile widziany. Nie masz obowiązku być dobry. Jedyne
          prawdziwe przewinienie to <b className="text-white">griefing</b> — psucie gry innym.
          Jeśli szukasz drabinki rankingowej, to nie tutaj — i to jest w porządku.
        </Section>

        <Section icon={<Link2 className="w-5 h-5" />} title="Łączenie konta jest opcjonalne">
          Nie musisz nic klikać, żeby zagrać. Połączenie Discorda i Steama to bonus: trzymane
          miejsca, automatyczne zaproszenia, promocja z listy oczekujących i{' '}
          <Link href="/inhouse/link" className="text-red-400 hover:text-red-300 underline">
            odzyskanie całej historii Twoich gier
          </Link>
          . Pierwsza gra nigdy nie wymaga logowania.
        </Section>

        <Section icon={<ShieldCheck className="w-5 h-5" />} title="Uczciwie o prywatności">
          Gra „nieopublikowana” nie jest ogłaszana, dopóki host tego nie zrobi — ale ponieważ
          inhouse&apos;y działają jako mecze ligowe, ktoś zdeterminowany i tak znajdzie je na OpenDocie.
          Obietnica brzmi „bot nie ogłasza gry przed Tobą”, nie „nikt się nigdy nie dowie”.
        </Section>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-4">
        <SkewButton href="/inhouse" variant="redSolid" prefetch={false}>
          Zobacz gry na żywo <ArrowRight className="w-4 h-4" />
        </SkewButton>
        <Link href="/inhouse/link" className="text-slate-300 hover:text-white transition-colors font-semibold">
          Połącz konto →
        </Link>
      </div>
    </InhouseShell>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900/40 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
      <h2 className="flex items-center gap-2.5 text-lg font-bold text-white mb-2">
        <span className="text-[#E7000B]">{icon}</span>
        {title}
      </h2>
      <p className="text-slate-300 leading-relaxed">{children}</p>
    </div>
  );
}
