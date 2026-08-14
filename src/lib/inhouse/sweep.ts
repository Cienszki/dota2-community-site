import 'server-only';
import { getDb } from '@/lib/firebase-admin';
import { getInhouseStore } from './store';
import { requestSessionEnd } from './commands';
import { LEASE_TIMEOUT_MS } from './core/lease';
import type { InhouseGame, GameState, SlotSnapshot } from './core/types';

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
  /** Why it was written off, in English — server logs and the admin alert. */
  reason: string;
  /**
   * True when this reflects the bot misbehaving rather than routine cleanup.
   *
   * An empty lobby closing after five minutes is the system working. A lobby
   * the worker never created, or stopped tending while it was open, is the
   * worker being broken — and only that kind is worth waking someone for.
   */
  fault: boolean;
}

// ─── Reconciling against a worker that stopped talking ───────────────────────
//
// The sweep above catches one failure: a lobby the worker never finished
// creating. It is not the only one. If the worker dies while a lobby is *open*
// — crash, redeploy, Steam disconnect — the Dota lobby dies with it, but the
// Firestore document keeps saying `open` forever. That game then:
//
//   * shows a joinable card for a lobby that no longer exists, and hands out a
//     password to anyone who presses Dołącz,
//   * holds a leased Steam account out of the pool,
//   * counts against the concurrent-lobby cap, blocking new lobbies.
//
// There is no API to ask the worker anything — Firestore is the entire seam
// between the two systems. But the worker leaves a liveness signal anyway: it
// renews its account lease every 30 seconds (`leaseHeartbeatAt`, see
// core/lease.ts). A lobby whose account has not been heartbeated in minutes is
// a lobby nobody is tending, and that is a fact the website can read for
// itself.
//
// `in_progress` is deliberately left alone. A match that was actually being
// played does not stop having happened because the worker fell over, and its
// result arrives from OpenDota rather than from the bot — ingest.ts gives up on
// its own schedule (6h) once the match id genuinely never resolves. Expiring
// those here would delete real games.

/**
 * How long a lobby may go without any sign of life before it is written off.
 *
 * A multiple of the lease timeout rather than a number of its own: below
 * LEASE_TIMEOUT_MS the lease is still considered live by everything else, and
 * expiring a lobby the pool still thinks is held would have the two disagreeing.
 * Above it, the account is reclaimable anyway, so the lobby is already gone in
 * every sense that matters.
 */
export const WORKER_SILENT_TIMEOUT_MS = 2 * LEASE_TIMEOUT_MS; // 6 minutes

/**
 * How long a lobby may stand with nobody in a player slot.
 *
 * The heartbeat check above catches a worker that died. This catches the
 * opposite and, in practice, the more common failure: a worker that is
 * perfectly healthy and dutifully keeping an empty lobby alive forever.
 * Measured on live data on 2026-08-13, two empty lobbies had been open for 62
 * and 16 hours, holding two of five Steam accounts and — with maxOpenLobbies at
 * 2 — refusing everyone else a lobby the entire time. A healthy bot blocks
 * hosting just as effectively as a crashed one.
 *
 * Judged on slot activity, never on the heartbeat: the worker heartbeating is
 * precisely what keeps a dead lobby standing, so counting it as a sign of life
 * would make this check unable to ever fire.
 */
export const EMPTY_LOBBY_TIMEOUT_MS = 5 * 60_000;

/**
 * How long a lobby with real players in it may go without anything happening.
 *
 * A lobby that has people in it is worth keeping even while it is quiet — that
 * is the state where players are trickling in. But four people who joined and
 * then wandered off still hold an account and a cap slot, so the patience is
 * finite rather than unlimited.
 *
 * Three hours is a guess and the number here most worth revisiting: longer than
 * an evening's trickle of joiners, shorter than a night.
 */
export const OCCUPIED_LOBBY_IDLE_TIMEOUT_MS = 3 * 60 * 60_000;

/**
 * People occupying a *player* slot, which is the only occupancy that keeps a
 * lobby alive.
 *
 * Observers do not count — `computeSlots` builds these three arrays from
 * PLAYING_SIDES, which excludes `spectator`, so a lobby holding nothing but
 * spectators reads as empty here and is correctly closed.
 *
 * Neither does the lobby bot: it never appears in its own snapshot. Confirmed
 * against live data, where a lobby the bot was demonstrably sitting in reported
 * `inLobby: []`.
 */
function playersInSlots(slots: SlotSnapshot | null): number {
  if (!slots) return 0;
  return (
    (slots.radiant?.length ?? 0) +
    (slots.dire?.length ?? 0) +
    (slots.unassigned?.length ?? 0)
  );
}

/**
 * Slots held by someone who pressed Join and hasn't walked in yet.
 *
 * Only counts reservations that have not lapsed — `expiresAt` is checked here
 * rather than trusting the array to have been pruned, because the snapshot is
 * written by the worker and a stale entry left in it would otherwise hold a
 * dead lobby open indefinitely.
 */
function heldSlots(slots: SlotSnapshot | null, now: number): number {
  if (!slots?.reserved?.length) return 0;
  return slots.reserved.filter((r) => {
    const until = Date.parse(r.expiresAt ?? '');
    return Number.isFinite(until) && until > now;
  }).length;
}

/**
 * Smallest gap between two unforced reconciles.
 *
 * This runs on page loads, so without a throttle a busy evening would have
 * every visitor triggering the same scan. In-process rather than a Firestore
 * flag: a serverless instance that has just run it is exactly the one about to
 * be asked again, and the alternative costs a read on every request to save
 * writes that mostly do not happen. Several instances each running it once a
 * window is a fine outcome — every operation below is idempotent.
 */
const MIN_INTERVAL_MS = 20_000;
let lastRunAt = 0;

export interface ReconcileResult {
  /** Stuck in `lobby_creating` — the worker never made the Dota lobby. */
  failed: SweptGame[];
  /** Was `open`/`ready`, but nobody has tended it in WORKER_SILENT_TIMEOUT_MS. */
  expired: SweptGame[];
  /** True when the throttle skipped this call and nothing was checked. */
  throttled: boolean;
}

const EMPTY: ReconcileResult = { failed: [], expired: [], throttled: true };

/** Board states that hold a Steam account and can therefore go stale. */
const RECONCILED_STATES: readonly GameState[] = ['lobby_creating', 'open', 'ready'];

/**
 * Release an account only if this game is still the one holding it.
 *
 * The core's `releaseAccount` overwrites unconditionally, which is right for
 * the worker (it owns the lease it is releasing) and wrong here. By the time we
 * decide a lease is stale, `leaseAccount` may already have handed that same
 * account to a *new* game — its heartbeat being stale is precisely what makes
 * it reclaimable. Releasing it then would strip a live lobby of its account and
 * turn one dead game into two.
 *
 * The check and the release are one transaction so the hand-off cannot land
 * between them. Done here rather than in core/lease.ts because that file is a
 * verbatim copy of the bot's own module (see core/VENDORED.md).
 */
async function releaseAccountIfHeldBy(botAccountId: string, gameId: string): Promise<boolean> {
  const ref = getDb().collection('botAccounts').doc(botAccountId);
  try {
    return await getDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      if ((snap.data() as { leasedByGameId?: string | null }).leasedByGameId !== gameId) {
        return false;
      }
      tx.update(ref, {
        status: 'idle',
        leasedByGameId: null,
        leasedAt: null,
        leaseHeartbeatAt: null,
      });
      return true;
    });
  } catch (err) {
    console.error(`inhouse reconcile: could not release ${botAccountId}`, err);
    return false;
  }
}

/**
 * Bring the board back in line with what the worker is actually doing.
 *
 * Cheap on the happy path: one query, and a second only if there is something
 * holding an account. Writes nothing at all unless a lobby has genuinely gone
 * silent, so the common case is two reads and no mutation.
 *
 * @param force skip the throttle — for the cron, and for the moments where a
 *   stale read has consequences rather than just looking wrong (opening a
 *   lobby, where a phantom game eats the cap; joining one, where the reward for
 *   a stale read is a password to an empty lobby).
 */
export async function reconcileLobbies(
  opts: { force?: boolean } = {},
  now = Date.now(),
): Promise<ReconcileResult> {
  if (!opts.force && now - lastRunAt < MIN_INTERVAL_MS) return EMPTY;
  lastRunAt = now;

  const store = getInhouseStore();
  const failed: SweptGame[] = [];
  const expired: SweptGame[] = [];

  const snap = await getDb()
    .collection('inhouseGames')
    .where('state', 'in', RECONCILED_STATES as GameState[])
    .get();
  if (snap.empty) return { failed, expired, throttled: false };

  const games = snap.docs.map((d) => d.data() as InhouseGame);

  // One read for the whole pool rather than one per game — the pool is a
  // handful of documents and most evenings every open lobby is on a different
  // account anyway.
  const heartbeats = new Map<string, number>();
  if (games.some((g) => g.botAccountId)) {
    const accounts = await getDb().collection('botAccounts').get();
    for (const doc of accounts.docs) {
      const at = Date.parse((doc.data() as { leaseHeartbeatAt?: string | null }).leaseHeartbeatAt ?? '');
      if (Number.isFinite(at)) heartbeats.set(doc.id, at);
    }
  }

  for (const game of games) {
    const touched = Date.parse(game.updatedAt ?? game.createdAt);
    if (!Number.isFinite(touched)) continue;

    const verdict = judge(game, touched, heartbeats, now);
    if (!verdict) continue;

    const moved = await store.transitionState(game.id, verdict.state, {
      endReason: verdict.endReason,
    });
    if (!moved) continue;

    await requestSessionEnd(game, verdict.log);

    let botAccountReleased = false;
    if (game.botAccountId) {
      botAccountReleased = await releaseAccountIfHeldBy(game.botAccountId, game.id);
    }

    const swept: SweptGame = {
      id: game.id,
      gameNumber: game.gameNumber,
      ageMinutes: Math.round(verdict.idleMs / 60_000),
      botAccountReleased,
      reason: verdict.log,
      fault: verdict.fault,
    };
    (verdict.state === 'failed' ? failed : expired).push(swept);
    console.warn(
      `inhouse reconcile: ${verdict.state} game #${game.gameNumber} (${game.id}) — ` +
        `${verdict.log}, ${swept.ageMinutes} min in ${game.state}`,
    );
  }

  return { failed, expired, throttled: false };
}

interface Verdict {
  state: GameState;
  /** See SweptGame.fault. */
  fault: boolean;
  /** Shown to players on the board and in the admin log — hence Polish. */
  endReason: string;
  /** Sent to the worker and written to the server log — hence not. */
  log: string;
  idleMs: number;
}

/**
 * Decide whether a game is dead, and of what.
 *
 * Three separate failures, each with its own clock, and the distinction between
 * the last two is the whole point of this function:
 *
 *   1. the worker never finished creating the lobby;
 *   2. the worker died holding one — no heartbeat on the account it leased;
 *   3. the worker is alive and well and nursing a lobby nobody joined.
 *
 * (2) is judged on the heartbeat and (3) must not be, because in (3) the
 * heartbeat is the thing keeping the corpse warm. (3) reads slot activity
 * instead — the last time a player did anything — which no amount of worker
 * liveness can fake.
 */
function judge(
  game: InhouseGame,
  touched: number,
  heartbeats: Map<string, number>,
  now: number,
): Verdict | null {
  if (game.state === 'lobby_creating') {
    // The worker touches the document as it makes progress, so this measures
    // silence rather than age.
    const idleMs = now - touched;
    if (idleMs < LOBBY_CREATING_TIMEOUT_MS) return null;
    return {
      state: 'failed',
      fault: true,
      endReason: 'Bot nie utworzył lobby w Docie',
      log: 'lobby creation timed out',
      idleMs,
    };
  }

  // Sign of life: the worker touching the document, or heartbeating the account
  // it holds. The later of the two, so a lobby created seconds ago is safe in
  // the window before its first heartbeat lands.
  const beat = game.botAccountId ? heartbeats.get(game.botAccountId) : undefined;
  const silentMs = now - Math.max(touched, beat ?? 0);

  // A lobby on no account at all cannot be judged on a heartbeat it does not
  // have — it falls through to the idle check below, which needs neither.
  if (game.botAccountId && silentMs >= WORKER_SILENT_TIMEOUT_MS) {
    return {
      state: 'expired',
      fault: true,
      endReason: 'Bot przestał odpowiadać — lobby nie istnieje',
      log: 'worker went silent',
      idleMs: silentMs,
    };
  }

  // Last time a player did anything. `slotSnapshot.updatedAt` moves on every
  // join, leave and side change — on live data it landed one second after the
  // only player left, which is what makes "empty since" readable at all.
  //
  // Deliberately NOT mixed with the game document's `updatedAt`: the worker
  // touches that for its own reasons, and letting it reset the emptiness clock
  // would keep an abandoned lobby alive on bookkeeping alone.
  const slots = game.slotSnapshot ?? null;
  const slotAt = Date.parse(slots?.updatedAt ?? '');
  const created = Date.parse(game.createdAt ?? '');

  // A lobby with no snapshot yet is measured from creation, so a brand-new one
  // gets its full five minutes rather than being judged on a timestamp it has
  // not had the chance to write.
  const since = Math.max(
    Number.isFinite(slotAt) ? slotAt : 0,
    Number.isFinite(created) ? created : 0,
  );
  if (since === 0) return null;

  const idleMs = now - since;
  const occupied = playersInSlots(slots) > 0;

  // A live reservation holds the lobby open.
  //
  // Without this the two five-minute clocks race: `reservationTtlSeconds` is
  // 300 and the empty-lobby rule is 300, so someone who presses Join on an
  // empty lobby and takes a few minutes to load Dota arrives at a lobby that
  // closed underneath them. The site promises "trzymamy Ci miejsce na 5 minut"
  // at that exact moment, so closing it is the one outcome that makes the
  // promise a lie.
  //
  // Bounded, not indefinite: a reservation expires on its own TTL, the worker
  // rewrites `slotSnapshot` when it lapses (a reservation is part of the slot
  // picture), and the ordinary empty clock then runs from that moment. Worst
  // case is one TTL plus one empty window, not forever.
  if (!occupied && heldSlots(slots, now) > 0) return null;

  const limit = occupied ? OCCUPIED_LOBBY_IDLE_TIMEOUT_MS : EMPTY_LOBBY_TIMEOUT_MS;
  if (idleMs < limit) return null;

  return {
    state: 'expired',
    fault: false,
    endReason: occupied
      ? 'Lobby nie zapełniło się — zbyt długo bez zmian'
      : 'Nikt nie był w lobby przez 5 minut',
    log: occupied ? 'lobby idle with players seated' : 'lobby empty of players',
    idleMs,
  };
}
