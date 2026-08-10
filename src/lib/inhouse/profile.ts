import 'server-only';
import { getDb } from '@/lib/firebase-admin';
import { getInhouseStore } from './store';
import { listMatchesForPlayer, type MatchRecord } from './match-record';
import { ensureSteamProfile, type PlayerWithProfile, type SteamProfile } from './steam-profile';
import { getHeroMap, type HeroInfo } from './heroes';
import { sortMedals, type Medal } from './medals';

// Everything the profile card on /inhouse needs, in one call.
//
// The card replaces the "how to join" steps for a viewer who has linked their
// accounts — those instructions only ever earn their space once, and after that
// the same slot is better spent telling someone what they've actually done.

/** How many matches the card lists. */
const RECENT_MATCHES = 5;

export interface ProfileMatch {
  dotaMatchId: number;
  gameId: string | null;
  gameNumber: number | null;
  lobbyName: string | null;
  startedAt: string;
  durationSeconds: number;
  radiantWin: boolean;
  radiantScore: number | null;
  direScore: number | null;
  /** The viewer's own line in this match. */
  you: {
    hero: HeroInfo | null;
    side: 'radiant' | 'dire';
    won: boolean;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
  };
  /** Both teams, for the detail view. Heroes and names only — see below. */
  radiant: ProfileMatchPlayer[];
  dire: ProfileMatchPlayer[];
}

export interface ProfileMatchPlayer {
  steamId32: string | null;
  name: string;
  hero: HeroInfo | null;
  /** True for the viewer's own row, so the detail view can mark it. */
  isYou: boolean;
}

export interface InhouseProfile {
  discordId: string;
  displayName: string;
  steam: SteamProfile | null;
  gamesPlayed: number;
  /** 1-based position on the games-played board. Null when they've played none. */
  rank: number | null;
  matches: ProfileMatch[];
  /** Awarded by an admin task, newest first. Empty until one has run. */
  medals: Medal[];
}

/**
 * Where this player sits on the games-played board.
 *
 * A count of everyone strictly ahead, plus one — an aggregation query, so it
 * costs one billed read regardless of how many players there are, and it stays
 * exact instead of being capped at whatever the leaderboard page happens to
 * fetch. Ties share a position, which is the behaviour people expect.
 */
async function rankByGamesPlayed(gamesPlayed: number): Promise<number | null> {
  if (gamesPlayed <= 0) return null;
  try {
    const ahead = await getDb()
      .collection('inhousePlayers')
      .where('gamesPlayed', '>', gamesPlayed)
      .count()
      .get();
    return ahead.data().count + 1;
  } catch (err) {
    console.error('inhouse profile: rank query failed', err);
    return null;
  }
}

function nameFor(entry: { steamId32: string | null; playerName: string | null }): string {
  return entry.playerName?.trim() || (entry.steamId32 ? `Gracz ${entry.steamId32}` : 'Anonim');
}

function toProfileMatch(
  record: MatchRecord,
  mySteamIds: Set<string>,
  heroes: Record<number, HeroInfo>,
): ProfileMatch | null {
  const mine = record.roster.find((r) => r.steamId32 && mySteamIds.has(r.steamId32));
  // The query matched on `playerSteamIds`, so this should always resolve; if the
  // projection and the roster ever disagree, skipping beats rendering a row
  // whose "you" half is invented.
  if (!mine) return null;

  const hero = (id: number | null) => (id ? (heroes[id] ?? { name: `Hero ${id}`, icon: null }) : null);
  const toPlayer = (r: (typeof record.roster)[number]): ProfileMatchPlayer => ({
    steamId32: r.steamId32,
    name: nameFor(r),
    hero: hero(r.heroId),
    isYou: Boolean(r.steamId32 && mySteamIds.has(r.steamId32)),
  });

  const stats = mine.stats ?? {};
  return {
    dotaMatchId: record.dotaMatchId,
    gameId: record.gameId,
    gameNumber: record.gameNumber,
    lobbyName: record.lobbyName ?? null,
    startedAt: record.startedAt,
    durationSeconds: record.durationSeconds,
    radiantWin: record.radiantWin,
    radiantScore: record.radiantScore,
    direScore: record.direScore,
    you: {
      hero: hero(mine.heroId),
      side: mine.side,
      won: mine.won,
      // Null rather than 0 when absent: OpenDota simply may not have sent it,
      // and a rendered "0/0/0" is a claim we can't stand behind.
      kills: typeof stats.kills === 'number' ? stats.kills : null,
      deaths: typeof stats.deaths === 'number' ? stats.deaths : null,
      assists: typeof stats.assists === 'number' ? stats.assists : null,
    },
    radiant: record.roster.filter((r) => r.side === 'radiant').map(toPlayer),
    dire: record.roster.filter((r) => r.side === 'dire').map(toPlayer),
  };
}

/**
 * Assemble the profile for a linked viewer, or null when there isn't one.
 *
 * Returns null rather than a half-profile when the person has no Discord
 * session or no linked Steam account — the caller falls back to the
 * instructions, which is the right thing for someone who hasn't linked.
 */
export async function getInhouseProfile(discordId: string | null): Promise<InhouseProfile | null> {
  if (!discordId) return null;

  try {
    const player = (await getInhouseStore().getPlayer(discordId)) as PlayerWithProfile | null;
    if (!player) return null;

    const steamIds = player.steamIds?.length
      ? player.steamIds
      : player.steamId32
        ? [player.steamId32]
        : [];
    if (steamIds.length === 0) return null;

    const [steam, rank, records, heroes] = await Promise.all([
      ensureSteamProfile(player),
      rankByGamesPlayed(player.gamesPlayed ?? 0),
      listMatchesForPlayer(steamIds, RECENT_MATCHES),
      getHeroMap(),
    ]);

    const mySteamIds = new Set(steamIds);
    const matches = records
      .map((r) => toProfileMatch(r, mySteamIds, heroes))
      .filter((m): m is ProfileMatch => m !== null);

    return {
      discordId,
      // The server nickname first, then the Steam persona — §3.1a's order.
      displayName: player.discordName?.trim() || steam?.personaName?.trim() || 'Gracz',
      steam: steam ?? null,
      gamesPlayed: player.gamesPlayed ?? 0,
      rank,
      matches,
      medals: sortMedals(
        Array.isArray((player as { medals?: Medal[] }).medals)
          ? ((player as { medals?: Medal[] }).medals as Medal[])
          : [],
      ),
    };
  } catch (err) {
    // The profile is an enhancement to the page, never a prerequisite for it.
    console.error('inhouse profile load failed', err);
    return null;
  }
}
