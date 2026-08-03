'use server';

import { revalidatePath } from 'next/cache';
import { getInhouseViewer } from '@/lib/inhouse/session';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore } from '@/lib/inhouse/store';

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
