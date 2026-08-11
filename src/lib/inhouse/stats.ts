import 'server-only';
import { unstable_cache } from 'next/cache';
import { getDb } from '@/lib/firebase-admin';
import { sortMedals, type Medal } from './medals';

// Participation stats only — never performance (§8). These are cumulative,
// non-rivalrous, monotonic counters; none can be improved by playing selfishly
// and none decay. Cached 15 min (§10.5) — nothing here is time-critical.

export interface LeaderRow {
  discordId: string;
  name: string;
  steamId32: string | null;
  value: number;
  /** Awards this player holds, for the badges beside their name. */
  medals: Medal[];
}

export interface Leaderboards {
  gamesPublished: LeaderRow[];
  gamesPlayed: LeaderRow[];
  nightsPlayed: LeaderRow[];
  distinctTeammates: LeaderRow[];
  heroesPlayed: LeaderRow[];
}

async function topBy(field: keyof Leaderboards, limit = 10): Promise<LeaderRow[]> {
  const snap = await getDb().collection('inhousePlayers').orderBy(field, 'desc').limit(limit).get();
  return snap.docs
    .map((d) => {
      const p = d.data();
      return {
        discordId: d.id,
        name: (p.discordName as string) ?? `Gracz ${d.id.slice(0, 6)}`,
        steamId32: (p.steamId32 as string | null) ?? null,
        value: (p[field] as number) ?? 0,
        medals: sortMedals(Array.isArray(p.medals) ? (p.medals as Medal[]) : []),
      };
    })
    .filter((r) => r.value > 0);
}

export const getLeaderboards = unstable_cache(
  async (): Promise<Leaderboards> => ({
    // gamesPublished featured first — the one deliberate incentive (§8.2).
    gamesPublished: await topBy('gamesPublished'),
    gamesPlayed: await topBy('gamesPlayed'),
    nightsPlayed: await topBy('nightsPlayed'),
    distinctTeammates: await topBy('distinctTeammates'),
    heroesPlayed: await topBy('heroesPlayed'),
  }),
  ['inhouse-leaderboards'],
  { revalidate: 900 },
);

export interface CommunityStats {
  totalGames: number;
  gamesThisMonth: number;
  activePlayers7d: number;
  distinctInitiatorsThisWeek: number;
}

export const getCommunityStats = unstable_cache(
  async (): Promise<CommunityStats> => {
    const db = getDb();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [totalSnap, monthSnap, attendanceSnap, gamesWeekSnap] = await Promise.all([
      db.collection('inhouseGames').where('state', '==', 'finished').count().get(),
      db
        .collection('inhouseGames')
        .where('state', '==', 'finished')
        .where('endedAt', '>=', monthStart.toISOString())
        .count()
        .get(),
      db.collection('inhouseAttendance').where('createdAt', '>=', weekAgo).get(),
      db.collection('inhouseGames').where('createdAt', '>=', weekAgo).get(),
    ]);

    const active = new Set(attendanceSnap.docs.map((d) => d.data().steamId32 as string));
    const initiators = new Set(
      gamesWeekSnap.docs.map((d) => d.data().initiatorDiscordId as string).filter(Boolean),
    );

    return {
      totalGames: totalSnap.data().count,
      gamesThisMonth: monthSnap.data().count,
      activePlayers7d: active.size,
      distinctInitiatorsThisWeek: initiators.size,
    };
  },
  ['inhouse-community-stats'],
  { revalidate: 900 },
);

const WEEKDAYS_PL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

/** Most-played weekday from a set of ISO date strings (YYYY-MM-DD), §8.3. */
export function mostPlayedWeekday(playedOnDates: string[]): string | null {
  if (!playedOnDates.length) return null;
  const freq = new Array(7).fill(0);
  for (const d of playedOnDates) {
    const day = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (day >= 0 && day <= 6) freq[day]++;
  }
  let best = 0;
  for (let i = 1; i < 7; i++) if (freq[i] > freq[best]) best = i;
  return freq[best] > 0 ? WEEKDAYS_PL[best] : null;
}
