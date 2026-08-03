import type { Metadata } from 'next';
import Link from 'next/link';
import { Radio, ArrowRight, HelpCircle } from 'lucide-react';
import InhouseShell from '@/components/inhouse/InhouseShell';
import SkewButton from '@/components/inhouse/SkewButton';
import LiveBoard from '@/components/inhouse/LiveBoard';
import GameCard from '@/components/inhouse/GameCard';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getBoard } from '@/lib/inhouse/live';
import type { PublicGame } from '@/lib/inhouse/public';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Inhouse 5v5',
  description:
    "Inhouse'y 5v5 Dota 2 z prawdziwymi ludźmi, prawie każdego wieczoru. Nie liga, bez tryhardów — dołącz do gry, która właśnie się zbiera.",
  alternates: { canonical: '/inhouse' },
};

export default async function InhousePage() {
  let open: PublicGame[] = [];
  let recent: PublicGame[] = [];

  if (isInhouseConfigured()) {
    try {
      const board = await getBoard();
      open = board.open;
      recent = board.recent;
    } catch (err) {
      console.error('inhouse board load failed', err);
    }
  }

  return (
    <InhouseShell width="wide">
      {/* HERO */}
      <div className="mb-12 max-w-3xl">
        <h1 className="text-5xl md:text-6xl font-black tracking-tighter uppercase leading-[0.95]">
          Inhouse <span className="text-[#E7000B]">5v5</span>
        </h1>
        <p className="text-slate-300 text-xl mt-4 leading-relaxed">
          Prawdziwi ludzie, prawie każdego wieczoru. Nie liga. Bez tryhardów.
        </p>
        <div className="flex flex-wrap items-center gap-4 mt-7">
          <SkewButton href="/inhouse/link" variant="redSolid" prefetch={false}>
            Połącz konto <ArrowRight className="w-4 h-4" />
          </SkewButton>
          <Link
            href="/inhouse/how-it-works"
            className="inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors font-semibold"
          >
            <HelpCircle className="w-4 h-4" /> Jak to działa?
          </Link>
        </div>
      </div>

      {/* LIVE BOARD */}
      <LiveBoard initial={open} />

      {/* RECENT RESULTS */}
      {recent.length > 0 && (
        <div className="mt-14">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Radio className="w-4 h-4 text-slate-500" /> Ostatnie gry
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </div>
      )}

      {!isInhouseConfigured() && (
        <p className="mt-10 text-sm text-slate-500">
          Integracja z botem lobby jest w trakcie konfiguracji — tablica gier ożyje, gdy tylko
          zostanie podłączona.
        </p>
      )}
    </InhouseShell>
  );
}
