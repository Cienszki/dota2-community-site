import 'server-only';
import { getDb } from '@/lib/firebase-admin';
import { getInhouseStore } from './store';
import { toPublicGame, type PublicGame } from './public';
import type { InhouseGame } from './core/types';

// Live board plumbing (§4.3). ONE Firestore onSnapshot per process, fanned out
// to every SSE connection — a listener per visitor would exhaust Firestore's
// concurrent-listener limits under any real traffic. The published filter is
// invariant 0.1: an unpublished game must never reach the live board.

type Listener = (games: PublicGame[]) => void;

let current: PublicGame[] = [];
let hasData = false;
let started = false;
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
      .where('state', 'in', ['open', 'ready'])
      .onSnapshot(
        (snap) => {
          current = snap.docs.map((d) => toPublicGame(d.data() as InhouseGame)).sort(sortNewestFirst);
          hasData = true;
          for (const l of listeners) {
            try {
              l(current);
            } catch {
              /* one bad listener must not break the fan-out */
            }
          }
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

/** One-shot board for SSR and the polling fallback: the two non-interchangeable
 *  listings (§4.1) — published-open for the live board, finished for results. */
export async function getBoard(): Promise<{ open: PublicGame[]; recent: PublicGame[] }> {
  const store = getInhouseStore();
  const [open, recent] = await Promise.all([
    store.listPublishedOpenGames(),
    store.listRecentFinishedGames(12),
  ]);
  return {
    open: open.map(toPublicGame),
    recent: recent.map(toPublicGame),
  };
}
