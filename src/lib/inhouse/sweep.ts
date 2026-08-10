import 'server-only';
import { getDb } from '@/lib/firebase-admin';
import { getInhouseStore, releaseAccount } from './store';
import { requestSessionEnd } from './commands';
import type { InhouseGame } from './core/types';

// Recovering lobbies the worker never created.
//
// Creating a lobby is two writes and a wait: the website leases a Steam
// account, moves the game to `lobby_creating` and enqueues
// `create_inhouse_lobby`, then waits for the worker to report the Dota lobby
// exists by moving the game to `open`. Normally that takes seconds.
//
// When it doesn't — the worker is down, deployed without inhouse support, or
// simply never consumed the queue — the game sits in `lobby_creating` forever,
// and that is not a harmless orphan:
//
//   * `lobby_creating` counts toward the concurrent-lobby cap, so two stuck
//     games block hosting for everyone. This has happened: games #1 and #2 sat
//     stuck for 55 and 12 hours and `/inhouse/new` refused every new lobby.
//   * each one holds a leased Steam account out of a small pool.
//   * the board shows a "tworzenie" card that will never become joinable.
//
// The bot has its own stuck-game sweeper, but it runs *inside the worker* — so
// it is guaranteed to be down in exactly the case that produces this. That is
// why this exists here rather than being left to the bot: a backstop is only
// worth anything if it doesn't share a failure mode with the thing it backs up.

/**
 * How long a game may sit in `lobby_creating` before it is written off.
 *
 * Generous against the seconds a healthy worker takes, because the cost of
 * being wrong is asymmetric: failing a lobby that was about to succeed strands
 * a host who would otherwise have been playing, while waiting a few extra
 * minutes on a genuinely dead one costs nothing that is not already lost.
 */
export const LOBBY_CREATING_TIMEOUT_MS = 5 * 60_000;

export interface SweptGame {
  id: string;
  gameNumber: number;
  ageMinutes: number;
  botAccountReleased: boolean;
}

/**
 * Fail every game stuck in `lobby_creating`, and hand its Steam account back.
 *
 * Marks `failed` rather than deleting: `failed` is outside both the board
 * states and the recruiting states, so the game stops blocking and stops being
 * displayed, while the record of what went wrong survives for whoever is
 * debugging the worker. Deleting is a separate, deliberate act — see
 * `scripts/inhouse-purge-games.mjs`.
 *
 * Idempotent and safe to run on a schedule. `transitionState` refuses to move a
 * game that is already terminal, so a race with the worker finally waking up
 * resolves in the worker's favour if it got there first.
 */
export async function sweepStuckLobbies(now = Date.now()): Promise<SweptGame[]> {
  const store = getInhouseStore();
  const swept: SweptGame[] = [];

  const snap = await getDb()
    .collection('inhouseGames')
    .where('state', '==', 'lobby_creating')
    .get();

  for (const doc of snap.docs) {
    const game = doc.data() as InhouseGame;

    // `updatedAt` rather than `createdAt`: the worker touches the document as
    // it makes progress, so this measures silence, not age.
    const since = Date.parse(game.updatedAt ?? game.createdAt);
    if (!Number.isFinite(since)) continue;

    const idleMs = now - since;
    if (idleMs < LOBBY_CREATING_TIMEOUT_MS) continue;

    const moved = await store.transitionState(game.id, 'failed', {
      endReason: 'Bot nie utworzył lobby w Docie',
    });
    if (!moved) continue;

    // Best-effort: tell the worker to drop the session in case it is alive but
    // stuck mid-create, then reclaim the account regardless. A worker that
    // never answers is the whole reason we are here.
    await requestSessionEnd(game, 'lobby creation timed out');

    let botAccountReleased = false;
    if (game.botAccountId) {
      try {
        await releaseAccount(getDb(), game.botAccountId);
        botAccountReleased = true;
      } catch (err) {
        console.error(`inhouse sweep: could not release ${game.botAccountId}`, err);
      }
    }

    swept.push({
      id: game.id,
      gameNumber: game.gameNumber,
      ageMinutes: Math.round(idleMs / 60_000),
      botAccountReleased,
    });
    console.warn(
      `inhouse sweep: failed game #${game.gameNumber} (${game.id}) after ` +
        `${Math.round(idleMs / 60_000)} min in lobby_creating`,
    );
  }

  return swept;
}
