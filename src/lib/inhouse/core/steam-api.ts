// src/inhouse/steam-api.ts
// Steam Web API match details — the authoritative, immediate result source.
//
// This is the same endpoint the tournament app already uses to close out a game
// and open the next one in a series. It answers within seconds of a match
// ending, which OpenDota does not: OpenDota has to ingest the match first, and
// parse the replay after that.
//
// So the two sources have different jobs:
//
//   Steam Web API  → winner, duration, roster, heroes. Needed immediately, to
//                    write the attendance ledger and the player counters.
//   OpenDota       → courier deaths, time spent dead, tangos bought. Only
//                    available after the replay parses, and only used for the
//                    silly awards, which nobody is waiting on.
//
// Losing OpenDota degrades the recap. Losing this loses the ledger, so it is
// retried harder and failures are logged loudly.

import { logger } from './logger';

const STEAM_API_BASE =
  process.env.STEAM_API_BASE_URL || 'https://api.steampowered.com/IDOTA2Match_570';

export interface SteamMatchPlayer {
  account_id?: number;
  player_slot: number;
  hero_id?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  leaver_status?: number;
  [key: string]: unknown;
}

export interface SteamMatchDetails {
  match_id: number;
  radiant_win: boolean;
  duration: number;
  start_time: number;
  lobby_type?: number;
  leagueid?: number;
  players: SteamMatchPlayer[];
  [key: string]: unknown;
}

/** `player_slot` < 128 means Radiant — the Valve convention. */
export function sideFromSlot(playerSlot: number | undefined): 'radiant' | 'dire' {
  return (playerSlot ?? 0) < 128 ? 'radiant' : 'dire';
}

/**
 * `leaver_status` 0 = stayed to the end, 1 = disconnected, 2+ = abandoned.
 *
 * Worth keeping: an abandon is the difference between "played a game" and "made
 * nine other people waste an hour", and it is the only reliable signal for it.
 */
export function abandoned(player: SteamMatchPlayer): boolean {
  return (player.leaver_status ?? 0) >= 2;
}

export class SteamApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'SteamApiError';
  }
}

/**
 * Fetch match details once.
 *
 * Returns null when the match exists but Valve isn't serving it yet — which
 * happens for a minute or two after a game ends, and is the normal case when
 * polling starts immediately on lobby teardown.
 *
 * Throws `SteamApiError` for configuration problems (missing or rejected key)
 * so they surface instead of looking like an unfinished match forever.
 */
export async function fetchMatchDetails(matchId: number | string): Promise<SteamMatchDetails | null> {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    throw new SteamApiError(
      'STEAM_API_KEY is not set — match results cannot be resolved',
      false
    );
  }

  const url = `${STEAM_API_BASE}/GetMatchDetails/v1/?key=${encodeURIComponent(key)}&match_id=${matchId}`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (error) {
    // Network blip — worth retrying.
    throw new SteamApiError(`Steam API unreachable: ${String(error)}`, true);
  }

  if (response.status === 401 || response.status === 403) {
    throw new SteamApiError('Steam API key was rejected (401/403)', false);
  }
  if (response.status === 429 || response.status >= 500) {
    throw new SteamApiError(`Steam API returned ${response.status}`, true);
  }
  if (!response.ok) {
    throw new SteamApiError(`Steam API returned ${response.status}`, false);
  }

  const body = (await response.json()) as { result?: Record<string, unknown> };
  const result = body.result;
  if (!result) return null;

  // Valve reports "not ready yet" as an error object inside a 200 response.
  if (typeof result.error === 'string') {
    logger.debug(`Steam API not ready for match ${matchId}: ${result.error}`);
    return null;
  }
  if (!Array.isArray(result.players) || result.players.length === 0) return null;

  return result as unknown as SteamMatchDetails;
}

/**
 * Poll until the match resolves.
 *
 * Starts fast, because a match that just ended usually appears within a minute,
 * and backs off so a match that is never going to resolve costs little.
 */
export async function waitForMatchDetails(
  matchId: number | string,
  options: { maxWaitMs?: number; initialDelayMs?: number } = {}
): Promise<SteamMatchDetails | null> {
  const maxWaitMs = options.maxWaitMs ?? 20 * 60_000;
  const deadline = Date.now() + maxWaitMs;
  let delay = options.initialDelayMs ?? 15_000;

  while (Date.now() < deadline) {
    try {
      const details = await fetchMatchDetails(matchId);
      if (details) return details;
    } catch (error) {
      if (error instanceof SteamApiError && !error.retryable) {
        logger.error(`Match ${matchId} cannot be resolved: ${error.message}`);
        return null;
      }
      logger.warn(`Retrying match ${matchId}: ${String(error)}`);
    }

    await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
    delay = Math.min(delay * 1.5, 2 * 60_000);
  }

  logger.error(`Gave up resolving match ${matchId} from the Steam API`);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
