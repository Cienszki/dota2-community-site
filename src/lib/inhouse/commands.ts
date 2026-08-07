import 'server-only';
import { getDb } from '@/lib/firebase-admin';
import { getInhouseStore } from './store';
import type { InhouseGame, ResolvedSettings } from './core/types';

// Everything the website asks the lobby worker to do, in one typed place.
//
// Commands go to `botCommands/{botAccountId}/queue`. The worker holding that
// Steam account picks them up, executes them against the Game Coordinator, and
// writes the outcome back onto the game document — the website never talks to
// the GC and never learns whether a command succeeded except by watching the
// game document change.
//
// Two rules the queue depends on, both easy to break silently:
//
//   1. `createdAt` MUST be an ISO string. The worker parses it with `new Date()`
//      and drops anything older than five minutes. A Firestore Timestamp here
//      produces a command that is accepted, stored, and never executed.
//   2. A command needs a `botAccountId`. A game that has not been leased an
//      account yet has nobody to receive it, so `dispatch` refuses rather than
//      writing into a queue no worker is reading.
//
// Most state changes are NOT commands — publishing, locking and settings edits
// are plain field updates on the game document that the bot watches (§5.2).
// Only things that require the GC belong here.

/** The lobby settings a worker needs to open a Dota lobby. */
export interface LobbySpec {
  /** Lobby name, shown in Dota's lobby browser. */
  name: string | null;
  /** Password required to enter. */
  password: string | null;
  /** DOTA_GameMode enum. */
  gameMode: number;
  /** EServerRegion enum. */
  serverRegion: number;
  /** DotaTV broadcast delay, seconds. */
  dotaTvDelay: number;
  /** League ID. 0 means the match will NOT be publicly retrievable. */
  leagueId: number;
  /** 0 = manual, 1 = coin flip for side and first pick. */
  selectionPriorityRules: number;
  /** DOTALobbyVisibility is derived from `published`, not set here. */
  published: boolean;
  cheatsEnabled: boolean;
  fillWithBots: boolean;
  allowSpectators: boolean;
  /** 0 = unlimited, 1 = limited, 2 = disabled. */
  pauseSetting: number;
}

export type BotCommand =
  | { type: 'create_inhouse_lobby'; gameId: string; lobby: LobbySpec }
  | {
      type: 'invite_player';
      gameId: string;
      steamId32: string;
      discordId: string | null;
      playerName: string | null;
    }
  | { type: 'kick_player'; gameId: string; steamId32: string; reason: string | null }
  | { type: 'start_game'; gameId: string }
  | { type: 'send_chat'; gameId: string; message: string }
  | { type: 'end_inhouse_session'; gameId: string; reason: string | null }
  | { type: 'ingest_match_result'; gameId: string; dotaMatchId: number | null };

/**
 * Build the lobby spec for a game.
 *
 * Redundant by design: every field here is already on the game document, and
 * the worker is free to ignore the payload and read the document instead — that
 * remains the authoritative copy. It is included because a command that carries
 * its own inputs can be logged, replayed and diffed without a second read, and
 * because it makes the create contract legible in one place instead of implied.
 *
 * The one thing that is NOT sent is lobby visibility. It is derived from
 * `published` on the worker side so the two can never disagree (see
 * `lobbyVisibilityFor` in core/settings).
 */
export function lobbySpecFor(game: {
  lobbyName: string | null;
  lobbyPassword: string | null;
  published: boolean;
  settings: ResolvedSettings;
}): LobbySpec {
  const s = game.settings;
  return {
    name: game.lobbyName,
    password: game.lobbyPassword,
    gameMode: s.gameMode,
    serverRegion: s.serverRegion,
    dotaTvDelay: s.dotaTvDelay,
    leagueId: s.leagueId,
    selectionPriorityRules: s.selectionPriorityRules,
    published: game.published,
    cheatsEnabled: s.cheatsEnabled,
    fillWithBots: s.fillWithBots,
    allowSpectators: s.allowSpectators,
    pauseSetting: s.pauseSetting,
  };
}

/**
 * Send a command to the worker holding a game's Steam account.
 *
 * Returns false when the game has no leased account. That is a real state — a
 * game in `draft`, or one whose lease was force-released — and callers should
 * treat it as "the lobby isn't there", not as an error to retry.
 */
export async function dispatch(
  botAccountId: string | null | undefined,
  command: BotCommand,
): Promise<boolean> {
  if (!botAccountId) {
    console.warn(`inhouse: dropping ${command.type} for ${command.gameId} — no bot account leased`);
    return false;
  }
  await getInhouseStore().enqueueBotCommand(botAccountId, command);
  return true;
}

/** Ask the worker to open the Dota lobby for a freshly created game. */
export async function requestLobbyCreation(game: InhouseGame): Promise<boolean> {
  return dispatch(game.botAccountId, {
    type: 'create_inhouse_lobby',
    gameId: game.id,
    lobby: lobbySpecFor(game),
  });
}

/** Pull a player into the lobby with a Steam invite. */
export async function requestInvite(
  game: Pick<InhouseGame, 'id' | 'botAccountId'>,
  player: { steamId32: string; discordId?: string | null; playerName?: string | null },
): Promise<boolean> {
  return dispatch(game.botAccountId, {
    type: 'invite_player',
    gameId: game.id,
    steamId32: player.steamId32,
    discordId: player.discordId ?? null,
    playerName: player.playerName ?? null,
  });
}

/** Tear the lobby down. The worker closes it and releases its Steam account. */
export async function requestSessionEnd(
  game: Pick<InhouseGame, 'id' | 'botAccountId'>,
  reason: string | null,
): Promise<boolean> {
  return dispatch(game.botAccountId, {
    type: 'end_inhouse_session',
    gameId: game.id,
    reason,
  });
}

/**
 * Tell the Discord gateway something happened.
 *
 * A different channel from the command queue: commands are for the worker that
 * owns a Steam account, events are broadcast. The gateway's watcher matches on
 * `event.type` starting with `inhouse_` and ignores `botAccountId`, which is
 * why `'website'` is an acceptable sender.
 */
export async function emitBotEvent(event: Record<string, unknown> & { type: string }): Promise<void> {
  await getDb().collection('botEvents').add({
    botAccountId: 'website',
    event: { ...event, timestamp: new Date().toISOString() },
    processed: false,
    createdAt: new Date().toISOString(),
  });
}
