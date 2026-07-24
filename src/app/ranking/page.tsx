import type { Metadata } from 'next';
import { Users, Trophy, ShieldAlert, Info } from 'lucide-react';
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


export const revalidate = 259200;

interface PlayerData {
  id: number;
  steam_id: string;
  name: string;
  avatar: string;
  rankTier: number;
  leaderboardRank: number | null;
  winRate: string;
  mmr: number;
  trend: number;
  isOfficial: boolean;
}

const estimateMmrFromTier = (tier: number): number => {
  if (!tier || tier === 0) return 0;
  const baseRank = Math.floor(tier / 10);
  const stars = tier % 10;
  if (baseRank === 8) return 5600;
  const baseMmr = (baseRank - 1) * 760;
  const starsMmr = stars * 150;
  return baseMmr + starsMmr;
};

export default async function RankingPage() {
  let players: PlayerData[] = [];

  try {
    const { data: leaderboardEntries, error } = await supabase
      .from('ranking_leaderboard')
      .select('*');

    if (!error && leaderboardEntries && leaderboardEntries.length > 0) {
      let officialIndex = 0;

      const results = await Promise.all(
        leaderboardEntries.map(async (entry) => {
          if (entry.steam_id) {
            // Registered player — fetch live stats from OpenDota
            const id = parseInt(entry.steam_id, 10);

            const profileRes = await fetch(`https://api.opendota.com/api/players/${id}`);
            const profileData = await profileRes.json();

            const wlRes = await fetch(`https://api.opendota.com/api/players/${id}/wl?limit=100`);
            const wlData = await wlRes.json();
            const totalMatches = wlData.win + wlData.lose;
            const winRate = totalMatches > 0 ? ((wlData.win / totalMatches) * 100).toFixed(1) + '%' : '0%';

            const wl7DaysRes = await fetch(`https://api.opendota.com/api/players/${id}/wl?date=7`);
            const wl7DaysData = await wl7DaysRes.json();
            const trend = (wl7DaysData.win || 0) - (wl7DaysData.lose || 0);

            const openDotaEstimatedMmr = profileData.mmr_estimate?.estimate;
            const finalMmr = openDotaEstimatedMmr || estimateMmrFromTier(profileData.rank_tier || 0);

            return {
              id,
              steam_id: entry.steam_id,
              name: profileData.profile?.personaname || entry.name,
              avatar: profileData.profile?.avatarfull || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
              rankTier: profileData.rank_tier || 0,
              leaderboardRank: entry.leaderboard_rank ?? (profileData.leaderboard_rank || null),
              winRate,
              mmr: finalMmr,
              trend,
              isOfficial: false,
            };
          }

          // Official leaderboard entry (no steam_id) — use DB data as-is
          officialIndex++;
          return {
            id: -(officialIndex), // unique negative key
            steam_id: entry.steam_id ?? '',
            name: entry.name,
            avatar: entry.avatar ?? 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
            rankTier: 0,
            leaderboardRank: entry.leaderboard_rank ?? null,
            winRate: '0%',
            mmr: 0,
            trend: 0,
            isOfficial: true,
          };
        })
      );

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
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-red-600/10 rounded-xl flex items-center justify-center text-red-500 border border-red-500/20"><Trophy className="w-6 h-6" /></div>
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