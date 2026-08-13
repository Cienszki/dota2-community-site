import 'server-only';
import { unstable_cache } from 'next/cache';
import { getDb } from '@/lib/firebase-admin';
import { sortMedals, type Medal } from './medals';
import {
  ensureSteamProfile,
  type PlayerWithProfile,
  type SteamProfile,
} from './steam-profile';

// Participation stats only — never performance (§8). These are cumulative,
// non-rivalrous, monotonic counters; none can be improved by playing selfishly
// and none decay.
//
// ── When these recompute ────────────────────────────────────────────────────
// They used to expire on a 15-minute timer, which was wasted work: the numbers
// below are read off `inhousePlayers`, and nothing writes those counters except
// match ingestion. Between two matches the answer cannot change, so a timer
// only guarantees recomputing the same result four times an hour.
//
// They are now cached indefinitely and invalidated by event: ingestion calls
// `revalidateTag(STATS_TAG, { expire: 0 })` once a match lands. See
// `api/inhouse/matches/finished` and `api/cron/inhouse-ingest`.
//
// Not everything qualifies. `getInhousePulse` deliberately stays on a timer —
// it measures activity against a rolling baseline, so its inputs shrink as time
// passes with no new games. Event-driven invalidation would freeze a dead
// league at its last healthy reading forever. See the note in pulse-stats.ts.

/**
 * Cache tag for everything that changes only when a match is ingested.
 *
 * One tag rather than one per board: they share a single trigger, and a match
 * that moves `gamesPlayed` can move every other counter in the same write.
 */
export const STATS_TAG = 'inhouse-stats';

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
  // No timer: these counters only move when a match is ingested, and ingestion
  // invalidates STATS_TAG when one is.
  { revalidate: false, tags: [STATS_TAG] },
);

export interface PlayerOfWeek {
  name: string;
  gamesThisWeek: number;
  /** Null for a player whose Steam profile is private, unlinked or unfetched. */
  steam: SteamProfile | null;
}

/**
 * The most recently *completed* Monday-to-Sunday week, as an ISO range plus a
 * key identifying it.
 *
 * "Gracz tygodnia" is settled at the end of a week and then stands — which is
 * what the title claims, and what a rolling seven-day window quietly failed to
 * deliver: under that, today's winner could lose the title tomorrow because a
 * game aged out of the window, with nobody having played anything.
 *
 * A bounded range also makes the answer *deterministic*, and that is what lets
 * this be cached indefinitely with no persistence and no scheduled job. The
 * week key goes in the cache key, so the first visit after Sunday midnight
 * computes the new week; recomputing after a cache eviction re-reads the same
 * fixed range and returns the same winner. A rolling window could not be
 * cached this way without eventually contradicting itself.
 */
function lastCompletedWeek(now = Date.now()): { key: string; from: string; to: string } {
  const d = new Date(now);
  // getUTCDay: 0 = Sunday. Shift so Monday = 0, matching the Polish week.
  const dayIndex = (d.getUTCDay() + 6) % 7;

  const thisMonday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dayIndex * 86_400_000;
  const from = thisMonday - 7 * 86_400_000;

  return {
    key: new Date(from).toISOString().slice(0, 10),
    from: new Date(from).toISOString(),
    to: new Date(thisMonday).toISOString(),
  };
}

/** Most games attended in the last 7 days. Discord-linked players only — same
 *  scope as every other board here, all of which read `inhousePlayers`. */
const playerOfWeekFor = unstable_cache(
  async (week: { key: string; from: string; to: string }): Promise<PlayerOfWeek | null> => {
    const db = getDb();
    const snap = await db
      .collection('inhouseAttendance')
      .where('createdAt', '>=', week.from)
      .where('createdAt', '<', week.to)
      .get();

    const counts = new Map<string, number>();
    for (const doc of snap.docs) {
      const discordId = doc.data().discordId as string | null;
      if (!discordId) continue;
      counts.set(discordId, (counts.get(discordId) ?? 0) + 1);
    }
    if (counts.size === 0) return null;

    const [topId, gamesThisWeek] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const playerDoc = await db.collection('inhousePlayers').doc(topId).get();
    const player = playerDoc.data() as PlayerWithProfile | undefined;

    // Same self-healing read the profile page uses: returns the stored avatar,
    // and only reaches out to Steam when it is missing, stale, or belongs to an
    // account they no longer play on. Never throws — a card with an initial in
    // place of a photo is a smaller problem than a leaderboards page that fails.
    const steam = player ? await ensureSteamProfile(player) : null;

    return {
      name: player?.discordName ?? steam?.personaName ?? `Gracz ${topId.slice(0, 6)}`,
      gamesThisWeek,
      steam: steam ?? null,
    };
  },
  ['inhouse-player-of-week'],
  // The week key is an argument, so it is part of the cache key: a new week is
  // a cache miss and recomputes once, and every read inside the same week is a
  // hit. No timer and no scheduled job — the calendar does the invalidating.
  //
  // Not tagged with STATS_TAG on purpose. A match ingested today belongs to
  // *this* week, which this function doesn't report on until Monday, so busting
  // it on ingest would recompute a settled answer that cannot have changed.
  { revalidate: false },
);

/**
 * Player of the Week — the winner of the last completed Monday-to-Sunday week.
 *
 * Rolls over on Monday 00:00 UTC, on the first page view after that; nothing is
 * scheduled. Returns null when that week had no games at all, which the card
 * already renders as an empty state — better than showing a "winner" of a week
 * nobody played in.
 */
export async function getPlayerOfWeek(): Promise<PlayerOfWeek | null> {
  return playerOfWeekFor(lastCompletedWeek());
}

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
  // Medals are only ever awarded off the back of a match, so same trigger.
  { revalidate: false, tags: [STATS_TAG] },
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
