import type { Metadata } from 'next';
import Image from 'next/image';
import { statSync } from 'fs';
import { join } from 'path';
import { Users, ShieldAlert, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ClientLightPillar from '@/components/ClientLightPillar';
import RankingControls from '@/components/RankingControls';
import Navbar from '@/components/Navbar';
import SteamLinkHandler from '@/components/SteamLinkHandler';
import JoinSteamButton from '@/components/JoinSteamButton';

export const metadata: Metadata = {
  title: 'Ranking Polskich Graczy Dota 2',
  description: 'Ranking polskich graczy Dota 2 otwarty dla każdego. Dołącz do społeczności i sprawdź swoją pozycję w zestawieniu MMR!',
};


export const revalidate = 0;

interface PlayerData {
  id: number;
  steam_id: string;
  name: string;
  avatar: string;
  rankTier: number;
  leaderboardRank: number | null;
  winRate: string | null;
  trend: number | null;
  hasPublicMatches: boolean;
  isOfficial: boolean;
}

const FALLBACK_AVATAR = 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';

function getRankingIconVersion(): number {
  try {
    return statSync(join(process.cwd(), 'public/images/ranking.png')).mtimeMs;
  } catch {
    return 0;
  }
}

export default async function RankingPage() {
  // Cache-busting query param so replacing this file on disk is reflected
  // immediately — Next's image optimizer otherwise caches by URL alone and
  // doesn't reliably notice an in-place file change.
  const rankingIconSrc = `/images/ranking.png?v=${getRankingIconVersion()}`;

  let players: PlayerData[] = [];

  try {
    const { data: leaderboardEntries, error } = await supabase
      .from('ranking_leaderboard')
      .select('*');

    if (!error && leaderboardEntries && leaderboardEntries.length > 0) {
      let officialIndex = 0;

      // All stats below (mmr/rank_tier/win_rate/form) are pre-computed by the
      // daily sync-player-stats cron job — no OpenDota calls at request time.
      const results = leaderboardEntries.map((entry) => {
        if (entry.steam_id) {
          const hasPublicMatches = entry.has_public_matches ?? true;
          return {
            id: parseInt(entry.steam_id, 10),
            steam_id: entry.steam_id,
            name: entry.name,
            avatar: entry.avatar ?? FALLBACK_AVATAR,
            rankTier: entry.rank_tier ?? 0,
            leaderboardRank: entry.leaderboard_rank ?? null,
            winRate: hasPublicMatches && entry.win_rate !== null ? `${entry.win_rate}%` : null,
            trend: hasPublicMatches ? (entry.form ?? null) : null,
            hasPublicMatches,
            isOfficial: false,
          };
        }

        // Official leaderboard entry (no steam_id) — use DB data as-is
        officialIndex++;
        return {
          id: -(officialIndex), // unique negative key
          steam_id: entry.steam_id ?? '',
          name: entry.name,
          avatar: entry.avatar ?? FALLBACK_AVATAR,
          rankTier: 0,
          leaderboardRank: entry.leaderboard_rank ?? null,
          winRate: null,
          trend: null,
          hasPublicMatches: false,
          isOfficial: true,
        };
      });

      // Sort: leaderboardRank ASC first, then rankTier DESC for non-leaderboard
      players = results.sort((a, b) => {
        const aHasRank = a.leaderboardRank !== null && a.leaderboardRank > 0;
        const bHasRank = b.leaderboardRank !== null && b.leaderboardRank > 0;
        if (aHasRank && !bHasRank) return -1;
        if (!aHasRank && bHasRank) return 1;
        if (aHasRank && bHasRank) return a.leaderboardRank! - b.leaderboardRank!;
        return b.rankTier - a.rankTier;
      });
    }
  } catch (error) {
    console.error("Błąd ładowania danych na serwerze:", error);
  }

  return (
    <main className="relative bg-[#050505] text-slate-100 overflow-x-hidden">
      
      {/* BACKGROUND */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
        <ClientLightPillar topColor="#ff0000" bottomColor="#ff5500" intensity={0.7} rotationSpeed={0.2} glowAmount={0.002} pillarWidth={2.5} pillarHeight={0.3} noiseIntensity={0.5} pillarRotation={90} interactive={false} mixBlendMode="screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505]" />
      </div>

      <Navbar />

      <SteamLinkHandler />

      {/* LEADERBOARD CONTAINER */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-[30px] pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-start gap-4">
            <Image
              src={rankingIconSrc}
              alt="Ranking"
              width={2048}
              height={2048}
              className="h-[83px] w-[83px] object-contain shrink-0"
              priority
            />
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight">Ranking</h1>
              <p className="text-slate-400 text-xl">Najlepsi polscy gracze w naszej społeczności.</p>
              <p className="text-slate-500 text-sm mt-2 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> Profil gracza musi być ustawiony jako publiczny w ustawieniach gry Dota 2.
              </p>
              <p className="text-slate-500 text-sm mt-1.5 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" /> Lista top 5000 graczy z Polski pobierana jest z oficjalnego rankingu Dota 2 (narodowość: Polska). Z listy usunięto graczy, którzy ustawili polską flagę &bdquo;dla beki&rdquo;.
              </p>
            </div>
          </div>
          <div className="flex-shrink-0">
            <JoinSteamButton />
          </div>
        </div>

        {players.length === 0 ? (
          <div className="bg-slate-900/10 border border-white/5 rounded-3xl p-16 text-center backdrop-blur-md">
            <Users className="w-12 h-12 text-slate-500 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-slate-300 mb-2">Brak graczy w rankingu</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              Zainauguruj tabelę! Kliknij przycisk powyżej i zaloguj się przez Steam, aby wskoczyć do zestawienia.
            </p>
          </div>
        ) : (
          <RankingControls players={players} />
        )}

      </section>

    </main>
  );
}