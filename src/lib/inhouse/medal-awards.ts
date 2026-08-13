import 'server-only';
import { getDb } from '@/lib/firebase-admin';
import { computeMedalStandings } from './medal-standings';
import type { Medal } from './medals';
import type { MatchRecord } from './match-record';

// Deriving medals from match history and writing them onto players.
//
// The ranking itself lives in `medal-standings.ts` — pure, no database — the
// same split as pulse.ts / pulse-stats.ts. This half fetches, converts and
// persists.
//
// ── Full recompute, not incremental ─────────────────────────────────────────
// Every run rebuilds the standings from the match records rather than adjusting
// running totals. More work per run, and the right trade at this size: the
// match records are the only source of truth, so the result cannot drift, a
// late Discord link retroactively credits old matches, and a re-parse that
// corrects a stat corrects the medals with it. Nothing needs backfilling and
// nothing needs repairing, because there is no second copy of the numbers to
// fall out of step.
//
// Cost is one full read of `inhouseMatches` plus `inhousePlayers` per run. At a
// few hundred matches that is trivial. Past a few thousand it stops being
// trivial, and the answer then is to keep per-player per-category totals on the
// player document and re-rank from those — worth doing once the reads actually
// show up on the bill, not before.
//
// ── When it runs ────────────────────────────────────────────────────────────
// After ingestion changes anything: the match-finished webhook and the ingest
// cron, both of which already invalidate the stats cache. It runs *before* that
// invalidation so the boards re-read the new medals rather than caching the old
// ones for another round.
//
// Both triggers matter. Six of the thirteen categories are `parseGated` and
// only get data once the replay is parsed, which the cron's parse pass picks
// up; the other seven are final the moment the match is ingested. Recomputing
// on either event means neither kind waits on the other.

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 400;

export interface MedalRecomputeResult {
  matchesScanned: number;
  playersConsidered: number;
  /** Players whose medal set actually changed, and so were written. */
  playersUpdated: number;
  /** Medals held across the community once this run is applied. */
  medalsHeld: number;
  /** Medals nobody held before this run — the ones worth announcing. */
  newlyAwarded: Array<{ discordId: string; medalId: string }>;
  /** Categories where nobody met the bar. */
  emptyCategories: string[];
}

/** Same medals, ignoring order — the only difference worth a write. */
function sameMedals(a: Medal[], b: Medal[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map((m) => m.id).sort();
  const right = b.map((m) => m.id).sort();
  return left.every((id, i) => id === right[i]);
}

/**
 * Recompute every medal from match history and write the changes.
 *
 * Idempotent: running it twice in a row writes nothing the second time.
 */
export async function recomputeMedals(
  options: { dryRun?: boolean } = {},
): Promise<MedalRecomputeResult> {
  const db = getDb();

  const [matchSnap, playerSnap] = await Promise.all([
    db.collection('inhouseMatches').get(),
    db.collection('inhousePlayers').get(),
  ]);

  // Steam account -> the person who owns it. Built from the player documents
  // rather than trusting `roster[].discordId`, which is a snapshot taken at
  // ingestion: someone who linked Discord last week has null on every match
  // they played before that, and those matches are still theirs.
  //
  // `steamIds` covers alts, so three accounts count as one player — the rule
  // listMatchesForPlayer and ban enforcement already use.
  const ownerOf = new Map<string, string>();
  for (const doc of playerSnap.docs) {
    const data = doc.data() as { steamIds?: string[]; steamId32?: string | null };
    const ids = data.steamIds?.length
      ? data.steamIds
      : data.steamId32
        ? [data.steamId32]
        : [];
    for (const id of ids) if (id) ownerOf.set(String(id), doc.id);
  }

  const matches = matchSnap.docs.map((doc) => doc.data() as MatchRecord);
  const { byPlayer, emptyCategories } = computeMedalStandings(matches, ownerOf);

  const now = new Date().toISOString();
  const newlyAwarded: MedalRecomputeResult['newlyAwarded'] = [];
  const pending: Array<{ ref: FirebaseFirestore.DocumentReference; medals: Medal[] }> = [];
  let medalsHeld = 0;

  for (const doc of playerSnap.docs) {
    const raw = (doc.data() as { medals?: unknown }).medals;
    const existing = Array.isArray(raw) ? (raw as Medal[]) : [];

    const next = (byPlayer.get(doc.id) ?? []).map((tier): Medal => {
      // Keep the original record for a medal they already hold. The catalogue
      // is explicit that renaming a medal must not rewrite history, and a fresh
      // awardedAt every run would republish the whole medal set to the recent-
      // awards feed on every single match.
      const alreadyHeld = existing.find((m) => m.id === tier.id);
      if (alreadyHeld) return alreadyHeld;

      newlyAwarded.push({ discordId: doc.id, medalId: tier.id });
      return {
        id: tier.id,
        label: tier.label,
        description: tier.description,
        place: tier.place,
        icon: tier.icon,
        // Null on purpose: MedalArt derives the artwork path from the id and
        // falls back to the icon when the file is missing, so a stored URL
        // would be a second source of truth that art arriving later can't fix.
        imageUrl: null,
        // All-time. When seasons arrive this carries the window label and the
        // medal id gains a period suffix — they change together, or a player
        // silently loses last season's medal to this season's winner.
        period: null,
        awardedAt: now,
      };
    });

    medalsHeld += next.length;
    if (sameMedals(existing, next)) continue;
    pending.push({ ref: doc.ref, medals: next });
  }

  if (!options.dryRun) {
    for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const { ref, medals } of pending.slice(i, i + BATCH_LIMIT)) {
        batch.set(ref, { medals }, { merge: true });
      }
      await batch.commit();
    }
  }

  return {
    matchesScanned: matchSnap.size,
    playersConsidered: playerSnap.size,
    playersUpdated: pending.length,
    medalsHeld,
    newlyAwarded,
    emptyCategories,
  };
}
