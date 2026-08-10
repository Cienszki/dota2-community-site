import 'server-only';
import { getInhouseStore } from './store';
import { resolveDisplayName } from './display';
import { toPublicGame, type PublicGame } from './public';
import { PLAYING_SIDES, type InhouseGame, type Membership } from './core/types';

// Names for the people sitting in a lobby.
//
// `slotSnapshot` is the right thing to read for *counts* (§4.4), but it carries
// Steam IDs and nothing else, and a Steam ID is not something you can put on a
// card. The names live one level down in `memberships`, so the public
// projection is assembled here — server-side, where the sub-collection read is
// allowed — rather than in the pure `toPublicGame`.

/**
 * Display names of everyone occupying a playing slot, in arrival order.
 *
 * Filtered to `PLAYING_SIDES` for the same reason `computeSlots` is: spectators
 * and the lobby bot are in the lobby but are not going to play, and a roster
 * that lists them disagrees with the "7/10" right next to it.
 */
export function rosterNames(memberships: Membership[]): string[] {
  return memberships
    .filter((m) => m.leftAt === null && PLAYING_SIDES.includes(m.side))
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map((m) =>
      resolveDisplayName({
        displayName: m.displayName,
        playerName: m.playerName,
        steamId32: m.steamId32,
      }),
    );
}

/**
 * Project games for the browser, each with its roster resolved.
 *
 * One membership query per game. That is fine at this cardinality — the board
 * only ever shows the handful of lobbies currently recruiting — but it is why
 * this must not be pointed at an unbounded listing. A game whose memberships
 * fail to load still renders, with an empty roster, because a missing name list
 * is a far smaller problem than a blank board.
 */
export async function toPublicGames(games: InhouseGame[]): Promise<PublicGame[]> {
  const store = getInhouseStore();
  return Promise.all(
    games.map(async (game) => {
      let roster: string[] = [];
      try {
        roster = rosterNames(await store.listMemberships(game.id, true));
      } catch (err) {
        console.error(`inhouse roster load failed for game ${game.id}`, err);
      }
      return toPublicGame(game, roster);
    }),
  );
}
