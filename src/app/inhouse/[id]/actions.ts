'use server';

import { revalidatePath } from 'next/cache';
import { getInhouseViewer } from '@/lib/inhouse/session';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore } from '@/lib/inhouse/store';
import { requestSessionEnd } from '@/lib/inhouse/commands';
import { isTerminal } from '@/lib/inhouse/core/types';

// Publishing from the website is the same action as `!publish` in lobby chat —
// a plain field update the Discord gateway watches and reacts to (§5.2). The
// worker also flips the Dota lobby to Public within ~15s, so the game becomes
// findable in the in-game browser without any extra call.

export type PublishResult = { ok: true } | { ok: false; reason: 'forbidden' | 'unavailable' | 'error' };

export async function publishGame(gameId: string): Promise<PublishResult> {
  if (!isInhouseConfigured()) return { ok: false, reason: 'unavailable' };

  const viewer = await getInhouseViewer();
  if (!viewer.discordId) return { ok: false, reason: 'forbidden' };

  const store = getInhouseStore();
  const game = await store.getGame(gameId);
  if (!game) return { ok: false, reason: 'error' };

  const isInitiator = game.initiatorDiscordId === viewer.discordId;
  const isFinishedParticipant =
    game.state === 'finished' &&
    !!viewer.steamId32 &&
    (await store.listMemberships(gameId, false)).some((m) => m.steamId32 === viewer.steamId32);

  // The initiator can publish any time; any participant may publish a finished
  // game afterwards (§6.4).
  if (!isInitiator && !isFinishedParticipant) return { ok: false, reason: 'forbidden' };

  if (game.published) return { ok: true };

  const nowIso = new Date().toISOString();
  await store.updateGame(gameId, {
    published: true,
    publishedAt: nowIso,
    publishedByDiscordId: viewer.discordId,
    updatedAt: nowIso, // the stuck-game sweeper keys off updatedAt (§5.2)
  });

  revalidatePath(`/inhouse/${gameId}`);
  revalidatePath('/inhouse');
  return { ok: true };
}

export type CancelResult =
  | { ok: true }
  | { ok: false; reason: 'forbidden' | 'unavailable' | 'already_started' | 'error' };

/**
 * Close a lobby that isn't going to happen.
 *
 * The missing half of "open a lobby in one click": without it a host who opened
 * one by mistake can only wait out the 45-minute idle expiry, and the lobby
 * holds a Steam account from the pool the whole time — which, with a small
 * pool, is the difference between the community being able to play and not.
 *
 * Order matters. The state transition goes first so the game leaves the board
 * immediately even if the worker is down; the command follows to actually close
 * the Dota lobby and free the account. A worker that never gets it loses its
 * lease to the heartbeat timeout anyway.
 */
export async function cancelGame(gameId: string): Promise<CancelResult> {
  if (!isInhouseConfigured()) return { ok: false, reason: 'unavailable' };

  const viewer = await getInhouseViewer();
  if (!viewer.discordId) return { ok: false, reason: 'forbidden' };

  const store = getInhouseStore();
  const game = await store.getGame(gameId);
  if (!game) return { ok: false, reason: 'error' };

  const isHost = game.initiatorDiscordId === viewer.discordId;
  const isAdmin = await store.isAdmin({ discordId: viewer.discordId, steamId32: viewer.steamId32 });
  if (!isHost && !isAdmin) return { ok: false, reason: 'forbidden' };

  // Once the match has launched there is nothing to cancel — the game is being
  // played, and its result still has to be ingested.
  if (game.state === 'in_progress') return { ok: false, reason: 'already_started' };
  if (isTerminal(game.state)) return { ok: true };

  const moved = await store.transitionState(gameId, 'cancelled', {
    endReason: isHost ? 'Anulowane przez hosta' : 'Anulowane przez administratora',
  });
  if (!moved) return { ok: false, reason: 'error' };

  await requestSessionEnd(game, 'cancelled from website');

  revalidatePath(`/inhouse/${gameId}`);
  revalidatePath('/inhouse');
  return { ok: true };
}
