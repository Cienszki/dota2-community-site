// src/inhouse/attendance.ts
// Result ingestion (§12) — the ledger the whole social layer rests on.
//
// The lobby being torn down by the GC is the match-end signal (this is what the
// tournament flow has always used). From there, two sources with different jobs:
//
//   1. **Steam Web API** — winner, duration, roster, heroes. Available within a
//      minute or two of the match ending. This writes the attendance ledger,
//      updates the player counters. Everything
//      that matters is done at this point and the game is `finished`.
//
//   2. **OpenDota** — courier deaths, time spent dead, tangos bought. Only
//      exists once the replay parses, which can lag by a long time and may
//      never happen. Used *solely* for the silly awards, and folded into the
//      game document whenever it turns up.
//
// Splitting them this way means a slow or missing OpenDota parse costs you a
// few jokes on the recap, not the ledger.
//
// Two things are load-bearing:
//
//  - **Attendance derives from the match, not from signups.** Signing up isn't
//    playing. Someone who reserved a slot and never entered the lobby gets no
//    credit; someone who walked in without ever pressing Join does.
//
//  - **Ingestion is eventually consistent, not synchronous.** It is a retrying
//    job with a give-up point, never a blocking call.

import type { InhouseStore } from './store';
import type { AttendanceRecord, InhouseGame } from './types';
import { selectAwards, type Award } from './awards';
import {
  abandoned,
  sideFromSlot as steamSideFromSlot,
  waitForMatchDetails,
  type SteamMatchDetails,
} from './steam-api';
import { logger } from './logger';

const OPENDOTA_BASE = process.env.OPENDOTA_BASE_URL || 'https://api.opendota.com/api';

export interface OpenDotaPlayer {
  account_id?: number;
  player_slot?: number;
  hero_id?: number;
  personaname?: string;
  [key: string]: unknown;
}

export interface OpenDotaMatch {
  match_id: number;
  radiant_win: boolean;
  duration: number;
  start_time: number;
  /** Present once the replay has been parsed. Many award metrics need it. */
  version?: number | null;
  players: OpenDotaPlayer[];
  [key: string]: unknown;
}

/** `player_slot` < 128 means Radiant. This is the OpenDota/Valve convention. */
export function sideFromSlot(playerSlot: number | undefined): 'radiant' | 'dire' {
  return (playerSlot ?? 0) < 128 ? 'radiant' : 'dire';
}

export async function fetchMatch(matchId: number): Promise<OpenDotaMatch | null> {
  const key = process.env.OPENDOTA_API_KEY;
  const url = `${OPENDOTA_BASE}/matches/${matchId}${key ? `?api_key=${encodeURIComponent(key)}` : ''}`;

  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (response.status === 404) return null;
    if (!response.ok) {
      logger.warn(`OpenDota returned ${response.status} for match ${matchId}`);
      return null;
    }

    const data = (await response.json()) as OpenDotaMatch;
    // OpenDota answers 200 with a mostly-empty body for matches it hasn't
    // ingested yet, so presence of the player array is the real readiness check.
    if (!Array.isArray(data.players) || data.players.length === 0) return null;
    return data;
  } catch (error) {
    logger.warn(`OpenDota fetch failed for match ${matchId}: ${String(error)}`);
    return null;
  }
}

export interface IngestOptions {
  /** Give up waiting for the Steam API after this long. Default 20 minutes. */
  maxWaitMs?: number;
  /** First poll delay. Default 15s, backing off to 2 min. */
  initialDelayMs?: number;
  /**
   * Also chase OpenDota for the parsed data the silly awards need.
   * Default true. Runs in the background and never delays the ledger.
   */
  fetchAwards?: boolean;
}

export interface IngestResult {
  gameId: string;
  matchId: number;
  attendance: AttendanceRecord[];
  awards: Award[];
  radiantWin: boolean;
  durationSeconds: number;
  /** True once OpenDota's parsed data has been folded in. */
  parsed: boolean;
  /** Steam IDs that abandoned the match, for the host and admins only. */
  abandoners: string[];
}

/**
 * Resolve a finished match and write everything derived from it.
 *
 * Called when the GC tears the lobby down, which is the match-end signal.
 *
 * Safe to call more than once for the same game: the ledger write is keyed on
 * (gameId, steamId32) and a pre-check short-circuits a completed ingestion, so
 * a retried job can't double-count anyone's attendance.
 */
export async function ingestMatchResult(
  store: InhouseStore,
  game: InhouseGame,
  matchId: number,
  options: IngestOptions = {}
): Promise<IngestResult | null> {
  if (await store.hasAttendance(game.id)) {
    logger.info(`Attendance for game ${game.id} already written — skipping ingestion`);
    return null;
  }

  const details = await waitForMatchDetails(matchId, {
    maxWaitMs: options.maxWaitMs ?? 20 * 60_000,
    initialDelayMs: options.initialDelayMs ?? 15_000,
  });

  if (!details) {
    logger.error(`Could not resolve match ${matchId} for game ${game.id}`);
    await store.transitionState(game.id, 'abandoned', { endReason: 'match result never arrived' });
    return null;
  }

  const result = await writeMatchResult(store, game, details);

  // Awards are cosmetic and OpenDota is slow, so this is deliberately detached:
  // the ledger and the player counters are already committed.
  if (options.fetchAwards !== false) {
    void backfillAwards(store, game.id, matchId).catch((error) => {
      logger.warn(`Award backfill failed for game ${game.id}: ${String(error)}`);
    });
  }

  return result;
}

/**
 * The write half of ingestion, split out so it can be driven from a webhook or
 * an admin re-run.
 */
export async function writeMatchResult(
  store: InhouseStore,
  game: InhouseGame,
  match: SteamMatchDetails
): Promise<IngestResult> {
  const playedOn = new Date(match.start_time * 1000).toISOString().slice(0, 10);

  const records: AttendanceRecord[] = [];
  const radiant: string[] = [];
  const dire: string[] = [];
  const abandoners: string[] = [];

  for (const player of match.players) {
    // Anonymous / private profiles come through as account_id 0 or absent. They
    // played, but we cannot attribute the row, so it is skipped rather than
    // written against a bogus ID.
    if (!player.account_id) continue;

    const steamId32 = String(player.account_id);
    const side = steamSideFromSlot(player.player_slot);
    (side === 'radiant' ? radiant : dire).push(steamId32);
    if (abandoned(player)) abandoners.push(steamId32);

    const linked = await store.findPlayerBySteamId(steamId32);
    records.push({
      gameId: game.id,
      steamId32,
      discordId: linked?.discordId ?? null,
      dotaMatchId: match.match_id,
      heroId: player.hero_id ?? null,
      side,
      won: side === 'radiant' ? match.radiant_win : !match.radiant_win,
      playedOn,
      createdAt: new Date().toISOString(),
    });
  }

  await store.writeAttendance(records);

  // ── Player counters ──
  for (const record of records) {
    if (!record.discordId) continue;
    const teammates = records
      .filter((r) => r.side === record.side && r.steamId32 !== record.steamId32)
      .map((r) => r.steamId32);
    await bumpPlayerTotals(store, record, teammates);
  }

  await store.updateGame(game.id, {
    dotaMatchId: match.match_id,
    result: {
      radiantWin: match.radiant_win,
      durationSeconds: match.duration,
      // Awards arrive later, if the replay parses at all.
      parsed: false,
      awards: [],
      abandoners,
      ingestedAt: new Date().toISOString(),
    },
  });
  await store.transitionState(game.id, 'finished');

  logger.info(
    `Ingested match ${match.match_id} for game ${game.id}: ` +
      `${records.length} attendance rows, ${abandoners.length} abandon(s)`
  );

  return {
    gameId: game.id,
    matchId: match.match_id,
    attendance: records,
    awards: [],
    radiantWin: match.radiant_win,
    durationSeconds: match.duration,
    parsed: false,
    abandoners,
  };
}

/**
 * Chase OpenDota for the parsed replay and fold the silly awards in.
 *
 * Entirely optional. Every metric the awards use — couriers lost, time spent
 * dead, tangos bought — only exists after the replay parses, and plenty of
 * matches never do. Nothing waits on this and nothing breaks without it.
 */
export async function backfillAwards(
  store: InhouseStore,
  gameId: string,
  matchId: number,
  maxWaitMs = 60 * 60_000
): Promise<Award[]> {
  const deadline = Date.now() + maxWaitMs;
  let delay = 2 * 60_000;

  while (Date.now() < deadline) {
    const match = await fetchMatch(matchId);
    const parsed = match?.version !== null && match?.version !== undefined;

    if (match && parsed) {
      const awards = selectAwards(
        match.players
          .filter((p) => p.account_id)
          .map((p) => ({
            steamId32: String(p.account_id),
            name: p.personaname || String(p.account_id),
            data: p,
          }))
      );

      const game = await store.getGame(gameId);
      await store.updateGame(gameId, {
        result: { ...(game?.result ?? {}), parsed: true, awards },
      });
      logger.info(`Backfilled ${awards.length} award(s) for game ${gameId}`);
      return awards;
    }

    await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
    delay = Math.min(delay * 1.5, 10 * 60_000);
  }

  logger.info(`Match ${matchId} never parsed — game ${gameId} keeps its recap without awards`);
  return [];
}

/**
 * Update the cumulative, non-rivalrous counters on a player profile (§10).
 *
 * Every counter here is monotonic and never decays. A number that drops when
 * you stop playing punishes people for having a life, and punishment reads as
 * obligation.
 */
async function bumpPlayerTotals(
  store: InhouseStore,
  record: AttendanceRecord,
  teammateSteamIds: string[]
): Promise<void> {
  const discordId = record.discordId;
  if (!discordId) return;

  const player = await store.getPlayer(discordId);
  if (!player) return;

  // A "night" is a distinct calendar day with at least one game.
  const isNewNight = player.lastPlayedAt?.slice(0, 10) !== record.playedOn;

  await store.upsertPlayer(discordId, {
    gamesPlayed: player.gamesPlayed + 1,
    nightsPlayed: player.nightsPlayed + (isNewNight ? 1 : 0),
    lastPlayedAt: record.createdAt,
    // A no-show credit back: reliable games auto-recover the marker (§9).
    noShowCount: Math.max(0, player.noShowCount - 1),
  });

  await store.recordTeammates(discordId, teammateSteamIds);
}

/**
 * Retroactive credit (§3).
 *
 * Because every inhouse is a league match, the full roster is on record. When
 * someone finally links, backfill their entire history — nothing else converts
 * a stubborn holdout as reliably as showing them what they've already earned.
 */
export async function backfillOnLink(
  store: InhouseStore,
  discordId: string,
  steamId32: string
): Promise<{ gamesFound: number; nightsFound: number; heroesFound: number }> {
  const history = await store.listAttendanceForSteamId(steamId32);

  const nights = new Set(history.map((r) => r.playedOn));
  const heroes = new Set(history.filter((r) => r.heroId !== null).map((r) => r.heroId));

  const player = await store.getPlayer(discordId);
  await store.upsertPlayer(discordId, {
    gamesPlayed: Math.max(player?.gamesPlayed ?? 0, history.length),
    nightsPlayed: Math.max(player?.nightsPlayed ?? 0, nights.size),
    heroesPlayed: Math.max(player?.heroesPlayed ?? 0, heroes.size),
    lastPlayedAt:
      history.length > 0
        ? history.map((r) => r.createdAt).sort().slice(-1)[0]
        : (player?.lastPlayedAt ?? null),
  });

  // Attach the Discord ID to the historical rows so future queries resolve.
  await store.attachDiscordIdToAttendance(steamId32, discordId);

  logger.info(`Backfilled ${history.length} games for ${discordId} (steam ${steamId32})`);
  return { gamesFound: history.length, nightsFound: nights.size, heroesFound: heroes.size };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
