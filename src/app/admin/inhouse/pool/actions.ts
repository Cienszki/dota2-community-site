'use server';

import { revalidatePath } from 'next/cache';
import { getDb, isInhouseConfigured } from '@/lib/firebase-admin';
import { requireWebsiteAdmin, isAuthError } from '@/lib/inhouse/admin-guard';
import { releaseAccount, getInhouseStore } from '@/lib/inhouse/store';
import { requestSessionEnd } from '@/lib/inhouse/commands';
import { isTerminal } from '@/lib/inhouse/core/types';

/**
 * Hand a Steam account back to the pool.
 *
 * Releasing the lease alone would leave the worker still sitting in a Dota
 * lobby for a game the pool now considers free, so the game it was running is
 * ended first: the worker is told to close the lobby, and the game is moved out
 * of the states that hold a lease. Only then is the account marked idle.
 *
 * Deliberately tolerant of every step failing. This is the button an admin
 * reaches for when something is already stuck, so it does as much as it can and
 * reports what it managed rather than refusing on the first error.
 */
export async function forceRelease(botAccountId: string): Promise<{ ok: boolean; message: string }> {
  try {
    await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { ok: false, message: 'Firestore nie jest skonfigurowany.' };

    const store = getInhouseStore();
    let endedGame: number | null = null;

    try {
      const game = await store.findGameByBotAccount(botAccountId);
      if (game && !isTerminal(game.state)) {
        await requestSessionEnd(game, 'bot account force-released by admin');
        await store.transitionState(game.id, 'cancelled', {
          endReason: 'Konto bota zwolnione przez administratora',
        });
        endedGame = game.gameNumber;
      }
    } catch (err) {
      console.error('forceRelease: could not end the running game', err);
    }

    await releaseAccount(getDb(), botAccountId);
    revalidatePath('/admin/inhouse/pool');
    revalidatePath('/inhouse');

    return {
      ok: true,
      message: endedGame
        ? `Zwolniono konto i zamknięto grę #${endedGame}.`
        : 'Zwolniono konto do puli.',
    };
  } catch (err) {
    console.error('forceRelease', err);
    return { ok: false, message: isAuthError(err) ? 'Brak uprawnień.' : 'Nie udało się zwolnić.' };
  }
}
