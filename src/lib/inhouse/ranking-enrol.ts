import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getDb } from '@/lib/firebase-admin';
import type { AttendanceRecord, InhousePlayer } from './core/types';

// Putting inhouse players into the site's ranking.
//
// The ranking lives in Supabase (`ranking_leaderboard`) and is refreshed daily
// from OpenDota by scripts/sync-player-stats.mjs, which syncs **every row with
// a steam_id**. So enrolling somebody is just inserting the row — the stats
// arrive on the next run, and the sync job needs no change and no Firestore
// access of its own.
//
// Who qualifies: anyone who has played an inhouse (whether or not they ever
// linked anything), and anyone who has linked, whether or not they have played.
//
// **Enrolment is a sweep, not a hook.** Accounts get linked four ways and two
// of them run inside the bot, so a hook on the website's link paths would cover
// half of them and quietly miss the rest — the same trap the Steam avatars hit.
// Reconciling the whole set on a schedule is path-agnostic and self-correcting:
// whatever happened while nobody was looking is picked up on the next pass.

/** How many Steam IDs a single sweep will look at. */
const SWEEP_LIMIT = 500;

export interface EnrolResult {
  candidates: number;
  excluded: number;
  alreadyListed: number;
  added: number;
}

/**
 * Steam IDs that have asked never to be listed.
 *
 * Checked before every insert. Deleting a ranking row on its own would not
 * hold — the next inhouse they played would put it straight back, which from
 * the player's side is being ignored rather than removed.
 */
export async function getExcludedSteamIds(steamIds: string[]): Promise<Set<string>> {
  if (steamIds.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from('ranking_exclusions')
    .select('steam_id')
    .in('steam_id', steamIds);

  if (error) {
    // Fail closed: if the opt-out list can't be read we add nobody, rather than
    // re-listing someone who asked to be removed.
    console.error('ranking enrol: exclusion lookup failed', error);
    throw new Error('exclusion lookup failed');
  }
  return new Set((data ?? []).map((r) => r.steam_id as string));
}

/**
 * Add these Steam IDs to the ranking if they aren't there and aren't excluded.
 *
 * Names are a courtesy — the sync job overwrites them with the OpenDota persona
 * on its next run — but a row that says "Gracz 35747920" until then is worse
 * than one that already says something a human recognises.
 */
export async function enrolSteamIds(
  players: Array<{ steamId32: string; name?: string | null }>,
): Promise<EnrolResult> {
  const unique = new Map<string, string | null>();
  for (const p of players) {
    if (!p.steamId32) continue;
    // First non-empty name wins; later duplicates don't clobber it with null.
    if (!unique.has(p.steamId32) || (!unique.get(p.steamId32) && p.name)) {
      unique.set(p.steamId32, p.name ?? null);
    }
  }
  const ids = [...unique.keys()];
  const result: EnrolResult = { candidates: ids.length, excluded: 0, alreadyListed: 0, added: 0 };
  if (ids.length === 0) return result;

  const excluded = await getExcludedSteamIds(ids);
  result.excluded = excluded.size;

  const { data: existing, error: readError } = await supabaseAdmin
    .from('ranking_leaderboard')
    .select('steam_id')
    .in('steam_id', ids);
  if (readError) {
    console.error('ranking enrol: could not read existing rows', readError);
    throw new Error('ranking read failed');
  }
  const listed = new Set((existing ?? []).map((r) => r.steam_id as string));
  result.alreadyListed = listed.size;

  const rows = ids
    .filter((id) => !excluded.has(id) && !listed.has(id))
    .map((id) => ({
      steam_id: id,
      name: unique.get(id) || `Gracz ${id}`,
      is_inhouse: true,
      // Not `is_registered`: they have not signed up for anything. And no
      // leaderboard_rank, so the ranking page sorts them by rank_tier below the
      // official top list, which is where they belong.
      is_registered: false,
    }));

  if (rows.length === 0) return result;

  // Insert, not upsert: an existing row may carry a leaderboard_rank or a
  // registration this must not overwrite. `ignoreDuplicates` covers the race
  // where somebody registers between the read above and this write.
  const { error: writeError } = await supabaseAdmin
    .from('ranking_leaderboard')
    .upsert(rows, { onConflict: 'steam_id', ignoreDuplicates: true });

  if (writeError) {
    console.error('ranking enrol: insert failed', writeError);
    throw new Error('ranking insert failed');
  }

  result.added = rows.length;
  return result;
}

/**
 * Reconcile everyone the inhouse system knows about against the ranking.
 *
 * Two sources, deliberately: the attendance ledger covers everyone who has
 * actually played — which is most people, and most of them never linked
 * anything — while `inhousePlayers` covers those who linked but have not played
 * yet. Neither alone is the whole set.
 */
export async function sweepRankingEnrolment(): Promise<EnrolResult> {
  const candidates: Array<{ steamId32: string; name?: string | null }> = [];

  const attendance = await getDb()
    .collection('inhouseAttendance')
    .orderBy('createdAt', 'desc')
    .limit(SWEEP_LIMIT)
    .get();
  for (const doc of attendance.docs) {
    const row = doc.data() as AttendanceRecord;
    if (row.steamId32) candidates.push({ steamId32: row.steamId32 });
  }

  const players = await getDb().collection('inhousePlayers').limit(SWEEP_LIMIT).get();
  for (const doc of players.docs) {
    const p = doc.data() as InhousePlayer;
    for (const id of p.steamIds ?? []) {
      candidates.push({ steamId32: id, name: p.discordName });
    }
  }

  return enrolSteamIds(candidates);
}

/**
 * Take someone out of the ranking and keep them out.
 *
 * Both halves matter and the order does: record the exclusion first, so a
 * concurrent sweep cannot re-add the row between the delete and the insert.
 */
export async function excludeFromRanking(
  steamIds: string[],
  opts: { reason?: string | null; excludedBy?: string | null } = {},
): Promise<void> {
  const ids = steamIds.filter(Boolean);
  if (ids.length === 0) return;

  const { error: insertError } = await supabaseAdmin.from('ranking_exclusions').upsert(
    ids.map((id) => ({
      steam_id: id,
      reason: opts.reason ?? null,
      excluded_by: opts.excludedBy ?? null,
      excluded_at: new Date().toISOString(),
    })),
    { onConflict: 'steam_id' },
  );
  if (insertError) throw new Error(`could not record exclusion: ${insertError.message}`);

  const { error: deleteError } = await supabaseAdmin
    .from('ranking_leaderboard')
    .delete()
    .in('steam_id', ids);
  if (deleteError) throw new Error(`could not remove from ranking: ${deleteError.message}`);
}

/** Lift an exclusion. Does not re-add the row — the next sweep does that. */
export async function restoreToRanking(steamIds: string[]): Promise<void> {
  const ids = steamIds.filter(Boolean);
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin.from('ranking_exclusions').delete().in('steam_id', ids);
  if (error) throw new Error(`could not lift exclusion: ${error.message}`);
}

/**
 * Ranking membership and opt-out state for a set of accounts.
 *
 * Reports `available: false` rather than pretending when migration 024 has not
 * been run — otherwise every account would render as "not in ranking", which is
 * indistinguishable from the truth and would have an admin excluding people who
 * were never listed.
 */
export async function getRankingStatus(steamIds: string[]): Promise<{
  available: boolean;
  statuses: Map<string, { listed: boolean; excluded: boolean; isInhouse: boolean }>;
}> {
  const statuses = new Map<string, { listed: boolean; excluded: boolean; isInhouse: boolean }>();
  const ids = steamIds.filter(Boolean);
  if (ids.length === 0) return { available: true, statuses };

  const [listedRes, excludedRes] = await Promise.all([
    supabaseAdmin.from('ranking_leaderboard').select('steam_id,is_inhouse').in('steam_id', ids),
    supabaseAdmin.from('ranking_exclusions').select('steam_id').in('steam_id', ids),
  ]);

  if (listedRes.error || excludedRes.error) {
    console.error(
      'ranking status unavailable — has migration 024 been run?',
      listedRes.error ?? excludedRes.error,
    );
    return { available: false, statuses };
  }

  const excluded = new Set((excludedRes.data ?? []).map((r) => r.steam_id as string));
  const listed = new Map(
    (listedRes.data ?? []).map((r) => [r.steam_id as string, Boolean(r.is_inhouse)]),
  );

  for (const id of ids) {
    statuses.set(id, {
      listed: listed.has(id),
      excluded: excluded.has(id),
      isInhouse: listed.get(id) ?? false,
    });
  }
  return { available: true, statuses };
}
