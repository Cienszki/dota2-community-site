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
  { revalidate: 900 },
);

/** `getInhousePulseInputs` is already cached — this just applies the formula. */
export async function getInhousePulseScore(): Promise<number> {
  return computePulseScore(await getInhousePulseInputs());
}
