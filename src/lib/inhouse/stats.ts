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
    // 30, not the default 10: this is the leaderboards page's main board, the
    // one column with room for a long list. Also used sliced-to-5 on the
    // /inhouse landing page, which the larger fetch doesn't affect.
    gamesPlayed: await topBy('gamesPlayed', 30),
    nightsPlayed: await topBy('nightsPlayed'),
    distinctTeammates: await topBy('distinctTeammates'),
    heroesPlayed: await topBy('heroesPlayed'),
  }),
  ['inhouse-leaderboards'],
  { revalidate: 900 },
);

export interface PlayerOfWeek {
  name: string;
  gamesThisWeek: number;
}

/** Most games attended in the last 7 days. Discord-linked players only — same
 *  scope as every other board here, all of which read `inhousePlayers`. */
export const getPlayerOfWeek = unstable_cache(
  async (): Promise<PlayerOfWeek | null> => {
    const db = getDb();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const snap = await db.collection('inhouseAttendance').where('createdAt', '>=', weekAgo).get();

    const counts = new Map<string, number>();
    for (const doc of snap.docs) {
      const discordId = doc.data().discordId as string | null;
      if (!discordId) continue;
      counts.set(discordId, (counts.get(discordId) ?? 0) + 1);
    }
    if (counts.size === 0) return null;

    const [topId, gamesThisWeek] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const playerDoc = await db.collection('inhousePlayers').doc(topId).get();
    const name = (playerDoc.data()?.discordName as string | undefined) ?? `Gracz ${topId.slice(0, 6)}`;

    return { name, gamesThisWeek };
  },
  ['inhouse-player-of-week'],
  { revalidate: 900 },
);

export interface RecentMedalAward {
  playerName: string;
  medal: Medal;
}

const RECENT_MEDALS_LIMIT = 3;

/** Newest awards across the whole community, for the leaderboards page's
 *  medal feed. Small collection, full scan — same cost profile as `topBy`. */
export const getRecentMedalAwards = unstable_cache(
  async (): Promise<RecentMedalAward[]> => {
    const snap = await getDb().collection('inhousePlayers').get();
    const awards: RecentMedalAward[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      const medals = Array.isArray(data.medals) ? (data.medals as Medal[]) : [];
      const playerName = (data.discordName as string | undefined) ?? `Gracz ${doc.id.slice(0, 6)}`;
      for (const medal of medals) awards.push({ playerName, medal });
    }
    awards.sort((a, b) => (b.medal.awardedAt ?? '').localeCompare(a.medal.awardedAt ?? ''));
    return awards.slice(0, RECENT_MEDALS_LIMIT);
  },
  ['inhouse-recent-medals'],
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
