import 'server-only';

// OpenDota client.
//
// OpenDota is the single source for match facts now that ingestion lives on the
// website rather than in the bot. Two things about it shape everything here:
//
//   1. **A match arrives in stages.** Shortly after it ends OpenDota has the
//      basics — winner, duration, score, roster, heroes. The deep data
//      (lane roles, teamfights, time spent dead, purchase logs) only exists once
//      the *replay* has been parsed, which is a separate job that may take
//      minutes, hours, or never happen at all. `version` is the readiness flag.
//
//   2. **Parsing is opt-in.** A replay is not parsed unless somebody asks. If we
//      never POST /request, the awards data may simply never exist for our
//      matches. Requesting it is our job, and it is why this module exists at
//      all rather than just calling fetch inline.
//
// Nothing here throws on a bad response. Ingestion is a retrying background job
// with a give-up point, never a blocking call, so every failure mode is a return
// value the caller can act on.

const BASE = process.env.OPENDOTA_BASE_URL || 'https://api.opendota.com/api';
const TIMEOUT_MS = 15_000;

/** Per-player row. Deliberately narrow — see `docs/lobby-bot-integration.md`. */
export interface OpenDotaMatchPlayer {
  account_id?: number | null;
  player_slot?: number;
  hero_id?: number;
  personaname?: string | null;
  leaver_status?: number;
  /** Everything else OpenDota sends, for stats we haven't committed to yet. */
  [key: string]: unknown;
}

export interface OpenDotaMatchDetail {
  match_id: number;
  radiant_win: boolean;
  duration: number;
  start_time: number;
  /** Kill score. Present without a parse. */
  radiant_score?: number;
  dire_score?: number;
  game_mode?: number;
  lobby_type?: number;
  leagueid?: number;
  /** Replay-parse version. Null/absent means the replay has not been parsed. */
  version?: number | null;
  players: OpenDotaMatchPlayer[];
  [key: string]: unknown;
}

export type MatchFetch =
  | { status: 'ok'; match: OpenDotaMatchDetail }
  /** OpenDota knows nothing about this match id yet — retry later. */
  | { status: 'not_ready' }
  /** 404, or a match id that will never resolve. */
  | { status: 'not_found' }
  | { status: 'error'; retryable: boolean };

function url(path: string): string {
  const key = process.env.OPENDOTA_API_KEY;
  const sep = path.includes('?') ? '&' : '?';
  return `${BASE}${path}${key ? `${sep}api_key=${encodeURIComponent(key)}` : ''}`;
}

/** True once the replay has been parsed and the deep fields exist. */
export function isParsed(match: Pick<OpenDotaMatchDetail, 'version'>): boolean {
  return match.version !== null && match.version !== undefined;
}

/**
 * Fetch a match.
 *
 * OpenDota answers 200 with a mostly-empty body for a match it has heard of but
 * not ingested, so an empty player array is the real readiness check — a 200 is
 * not enough on its own.
 */
export async function fetchMatch(matchId: number): Promise<MatchFetch> {
  try {
    const res = await fetch(url(`/matches/${matchId}`), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });

    if (res.status === 404) return { status: 'not_found' };
    if (res.status === 429) return { status: 'error', retryable: true };
    if (!res.ok) return { status: 'error', retryable: res.status >= 500 };

    const data = (await res.json()) as OpenDotaMatchDetail | null;
    if (!data || !Array.isArray(data.players) || data.players.length === 0) {
      return { status: 'not_ready' };
    }
    return { status: 'ok', match: data };
  } catch (err) {
    console.error(`opendota: fetch failed for match ${matchId}`, err);
    return { status: 'error', retryable: true };
  }
}

/** One row of a league's match list. Enough to decide whether to fetch it. */
export interface LeagueMatchSummary {
  match_id: number;
  start_time: number;
  duration: number;
  radiant_win: boolean;
}

/**
 * Every match OpenDota has for a league, newest first.
 *
 * This is what makes a backfill possible at all. OpenDota exposes no aggregate
 * "totals for league X" — the totals have to be built by walking the league's
 * matches and reading each one — but it does enumerate the matches, so nothing
 * needs the Steam Web API for this.
 *
 * Unbounded: a long-running league returns its whole history in one response.
 * The caller decides how much of it to act on.
 */
export async function fetchLeagueMatches(leagueId: number): Promise<LeagueMatchSummary[] | null> {
  try {
    const res = await fetch(url(`/leagues/${leagueId}/matches`), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`opendota: league ${leagueId} matches returned ${res.status}`);
      return null;
    }
    const data = (await res.json()) as LeagueMatchSummary[] | null;
    if (!Array.isArray(data)) return null;
    return data.sort((a, b) => b.start_time - a.start_time);
  } catch (err) {
    console.error(`opendota: league match list failed for ${leagueId}`, err);
    return null;
  }
}

/** One row of OpenDota's hero constants list. */
export interface OpenDotaHero {
  id: number;
  /** Valve's internal name, e.g. `npc_dota_hero_antimage`. */
  name: string;
  localized_name: string;
}

/**
 * The full hero list. Unauthenticated, unkeyed to a match, and effectively
 * static — it only changes on a patch — so the caller is expected to cache
 * this well beyond a single request (see `heroes.ts`) rather than call it
 * inline per render.
 */
export async function fetchHeroes(): Promise<OpenDotaHero[] | null> {
  try {
    const res = await fetch(url('/heroes'), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 24 * 60 * 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenDotaHero[] | null;
    return Array.isArray(data) ? data : null;
  } catch (err) {
    console.error('opendota: heroes fetch failed', err);
    return null;
  }
}

/**
 * Ask OpenDota to parse a match's replay.
 *
 * Returns the job id, which can be polled with `isParseJobDone`. Idempotent
 * from our side — requesting a parse for an already-parsed match is harmless
 * and simply returns a job that completes immediately.
 *
 * Replays expire from Valve's servers after about two weeks, so a parse
 * requested much later than that will never succeed. Request early.
 */
export async function requestParse(matchId: number): Promise<{ jobId: number } | null> {
  try {
    const res = await fetch(url(`/request/${matchId}`), {
      method: 'POST',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`opendota: parse request for ${matchId} returned ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { job?: { jobId?: number } } | null;
    const jobId = data?.job?.jobId;
    return typeof jobId === 'number' ? { jobId } : null;
  } catch (err) {
    console.error(`opendota: parse request failed for match ${matchId}`, err);
    return null;
  }
}

/**
 * Whether a parse job has finished.
 *
 * OpenDota returns the job while it is queued or running, and a bare `null`
 * once it is gone. "Gone" means finished *or* dropped, so a true here is a
 * prompt to re-fetch the match and check `version` — never proof of a parse on
 * its own.
 */
export async function isParseJobDone(jobId: number): Promise<boolean> {
  try {
    const res = await fetch(url(`/request/${jobId}`), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = (await res.json()) as unknown;
    return data === null;
  } catch {
    // Treat an unreachable job endpoint as "still running" — the caller re-checks
    // the match itself anyway, which is the authoritative signal.
    return false;
  }
}
