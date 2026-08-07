import 'server-only';
import { getDb } from '@/lib/firebase-admin';
import { getInhouseStore } from './store';
import { toPublicGames } from './roster';
import { toPublicGame, type PublicGame } from './public';
import type { InhouseGame } from './core/types';

// Live board plumbing (§4.3). ONE Firestore onSnapshot per process, fanned out
// to every SSE connection — a listener per visitor would exhaust Firestore's
// concurrent-listener limits under any real traffic. The published filter is
// invariant 0.1: an unpublished game must never reach the live board.

/**
 * States that belong on the board.
 *
 * `in_progress` is included so a running match keeps its place in the newest-
 * first feed instead of vanishing between "filling" and "finished" — the board
 * shows the three most recent games whatever they happen to be doing.
 *
 * The `published` filter still applies to all three (invariant 0.1). An
 * unpublished in-progress game stays hidden: nobody can join it anyway.
 */
export const BOARD_STATES = ['open', 'ready', 'in_progress'] as const;

/** Board states in which a game is still taking players. */
export const RECRUITING_STATES: readonly string[] = ['open', 'ready'];

/** How many recently-finished games the "recent" side tracks — matches the
 *  one-shot `listRecentFinishedGames` limit `getBoard()` already used, so SSE,
 *  polling and the SSR snapshot all agree on how much history is "live". */
const RECENT_LIMIT = 12;

export interface BoardSnapshot {
  live: PublicGame[];
  recent: PublicGame[];
}

type Listener = (board: BoardSnapshot) => void;

let currentLive: PublicGame[] = [];
let currentRecent: PublicGame[] = [];
let hasLiveData = false;
let hasRecentData = false;
let startedLive = false;
let startedRecent = false;
let latestLiveGeneration = 0;
let unsubLive: (() => void) | null = null;
let unsubRecent: (() => void) | null = null;
const listeners = new Set<Listener>();

function sortNewestFirst(a: PublicGame, b: PublicGame): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function notify(): void {
  if (!hasLiveData && !hasRecentData) return;
  const snapshot: BoardSnapshot = { live: currentLive, recent: currentRecent };
  for (const l of listeners) {
    try {
      l(snapshot);
    } catch {
      /* one bad listener must not break the fan-out */
    }
  }
}

function ensureLiveStarted(): void {
  if (startedLive) return;
  startedLive = true;
  try {
    unsubLive = getDb()
      .collection('inhouseGames')
      .where('published', '==', true)
      .where('state', 'in', [...BOARD_STATES])
      .onSnapshot(
        (snap) => {
          // Resolving rosters needs a read per game, so the fan-out is async.
          // Snapshots are sequenced with a generation counter rather than
          // awaited in order: a slow roster read must not be able to overwrite
          // a newer slot picture with a stale one.
          const generation = ++latestLiveGeneration;
          void toPublicGames(snap.docs.map((d) => d.data() as InhouseGame))
            .then((games) => {
              if (generation !== latestLiveGeneration) return;
              currentLive = games.sort(sortNewestFirst);
              hasLiveData = true;
              notify();
            })
            .catch((err) => console.error('inhouse live projection failed', err));
        },
        (err) => {
          console.error('inhouse live listener error', err);
          // Allow a later subscriber to restart the listener.
          startedLive = false;
          hasLiveData = false;
          unsubLive?.();
          unsubLive = null;
        },
      );
  } catch (err) {
    console.error('inhouse live listener failed to start', err);
    startedLive = false;
  }
}

/**
 * A finished match leaves `BOARD_STATES` the instant its state flips, so
 * without a live view of "recent" too, it simply vanished from the board until
 * the next poll or navigation — SSE only ever carried `live`. Bounded to
 * `RECENT_LIMIT` docs, so this stays cheap: Firestore only re-evaluates the
 * `limit()` window on a change, not every finished game ever played. Same
 * query `listRecentFinishedGames` already runs, so no new composite index.
 */
function ensureRecentStarted(): void {
  if (startedRecent) return;
  startedRecent = true;
  try {
    unsubRecent = getDb()
      .collection('inhouseGames')
      .where('state', '==', 'finished')
      .orderBy('endedAt', 'desc')
      .limit(RECENT_LIMIT)
      .onSnapshot(
        (snap) => {
          // Finished games show a result, not a live roster, so this skips the
          // per-game membership read `toPublicGames` does for the live side.
          currentRecent = snap.docs.map((d) => toPublicGame(d.data() as InhouseGame));
          hasRecentData = true;
          notify();
        },
        (err) => {
          console.error('inhouse recent listener error', err);
          startedRecent = false;
          hasRecentData = false;
          unsubRecent?.();
          unsubRecent = null;
        },
      );
  } catch (err) {
    console.error('inhouse recent listener failed to start', err);
    startedRecent = false;
  }
}

/**
 * Subscribe to live board updates. Pushes the current snapshot immediately if
 * either side has already arrived (so a fresh SSE connection isn't blank),
 * then again whenever either side changes. Returns an unsubscribe.
 */
export function subscribeBoard(listener: Listener): () => void {
  ensureLiveStarted();
  ensureRecentStarted();
  listeners.add(listener);
  if (hasLiveData || hasRecentData) listener({ live: currentLive, recent: currentRecent });
  return () => {
    listeners.delete(listener);
    // Deliberately keep both onSnapshots alive between connections — cheap,
    // and tearing them down on every disconnect would churn listeners.
  };
}

/**
 * Published games that are filling or being played.
 *
 * Deliberately not `store.listPublishedOpenGames()`: that helper is fixed to
 * open/ready, and it lives in the vendored core copy which must not be edited
 * (see core/VENDORED.md). Same index, one more state.
 */
async function listBoardGames(): Promise<InhouseGame[]> {
  const snap = await getDb()
    .collection('inhouseGames')
    .where('published', '==', true)
    .where('state', 'in', [...BOARD_STATES])
    .get();
  return snap.docs.map((d) => d.data() as InhouseGame);
}

/** One-shot board for SSR and the polling fallback: the two non-interchangeable
 *  listings (§4.1) — published live games for the board, finished for results. */
export async function getBoard(): Promise<{ live: PublicGame[]; recent: PublicGame[] }> {
  const store = getInhouseStore();
  const [live, recent] = await Promise.all([
    listBoardGames(),
    store.listRecentFinishedGames(RECENT_LIMIT),
  ]);
  const [livePublic, recentPublic] = await Promise.all([
    toPublicGames(live),
    // Finished games list a result, not a live roster, so they skip the
    // per-game membership read entirely.
    Promise.resolve(recent.map((g) => toPublicGame(g))),
  ]);
  return { live: livePublic, recent: recentPublic };
}

/**
 * How many *published* lobbies are currently recruiting.
 *
 * Unpublished lobbies are deliberately not counted. An unpublished game is one
 * the host is still deciding who to tell (invariant 0.1) — it isn't competing
 * for the same players yet, and counting it would let two private lobbies lock
 * the whole community out of opening a public one.
 */
export async function countRecruitingLobbies(): Promise<number> {
  const active = await getInhouseStore().listActiveGames();
  return active.filter((g) => g.published && RECRUITING_STATES.includes(g.state)).length;
}
