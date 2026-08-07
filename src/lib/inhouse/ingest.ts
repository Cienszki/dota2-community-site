import 'server-only';
import { getInhouseStore } from './store';
import { writeMatchResult, selectAwards } from './core';
import type { SteamMatchDetails } from './core';
import type { InhouseGame } from './core/types';
import {
  fetchLeagueMatches,
  fetchMatch,
  isParsed,
  isParseJobDone,
  requestParse,
  type OpenDotaMatchDetail,
} from './opendota';
import {
  extractStats,
  getMatchRecord,
  patchMatchRecord,
  putMatchRecord,
  type MatchRecord,
  type MatchRosterEntry,
} from './match-record';
import { mirrorMatchRecord } from './match-mirror';

// Result ingestion, website side.
//
// The lobby bot tells us a match finished; everything after that happens here.
// Two phases, deliberately separated because they run on wildly different
// timescales:
//
//   Phase 1 (seconds)  resolve the match from OpenDota, write the attendance
//                      ledger and player counters, write the match record, and
//                      ask OpenDota to parse the replay.
//   Phase 2 (minutes→hours, or never) once the parse lands, fold in the awards
//                      and mark the record parsed. Driven by the cron sweep.
//
// Phase 1 is what makes the game show up as played. Phase 2 is cosmetic — a
// match that never parses keeps its result, its ledger and its counters, and
// loses only the silly awards. Nothing waits on it.
//
// Every match record write here is followed by a best-effort mirror into
// Supabase (match-mirror.ts, migration 021) — Firestore is still the source
// of truth, the mirror exists purely so match data is queryable in plain SQL.
// A mirror failure never fails ingestion.
//
// The ledger write and the counter bumps go through the vendored core's
// `writeMatchResult` rather than being reimplemented here. That function is
// idempotent on (gameId, steamId32) and is shared with the bot; a second copy
// of "who played and what does it add to their profile" is exactly the kind of
// drift core/VENDORED.md exists to prevent.

/** How long after a match we keep retrying the initial OpenDota resolve. */
const RESOLVE_GIVE_UP_MS = 6 * 60 * 60_000;

/**
 * Replays expire from Valve's servers after roughly two weeks, after which no
 * parse will ever succeed. Well inside that, so a stuck record stops consuming
 * sweep budget rather than being retried forever.
 */
const PARSE_GIVE_UP_MS = 10 * 24 * 60 * 60_000;

export type IngestOutcome =
  | { status: 'ingested'; gameId: string; matchId: number; players: number }
  | { status: 'already_done'; gameId: string }
  | { status: 'not_ready'; gameId: string }
  | { status: 'gave_up'; gameId: string; reason: string }
  | { status: 'error'; gameId: string; reason: string };

/**
 * OpenDota's match shape is structurally what `writeMatchResult` expects from
 * the Steam Web API — same field names, same slot convention, same
 * `leaver_status`. Adapting rather than reimplementing means the ledger, the
 * counters and the abandon detection stay the bot's logic, not a lookalike.
 */
function toSteamShape(match: OpenDotaMatchDetail): SteamMatchDetails {
  return {
    match_id: match.match_id,
    radiant_win: match.radiant_win,
    duration: match.duration,
    start_time: match.start_time,
    lobby_type: match.lobby_type,
    leagueid: match.leagueid,
    players: match.players.map((p) => ({
      account_id: p.account_id ?? undefined,
      player_slot: p.player_slot,
      hero_id: p.hero_id,
      leaver_status: p.leaver_status,
    })),
  } as SteamMatchDetails;
}

async function buildRoster(match: OpenDotaMatchDetail): Promise<MatchRosterEntry[]> {
  const store = getInhouseStore();
  const roster: MatchRosterEntry[] = [];

  for (const p of match.players) {
    // Anonymous or private profiles arrive as account_id 0 or absent. They
    // played, but nothing can be attributed to them, so they are recorded
    // without an identity rather than against a bogus one.
    const steamId32 = p.account_id ? String(p.account_id) : null;
    const side = (p.player_slot ?? 0) < 128 ? 'radiant' : 'dire';
    const linked = steamId32 ? await store.findPlayerBySteamId(steamId32) : null;

    roster.push({
      steamId32,
      discordId: linked?.discordId ?? null,
      playerName: p.personaname ?? null,
      heroId: p.hero_id ?? null,
      side,
      won: side === 'radiant' ? match.radiant_win : !match.radiant_win,
      playerSlot: p.player_slot ?? null,
      leaverStatus: p.leaver_status ?? null,
      stats: extractStats(p as Record<string, unknown>),
    });
  }
  return roster;
}

/**
 * Phase 1 — resolve a finished match and write everything derived from it.
 *
 * Safe to call repeatedly for the same game: it short-circuits once a match
 * record exists, and the underlying ledger write is keyed on (gameId, steamId32)
 * so even a racing duplicate cannot double-count attendance.
 */
export async function ingestFinishedMatch(
  gameId: string,
  dotaMatchId?: number | null,
): Promise<IngestOutcome> {
  const store = getInhouseStore();

  const game = (await store.getGame(gameId)) as InhouseGame | null;
  if (!game) return { status: 'error', gameId, reason: 'game not found' };

  const matchId = dotaMatchId ?? game.dotaMatchId;
  if (!matchId) return { status: 'error', gameId, reason: 'no dotaMatchId' };

  if (await getMatchRecord(matchId)) return { status: 'already_done', gameId };

  const fetched = await fetchMatch(matchId);

  if (fetched.status !== 'ok') {
    // A match OpenDota has not ingested yet is the normal case in the first
    // minute or two. Only give up once it is old enough that it never will be.
    const age = Date.now() - Date.parse(game.endedAt ?? game.updatedAt ?? game.createdAt);
    if (fetched.status === 'not_found' && age > RESOLVE_GIVE_UP_MS) {
      await store.transitionState(gameId, 'abandoned', {
        endReason: 'wynik meczu nigdy nie dotarł',
      });
      return { status: 'gave_up', gameId, reason: 'match never appeared on OpenDota' };
    }
    return { status: 'not_ready', gameId };
  }

  const match = fetched.match;

  // Ledger, player counters, game.result and the transition to `finished` — all
  // of it the shared core's job, not ours.
  await writeMatchResult(store, game, toSteamShape(match));

  const nowIso = new Date().toISOString();
  const parsedAlready = isParsed(match);
  const roster = await buildRoster(match);

  const record: MatchRecord = {
    dotaMatchId: match.match_id,
    gameId,
    gameNumber: game.gameNumber,
    radiantWin: match.radiant_win,
    durationSeconds: match.duration,
    radiantScore: match.radiant_score ?? null,
    direScore: match.dire_score ?? null,
    startedAt: new Date(match.start_time * 1000).toISOString(),
    gameMode: match.game_mode ?? null,
    lobbyType: match.lobby_type ?? null,
    leagueId: match.leagueid ?? null,
    roster,
    parseState: parsedAlready ? 'parsed' : 'unparsed',
    parseJobId: null,
    parseRequestedAt: null,
    parsedAt: parsedAlready ? nowIso : null,
    ingestedAt: nowIso,
    updatedAt: nowIso,
  };
  await putMatchRecord(record);
  await mirrorMatchRecord(record);

  if (parsedAlready) {
    await foldInAwards(gameId, match);
  } else {
    // Nobody parses a replay unless it is asked for, so this is not optional
    // housekeeping — without it the awards data may never exist for our matches.
    const job = await requestParse(match.match_id);
    await patchMatchRecord(match.match_id, {
      parseState: 'requested',
      parseJobId: job?.jobId ?? null,
      parseRequestedAt: nowIso,
    });
  }

  return {
    status: 'ingested',
    gameId,
    matchId: match.match_id,
    players: roster.length,
  };
}

/**
 * Ingest a league match that was never an inhouse game here.
 *
 * The medals are derived from every match played in the league, and plenty of
 * those predate this website or were started from Discord — they have no
 * `inhouseGames` document to hang off, which is why match records are keyed on
 * the Dota match id rather than the game id.
 *
 * Deliberately narrower than `ingestFinishedMatch`: it writes the match record
 * and nothing else. No attendance ledger, no player counters, no game state.
 * Those belong to games this site actually ran; back-crediting `gamesPlayed`
 * from an arbitrary league history would silently rewrite every profile on the
 * site, and the ledger already has its own backfill-on-link path for that.
 */
export async function ingestLeagueMatch(matchId: number): Promise<'ingested' | 'skipped' | 'failed'> {
  if (await getMatchRecord(matchId)) return 'skipped';

  const fetched = await fetchMatch(matchId);
  if (fetched.status !== 'ok') return 'failed';

  const match = fetched.match;
  const nowIso = new Date().toISOString();
  const parsedAlready = isParsed(match);

  const record: MatchRecord = {
    dotaMatchId: match.match_id,
    gameId: null,
    gameNumber: null,
    radiantWin: match.radiant_win,
    durationSeconds: match.duration,
    radiantScore: match.radiant_score ?? null,
    direScore: match.dire_score ?? null,
    startedAt: new Date(match.start_time * 1000).toISOString(),
    gameMode: match.game_mode ?? null,
    lobbyType: match.lobby_type ?? null,
    leagueId: match.leagueid ?? null,
    roster: await buildRoster(match),
    parseState: parsedAlready ? 'parsed' : 'unparsed',
    parseJobId: null,
    parseRequestedAt: null,
    parsedAt: parsedAlready ? nowIso : null,
    ingestedAt: nowIso,
    updatedAt: nowIso,
  };
  await putMatchRecord(record);
  await mirrorMatchRecord(record);

  if (!parsedAlready) {
    const job = await requestParse(match.match_id);
    await patchMatchRecord(match.match_id, {
      parseState: 'requested',
      parseJobId: job?.jobId ?? null,
      parseRequestedAt: nowIso,
    });
  }

  return 'ingested';
}

/**
 * Walk a league's match list and ingest whatever is missing.
 *
 * Bounded per call, because a long-running league is hundreds of matches and
 * each one is a separate OpenDota fetch. Returns how far it got so the caller
 * can run it again — the dedupe is a document get, so re-running is cheap and
 * picks up where it left off.
 */
export async function backfillLeague(
  leagueId: number,
  limit = 25,
): Promise<{ found: number; ingested: number; skipped: number; failed: number }> {
  const matches = await fetchLeagueMatches(leagueId);
  if (!matches) return { found: 0, ingested: 0, skipped: 0, failed: 0 };

  let ingested = 0;
  let skipped = 0;
  let failed = 0;

  for (const summary of matches) {
    if (ingested + failed >= limit) break;
    const outcome = await ingestLeagueMatch(summary.match_id);
    if (outcome === 'ingested') ingested++;
    else if (outcome === 'skipped') skipped++;
    else failed++;
  }

  return { found: matches.length, ingested, skipped, failed };
}

/**
 * Phase 2 — check whether a requested parse has landed, and fold it in.
 *
 * Called by the cron sweep, once per pending record per run. Deliberately does
 * not loop or sleep: the website is request-scoped, and a job that may take
 * hours cannot be waited on inside one invocation.
 */
export async function checkParse(record: MatchRecord): Promise<'parsed' | 'waiting' | 'gave_up'> {
  const age = Date.now() - Date.parse(record.ingestedAt);
  if (age > PARSE_GIVE_UP_MS) {
    await patchMatchRecord(record.dotaMatchId, { parseState: 'unavailable' });
    return 'gave_up';
  }

  // The job endpoint is a cheap hint, not proof — it returns null for a job that
  // was dropped as well as one that finished. The match itself is authoritative,
  // so a "done" job only earns us a re-fetch.
  if (record.parseJobId && !(await isParseJobDone(record.parseJobId))) {
    return 'waiting';
  }

  const fetched = await fetchMatch(record.dotaMatchId);
  if (fetched.status !== 'ok') return 'waiting';

  if (!isParsed(fetched.match)) {
    // Job gone but the match still isn't parsed — the request was dropped.
    // Ask again; `unparsed` is what the sweep retries.
    if (record.parseState === 'requested') {
      const job = await requestParse(record.dotaMatchId);
      await patchMatchRecord(record.dotaMatchId, {
        parseJobId: job?.jobId ?? null,
        parseRequestedAt: new Date().toISOString(),
      });
    }
    return 'waiting';
  }

  // Re-extract stats: the parse is precisely what makes the second half of the
  // whitelist exist, so the roster written at ingestion is missing them.
  const roster = record.roster.map((entry, i) => {
    const player = fetched.match.players[i];
    if (!player) return entry;
    return { ...entry, stats: extractStats(player as Record<string, unknown>) };
  });

  const parsedAt = new Date().toISOString();
  if (record.gameId) await foldInAwards(record.gameId, fetched.match);
  await patchMatchRecord(record.dotaMatchId, { roster, parseState: 'parsed', parsedAt });
  await mirrorMatchRecord({ ...record, roster, parseState: 'parsed', parsedAt, updatedAt: parsedAt });
  return 'parsed';
}

/**
 * Put the silly awards on the game document.
 *
 * These live on the game rather than the match record because the public match
 * page already reads `game.result` for them, and because they are the one piece
 * of parsed data §10 sanctions: non-comparative, per-match, and forgotten by
 * the next game.
 */
async function foldInAwards(gameId: string, match: OpenDotaMatchDetail): Promise<void> {
  const store = getInhouseStore();
  const awards = selectAwards(
    match.players
      .filter((p) => p.account_id)
      .map((p) => ({
        steamId32: String(p.account_id),
        name: p.personaname || String(p.account_id),
        data: p as Record<string, unknown>,
      })),
  );

  const game = await store.getGame(gameId);
  if (!game?.result) return;
  await store.updateGame(gameId, {
    result: { ...game.result, parsed: true, awards },
  });
}
