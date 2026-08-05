// Browser-safe projection of a game document.
//
// The raw `inhouseGames/{id}` record holds `lobbyPassword`, `botAccountId` and
// the full unpublished-game record — none of which may cross to the client
// (§2.2, §6.3). Everything the browser is allowed to see goes through
// `toPublicGame`, and nothing else. This module is pure (no Admin SDK), so it
// is safe to import from both the SSE route and client components.

import type { GameState, SlotSnapshot } from './core/types';

/** What a signed-out visitor is allowed to know about a game. */
export interface PublicGame {
  id: string;
  gameNumber: number;
  initiatorName: string;
  state: GameState;
  newcomerFriendly: boolean;
  published: boolean;
  scheduledFor: string | null;
  createdAt: string;
  endedAt: string | null;
  settings: {
    gameMode: number;
    serverRegion: number;
    dotaTvDelay: number;
  };
  slots: SlotSnapshot | null;
  result: PublicResult | null;
}

/** Finished-game result, with abandoners deliberately stripped (§6.4). */
export interface PublicResult {
  radiantWin: boolean;
  durationSeconds: number;
  parsed: boolean;
  awards: Array<{ id: string; steamId32: string; text: string }>;
  ingestedAt: string;
}

// A structural subset of InhouseGame — kept local so this file needs no
// server-only import. The server passes a full InhouseGame; the extra fields
// are simply ignored.
interface GameLike {
  id: string;
  gameNumber: number;
  initiatorName: string;
  state: GameState;
  newcomerFriendly: boolean;
  published: boolean;
  scheduledFor: string | null;
  createdAt: string;
  endedAt: string | null;
  settings: { gameMode: number; serverRegion: number; dotaTvDelay: number };
  slotSnapshot?: SlotSnapshot | null;
  result?: {
    radiantWin: boolean;
    durationSeconds: number;
    parsed: boolean;
    awards: Array<{ id: string; steamId32: string; text: string }>;
    ingestedAt: string;
  } | null;
}

/**
 * Strip a game document to the public projection.
 *
 * NEVER included: lobbyPassword, botAccountId, discord.*, initiatorDiscordId,
 * publishedByDiscordId, the full settings (leagueId, gates, ban ladder), and
 * `result.abandoners` (host/admin only).
 */
export function toPublicGame(g: GameLike): PublicGame {
  return {
    id: g.id,
    gameNumber: g.gameNumber,
    initiatorName: g.initiatorName,
    state: g.state,
    newcomerFriendly: g.newcomerFriendly,
    published: g.published,
    scheduledFor: g.scheduledFor,
    createdAt: g.createdAt,
    endedAt: g.endedAt,
    settings: {
      gameMode: g.settings.gameMode,
      serverRegion: g.settings.serverRegion,
      dotaTvDelay: g.settings.dotaTvDelay,
    },
    slots: g.slotSnapshot ?? null,
    result: g.result
      ? {
          radiantWin: g.result.radiantWin,
          durationSeconds: g.result.durationSeconds,
          parsed: g.result.parsed,
          awards: g.result.awards,
          ingestedAt: g.result.ingestedAt,
        }
      : null,
  };
}
