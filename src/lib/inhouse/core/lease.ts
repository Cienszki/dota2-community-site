// src/inhouse/lease.ts
// Steam account leasing for the lobby worker pool (§12).
//
// Lobbies open at *creation*, not when ten people are ready, so an account is
// held from creation all the way to match end. That means the pool must be
// sized for **concurrent open lobbies**, not concurrent matches — a distinction
// that is easy to get wrong and expensive to discover on a busy evening.
//
// Leases carry a heartbeat and are force-released on timeout, so a crashed
// worker cannot strand an account forever.

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from './logger';

const BOT_ACCOUNTS = 'botAccounts';

/**
 * How long a lease survives without a heartbeat before another game may take
 * the account. Generous relative to the worker's 30s heartbeat, so a slow
 * Firestore write never steals a live lobby's account.
 */
export const LEASE_TIMEOUT_MS = 3 * 60_000;

export interface LeaseResult {
  ok: boolean;
  botAccountId?: string;
  reason?: 'none_available';
}

/**
 * Claim an idle Steam account for a game.
 *
 * Runs in a transaction over the candidate documents so two games created in
 * the same second cannot both claim the same account — which would leave one of
 * them silently without a lobby.
 */
export async function leaseAccount(db: Firestore, gameId: string): Promise<LeaseResult> {
  const snapshot = await db.collection(BOT_ACCOUNTS).where('enabled', '==', true).get();
  if (snapshot.empty) return { ok: false, reason: 'none_available' };

  const cutoff = Date.now() - LEASE_TIMEOUT_MS;

  for (const candidate of snapshot.docs) {
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(candidate.ref);
      if (!snap.exists) return false;

      const data = snap.data() as {
        status?: string;
        leasedByGameId?: string | null;
        leaseHeartbeatAt?: string | null;
      };

      const heldBySomeone = Boolean(data.leasedByGameId) && data.leasedByGameId !== gameId;
      const heartbeatFresh =
        data.leaseHeartbeatAt !== null &&
        data.leaseHeartbeatAt !== undefined &&
        Date.parse(data.leaseHeartbeatAt) > cutoff;

      // A stale heartbeat means the worker died mid-lobby. Reclaiming is
      // correct: the lobby is gone regardless, and stranding the account helps
      // nobody.
      if (heldBySomeone && heartbeatFresh) return false;
      if (data.status === 'offline' || data.status === 'error') return false;

      tx.update(candidate.ref, {
        status: 'assigned',
        leasedByGameId: gameId,
        leasedAt: new Date().toISOString(),
        leaseHeartbeatAt: new Date().toISOString(),
      });
      return true;
    });

    if (claimed) {
      logger.info(`Leased bot account ${candidate.id} to game ${gameId}`);
      return { ok: true, botAccountId: candidate.id };
    }
  }

  logger.warn(`No bot account available for game ${gameId}`);
  return { ok: false, reason: 'none_available' };
}

/** Renew a lease. Called by the worker heartbeat. */
export async function renewLease(db: Firestore, botAccountId: string, gameId: string): Promise<void> {
  await db.collection(BOT_ACCOUNTS).doc(botAccountId).update({
    leasedByGameId: gameId,
    leaseHeartbeatAt: new Date().toISOString(),
  });
}

/** Return an account to the pool. Safe to call more than once. */
export async function releaseAccount(db: Firestore, botAccountId: string): Promise<void> {
  try {
    await db.collection(BOT_ACCOUNTS).doc(botAccountId).update({
      status: 'idle',
      leasedByGameId: null,
      leasedAt: null,
      leaseHeartbeatAt: null,
    });
    logger.info(`Released bot account ${botAccountId}`);
  } catch (error) {
    logger.warn(`Failed to release bot account ${botAccountId}: ${String(error)}`);
  }
}

/**
 * How many accounts are currently leased, and how many exist.
 *
 * Instrument *lobby-open duration* alongside this early: that single number
 * tells you how many accounts you actually need (§12).
 */
export async function poolStatus(db: Firestore): Promise<{ total: number; leased: number }> {
  const snapshot = await db.collection(BOT_ACCOUNTS).where('enabled', '==', true).get();
  const cutoff = Date.now() - LEASE_TIMEOUT_MS;

  const leased = snapshot.docs.filter((doc) => {
    const data = doc.data() as { leasedByGameId?: string | null; leaseHeartbeatAt?: string | null };
    return (
      Boolean(data.leasedByGameId) &&
      data.leaseHeartbeatAt &&
      Date.parse(data.leaseHeartbeatAt) > cutoff
    );
  }).length;

  return { total: snapshot.size, leased };
}
