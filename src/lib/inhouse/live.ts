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

/** How many lobbies may be recruiting at once before the site stops offering
 *  to open another (§ product rule: two is enough, join one instead). */
export const MAX_OPEN_LOBBIES = 2;

type Listener = (games: PublicGame[]) => void;

let current: PublicGame[] = [];
let hasData = false;
let started = false;
let latestGeneration = 0;
let unsub: (() => void) | null = null;
const listeners = new Set<Listener>();

function sortNewestFirst(a: PublicGame, b: PublicGame): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  try {
    unsub = getDb()
      .collection('inhouseGames')
      .where('published', '==', true)
      .where('state', 'in', [...BOARD_STATES])
      .onSnapshot(
        (snap) => {
          // Resolving rosters needs a read per game, so the fan-out is async.
          // Snapshots are sequenced with a generation counter rather than
          // awaited in order: a slow roster read must not be able to overwrite
          // a newer slot picture with a stale one.
          const generation = ++latestGeneration;
          void toPublicGames(snap.docs.map((d) => d.data() as InhouseGame))
            .then((games) => {
              if (generation !== latestGeneration) return;
              current = games.sort(sortNewestFirst);
              hasData = true;
              for (const l of listeners) {
                try {
                  l(current);
                } catch {
                  /* one bad listener must not break the fan-out */
                }
              }
            })
            .catch((err) => console.error('inhouse live projection failed', err));
        },
        (err) => {
          console.error('inhouse live listener error', err);
          // Allow a later subscriber to restart the listener.
          started = false;
          hasData = false;
          unsub?.();
          unsub = null;
        },
      );
  } catch (err) {
    console.error('inhouse live listener failed to start', err);
    started = false;
  }
}

/**
 * Subscribe to live board updates. Pushes the current snapshot immediately if
 * one has already arrived (so a fresh SSE connection isn't blank), then on
 * every change. Returns an unsubscribe.
 */
export function subscribeBoard(listener: Listener): () => void {
  ensureStarted();
  listeners.add(listener);
  if (hasData) listener(current);
  return () => {
    listeners.delete(listener);
    // Deliberately keep the single onSnapshot alive between connections — it is
    // cheap, and tearing it down on every disconnect would churn listeners.
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
    store.listRecentFinishedGames(12),
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
 * How many lobbies are currently recruiting, published or not.
 *
 * The cap counts unpublished lobbies too. Publishing decides who *hears* about
 * a game, not whether it exists — three lobbies split the same handful of
 * players however quiet two of them are, and each one is holding a bot account
 * hostage besides.
 */
export async function countRecruitingLobbies(): Promise<number> {
  const active = await getInhouseStore().listActiveGames();
  return active.filter((g) => RECRUITING_STATES.includes(g.state)).length;
}
