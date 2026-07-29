import type { Metadata } from 'next';
import { Trophy } from 'lucide-react';
import Navbar from '@/components/Navbar';
import LightRays from '@/components/ui/LightRays';
import TrophyRoom, { type TournamentData, type PlayerInfo } from '@/components/TrophyRoom';
import { supabase } from '@/lib/supabase';

export const metadata: Metadata = {
  title: 'Hall of Fame - Sala Chwały Turniejów',
  description: 'Sala chwały i historia zwycięzców naszych turniejów Dota 2 od początku istnienia społeczności Polish Dota2 Inhouse (2022).',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpenDotaProfile {
  personaname: string;
  avatarfull: string;
}

interface OpenDotaResponse {
  profile: OpenDotaProfile | null;
}

interface DbPlayer {
  name: string;
  friend_id?: number;
  is_substitute: boolean;
}

interface DbTournament {
  id: string;
  tournament_name: string;
  tournament_date: string;
  tournament_id: string;
  dotabuff_link: string;
  team_name: string;
  players: DbPlayer[];
  image_url: string | null; // ← kolumna z Supabase Storage
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async function fetchPlayer(friendId: number): Promise<PlayerInfo> {
  try {
    const response = await fetch(
      `https://api.opendota.com/api/players/${friendId}`,
      { next: { revalidate: 86400 } },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: OpenDotaResponse = await response.json();
    return {
      friendId,
      name: '',
      personaname: data.profile?.personaname ?? null,
      avatarfull: data.profile?.avatarfull ?? null,
    };
  } catch {
    return { friendId, name: '', personaname: null, avatarfull: null };
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function HallOfFamePage() {
  const { data: dbTournaments, error } = await supabase
    .from('hall_of_fame_tournaments')
    .select('*')
    .eq('status', 'published')
    .order('tournament_date', { ascending: false });

  if (error || !dbTournaments) {
    console.error('Failed to fetch hall of fame tournaments:', error?.message);
  }

  const tournaments: DbTournament[] = (dbTournaments ?? []) as DbTournament[];

  // Collect unique friend_ids
  const allFriendIds = new Set<number>();
  for (const t of tournaments) {
    for (const p of t.players) {
      if (p.friend_id != null) allFriendIds.add(p.friend_id);
    }
  }

  // Fetch OpenDota profiles
  const playerInfoMap = new Map<number, PlayerInfo>();
  const results = await Promise.all(Array.from(allFriendIds).map(fetchPlayer));
  for (const info of results) {
    playerInfoMap.set(info.friendId!, info);
  }

  // Shape data — image_url from Supabase has full priority
  const tournamentData: TournamentData[] = tournaments.map((t) => ({
    name: t.tournament_name,
    date: t.tournament_date,
    teamName: t.team_name || (t.players.find((p) => !p.is_substitute)?.name ?? ''),
    dotabuffLink: t.dotabuff_link,
    tournamentId: t.tournament_id,
    imageUrl: t.image_url ?? null,
    players: t.players.map((p) => {
      const fetched = p.friend_id != null ? playerInfoMap.get(p.friend_id) : undefined;
      return {
        friendId: p.friend_id,
        name: p.name,
        personaname: fetched?.personaname ?? null,
        avatarfull: fetched?.avatarfull ?? null,
        isSubstitute: p.is_substitute,
      };
    }),
  }));

  return (
    <main className="relative min-h-screen bg-[#050505] text-slate-100 overflow-x-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
        <LightRays
          raysOrigin="top-center"
          raysColor="#ffffff"
          raysSpeed={1}
          lightSpread={1.3}
          rayLength={2.3}
          followMouse={true}
          mouseInfluence={0.1}
          noiseAmount={0.05}
          distortion={0.03}
          pulsating={false}
          fadeDistance={1.8}
          saturation={1.0}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505]" />
      </div>

      <Navbar />

      <section className="relative z-10 text-center pt-[30px] pb-8 px-6">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4 drop-shadow-lg">
          Hall of Fame
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          {tournamentData.length > 0
            ? 'Zwycięzcy naszych dotychczasowych turniejów Dota 2.'
            : 'Brak zapisanych turniejów — wróć później.'}
        </p>
      </section>

      {tournamentData.length > 0 ? (
        <TrophyRoom tournaments={tournamentData} />
      ) : (
        <section className="relative z-10 max-w-7xl mx-auto px-6 py-16">
          <div className="bg-[#17181c]/50 border border-white/[0.06] rounded-3xl p-16 text-center backdrop-blur-md">
            <div className="w-16 h-16 mx-auto mb-5 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-400 border border-amber-500/25">
              <Trophy className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-slate-200 mb-2">Brak turniejów w bazie</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              Historia zwycięzców pojawi się tutaj, gdy dodasz pierwszy turniej w panelu admina.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
