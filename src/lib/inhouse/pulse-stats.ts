import 'server-only';
import { unstable_cache } from 'next/cache';
import { getDb } from '@/lib/firebase-admin';
import { getHeroMap } from './heroes';
import { computePulseScore, type PulseInputs } from './pulse';

// Firestore side of the Puls Ligi Inhouse gauge — six numbers, each read from
// whichever collection already tracks it. See pulse.ts for what they feed
// into and why.
//
// Windows (decided with the requester rather than assumed):
//   "this week"        rolling 7 days, matching every other "this week" stat
//                       on the site (getPlayerOfWeek, the old activePlayers7d).
//   3-week baseline     the 3 full weeks BEFORE this one (days 8-28 ago), not
//                       including it — comparing a week against a baseline
//                       that partly contains itself would flatter every week.
//   quality window      the last 28 days, for mix% and hero entropy — a wider
//                       sample than "this week" alone so a single quiet or
//                       chaotic week doesn't swing the whole score.

const DAY_MS = 86_400_000;
const QUALITY_WINDOW_DAYS = 28;
const BASELINE_WINDOW_DAYS = 28;

/**
 * How much history the baseline needs before a score means anything.
 *
 * Every input here is a comparison against the 3 weeks before this one, so a
 * league younger than that is measured against almost nothing: with 3 finished
 * games in the baseline, `avgGames` is 1.0 and `avgPlayers` 3.3, which makes an
 * ordinary week of 2 games and 10 players read as a ratio of 3.0 and pins the
 * gauge at its maximum. The number isn't wrong so much as meaningless — it is
 * measuring the league's youth, not its activity.
 *
 * So below this threshold the gauge reports no score at all rather than a
 * flattering one.
 */
const HISTORY_REQUIRED_DAYS = 28;

function isoAt(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

async function countFinishedGames(
  db: FirebaseFirestore.Firestore,
  sinceMsAgo: number,
  untilMsAgo?: number,
): Promise<number> {
  let q = db.collection('inhouseGames').where('state', '==', 'finished').where('endedAt', '>=', isoAt(sinceMsAgo));
  if (untilMsAgo !== undefined) {
    q = q.where('endedAt', '<', isoAt(untilMsAgo));
  }
  const snap = await q.count().get();
  return snap.data().count;
}

/** Every distinct medal — well, player — in `inhouseAttendance` over a window. */
async function attendanceInRange(
  db: FirebaseFirestore.Firestore,
  sinceMsAgo: number,
  untilMsAgo?: number,
): Promise<FirebaseFirestore.QuerySnapshot> {
  let q = db.collection('inhouseAttendance').where('createdAt', '>=', isoAt(sinceMsAgo));
  if (untilMsAgo !== undefined) {
    q = q.where('createdAt', '<', isoAt(untilMsAgo));
  }
  return q.get();
}

/**
 * Whether the league has enough history for the baseline to mean anything.
 *
 * Two conditions, and both matter. The first finished game must be at least 4
 * weeks old — that is the league having a past at all. And the baseline window
 * itself must contain at least one game, because a month-old league that went
 * quiet for three weeks has a past but not a comparable one.
 *
 * Deliberately keyed on the league's age rather than on "every one of the last
 * 4 weeks had a game": a single quiet week — holidays, a patch nobody liked —
 * must not throw the gauge back to "collecting data" a year in.
 */
async function hasEnoughHistory(db: FirebaseFirestore.Firestore): Promise<boolean> {
  const [oldest, baselineGames] = await Promise.all([
    db
      .collection('inhouseGames')
      .where('state', '==', 'finished')
      .orderBy('endedAt', 'asc')
      .limit(1)
      .get(),
    countFinishedGames(db, BASELINE_WINDOW_DAYS * DAY_MS, 7 * DAY_MS),
  ]);

  if (oldest.empty || baselineGames === 0) return false;

  const firstEndedAt = Date.parse(oldest.docs[0].data().endedAt as string);
  if (Number.isNaN(firstEndedAt)) return false;

  return Date.now() - firstEndedAt >= HISTORY_REQUIRED_DAYS * DAY_MS;
}

export const getInhousePulseInputs = unstable_cache(
  async (): Promise<PulseInputs> => {
    const db = getDb();
    const qualityStart = QUALITY_WINDOW_DAYS * DAY_MS;
    const baselineStart = BASELINE_WINDOW_DAYS * DAY_MS;
    const oneWeek = 7 * DAY_MS;

    const [
      games,
      baselineGamesTotal,
      thisWeekAttendance,
      baselineAttendance,
      matchesSnap,
      heroMap,
    ] = await Promise.all([
      countFinishedGames(db, oneWeek),
      countFinishedGames(db, baselineStart, oneWeek),
      attendanceInRange(db, oneWeek),
      attendanceInRange(db, baselineStart, oneWeek),
      db.collection('inhouseMatches').where('startedAt', '>=', isoAt(qualityStart)).get(),
      getHeroMap(),
    ]);

    const players = new Set(
      thisWeekAttendance.docs.map((d) => d.data().steamId32 as string | undefined).filter(Boolean),
    ).size;

    const avgGames = baselineGamesTotal / 3;

    // Distinct players per week only averages correctly if each of the 3
    // baseline weeks is counted separately — the same 20 regulars showing up
    // 3 weeks running must average to ~20, not to a third of that.
    const weekBuckets: Array<Set<string>> = [new Set(), new Set(), new Set()];
    for (const doc of baselineAttendance.docs) {
      const steamId = doc.data().steamId32 as string | undefined;
      if (!steamId) continue;
      const createdAt = Date.parse(doc.data().createdAt as string);
      if (Number.isNaN(createdAt)) continue;
      const weeksAgo = Math.floor((Date.now() - createdAt - oneWeek) / oneWeek);
      if (weeksAgo >= 0 && weeksAgo <= 2) weekBuckets[weeksAgo].add(steamId);
    }
    const avgPlayers = weekBuckets.reduce((sum, wk) => sum + wk.size, 0) / 3;

    // Mix składów: of every pair possible among players active in the quality
    // window, how many have actually shared a lobby in it. Entropia: Shannon
    // entropy of hero picks in the same window, as % of the max a fully even
    // spread across every hero would reach.
    const activePool = new Set<string>();
    const realizedPairs = new Set<string>();
    const heroCounts = new Map<number, number>();
    let totalPicks = 0;

    for (const doc of matchesSnap.docs) {
      const data = doc.data();
      const ids = ((data.playerSteamIds as string[] | undefined) ?? []).filter(Boolean);
      for (const id of ids) activePool.add(id);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
          realizedPairs.add(`${a}|${b}`);
        }
      }

      const roster = (data.roster as Array<{ heroId: number | null }> | undefined) ?? [];
      for (const entry of roster) {
        if (entry.heroId == null) continue;
        heroCounts.set(entry.heroId, (heroCounts.get(entry.heroId) ?? 0) + 1);
        totalPicks++;
      }
    }

    const poolSize = activePool.size;
    const possiblePairs = (poolSize * (poolSize - 1)) / 2;
    const mixPercent = possiblePairs > 0 ? (realizedPairs.size / possiblePairs) * 100 : 0;

    let entropy = 0;
    for (const count of heroCounts.values()) {
      const p = count / totalPicks;
      entropy -= p * Math.log(p);
    }
    // The real, current hero count — not a hardcoded one — so a new release
    // doesn't quietly drift the % scale.
    const heroCount = Math.max(Object.keys(heroMap).length, 2);
    const maxEntropy = Math.log(heroCount);
    const heroEntropyPercent = totalPicks > 0 ? Math.min(100, (entropy / maxEntropy) * 100) : 0;

    return { games, avgGames, players, avgPlayers, mixPercent, heroEntropyPercent };
  },
  ['inhouse-pulse-inputs'],
  // Stays on a timer, unlike the leaderboards next door.
  //
  // The pulse measures a rolling window against a three-week baseline, so its
  // inputs change as time passes even when nothing is played — that is the
  // whole point of a gauge that can fall. Invalidating it on match ingest
  // instead would freeze a league that stopped playing at its last healthy
  // reading, which is the one number it must never show.
  //
  // An hour rather than 15 minutes: it moves slowly by construction, and the
  // sub-hour precision was only ever costing Firestore reads.
  { revalidate: 3600 },
);

export interface PulseReading {
  /** null while the league is too young for the baseline to mean anything. */
  score: number | null;
}

/**
 * The reading the gauge renders.
 *
 * Cached alongside the inputs rather than inside them, because the readiness
 * check is two extra Firestore reads that would otherwise run on every request
 * to /inhouse.
 */
export const getInhousePulse = unstable_cache(
  async (): Promise<PulseReading> => {
    if (!(await hasEnoughHistory(getDb()))) return { score: null };
    return { score: computePulseScore(await getInhousePulseInputs()) };
  },
  ['inhouse-pulse-reading'],
  // Same reasoning as the inputs above — time-based on purpose.
  { revalidate: 3600 },
);
