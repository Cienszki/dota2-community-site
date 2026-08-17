// Browser-safe projection of a game document.
//
// The raw `inhouseGames/{id}` record holds `lobbyPassword`, `botAccountId` and
// the full unpublished-game record — none of which may cross to the client
// (§2.2, §6.3). Everything the browser is allowed to see goes through
// `toPublicGame`, and nothing else. This module is pure (no Admin SDK), so it
// is safe to import from both the SSE route and client components.

import type { GameState, SlotSnapshot } from './core/types';

// ── Server-action result shapes ─────────────────────────────────────────────
//
// These describe what `joinLobbyFor` and `openLobbyFor` hand back, so they
// belong beside those functions — and they used to. They live here because the
// client components that render them cannot reach them any other way.
//
// The obvious route, re-exporting them from the `'use server'` action module
// the client already imports, does not work: every export of a `'use server'`
// file is registered as a server function, and this fork's compiler runs that
// transform before the TypeScript type-only re-export is erased. The emitted
// module then references a type as a value and dies on load with
// `ReferenceError: JoinInfo is not defined` — taking the whole route with it,
// because a module that throws while evaluating never finishes.
//
// The other route, importing them straight from join-lobby.ts / open-lobby.ts,
// means a client component naming a `server-only` module. `import type` is
// erased so it would work, but it puts the Admin SDK one careless edit away
// from the browser bundle — exactly what this module exists to prevent.
//
// So: declared here, re-exported by both server modules for their own callers.
// A `'use server'` file must export nothing but async functions.

/** The outcome of pressing Join, on either surface. */
export type JoinResult =
  | { status: 'needs_link' }
  | { status: 'unavailable' }
  | { status: 'banned' }
  | { status: 'not_open' }
  | { status: 'locked' }
  | { status: 'error' }
  | { status: 'waitlisted'; position: number }
  | {
      status: 'reserved' | 'already_reserved' | 'in_lobby';
      password: string | null;
      lobbyName: string | null;
      expiresAt: string | null;
      slotsOpen: number | null;
    };

/** What a join dialog needs to render, on either surface. */
export type JoinInfo =
  | { status: 'unavailable' | 'not_found' | 'not_open' }
  | { status: 'banned' }
  | {
      status: 'ok';
      /** Name to search for in Dota's lobby browser. */
      lobbyName: string | null;
      /** Null only when no password has been configured yet. */
      password: string | null;
      /** DOTA_GameMode and EServerRegion — both are filters in Dota's lobby
       *  browser, so the manual path needs them as much as the name. */
      gameMode: number;
      serverRegion: number;
      /** Whether the bot can pull this player in without them typing anything. */
      canBeInvited: boolean;
      hasSteam: boolean;
      hasDiscord: boolean;
      name: string | null;
    };

/** The outcome of opening a lobby, on either surface. */
export type CreateResult =
  /**
   * The credentials travel back with the result. The website reads them off the
   * game page instead, but a Discord host opening a *private* lobby has no card
   * and no page in front of them — this is the only moment they can be told
   * what to send their friends.
   */
  | { status: 'ok'; gameId: string; lobbyName: string | null; lobbyPassword: string | null }
  | { status: 'banned' }
  | { status: 'no_bots' }
  | { status: 'too_many_open'; max: number }
  | { status: 'unavailable' }
  | { status: 'error' };

/** What a signed-out visitor is allowed to know about a game. */
export interface PublicGame {
  id: string;
  gameNumber: number;
  initiatorName: string;
  /**
   * The lobby's in-game name — what a player types into Dota's lobby browser.
   *
   * Public on purpose, unlike the password: the name is how the most common
   * join path works at all (§3.1), and the lobby is only listed in the browser
   * once the game is published anyway.
   */
  lobbyName: string | null;
  /**
   * Display names of the players currently sitting in the lobby, in seating
   * order. Assembled from the memberships sub-collection by the server — the
   * slot snapshot carries Steam IDs only, and a Steam ID is not a name.
   */
  roster: string[];
  /**
   * Dota match ID, once the match has launched. Safe to publish — these are
   * league games, so the match is publicly retrievable by design, and this is
   * what makes an outbound Dotabuff link possible.
   */
  dotaMatchId: number | null;
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
  lobbyName?: string | null;
  dotaMatchId?: number | null;
  state: GameState;
  newcomerFriendly: boolean;
  published: boolean;
  scheduledFor: string | null;
  createdAt: string;
  endedAt: string | null;
  settings: { gameMode: number; serverRegion: number; dotaTvDelay: number; leagueId?: number };
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
export function toPublicGame(g: GameLike, roster: string[] = []): PublicGame {
  return {
    id: g.id,
    gameNumber: g.gameNumber,
    initiatorName: g.initiatorName,
    lobbyName: g.lobbyName ?? null,
    roster,
    dotaMatchId: g.dotaMatchId ?? null,
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
