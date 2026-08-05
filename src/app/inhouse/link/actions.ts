'use server';

import { revalidatePath } from 'next/cache';
import { getDiscordSession } from '@/lib/inhouse/session';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore, backfillOnLink } from '@/lib/inhouse/store';

// The 4-character in-lobby code path (§3.4). A player typed `!link` in the Dota
// lobby, the bot gave them a code; here they redeem it. Redemption is a
// transaction inside the shared store, so a code can only ever be used once.

export interface RedeemState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  games?: number;
}

export async function redeemCode(_prev: RedeemState, formData: FormData): Promise<RedeemState> {
  const ds = await getDiscordSession();
  if (!ds) {
    return { status: 'error', message: 'Najpierw zaloguj się przez Discord.' };
  }
  if (!isInhouseConfigured()) {
    return { status: 'error', message: 'Integracja jest chwilowo niedostępna.' };
  }

  const code = String(formData.get('code') ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(code)) {
    return { status: 'error', message: 'Kod składa się z 4 znaków (liter i cyfr).' };
  }

  const store = getInhouseStore();

  const consumed = await store.consumeLinkCode(code, ds.discordId);
  if (!consumed.ok) {
    const message =
      consumed.reason === 'not_found'
        ? 'Nie znaleziono takiego kodu.'
        : consumed.reason === 'expired'
          ? 'Ten kod wygasł — wpisz !link w lobby, aby dostać nowy.'
          : 'Ten kod został już wykorzystany.';
    return { status: 'error', message };
  }

  const link = await store.linkSteamAccount(ds.discordId, consumed.steamId32, 'lobby_code', ds.discordName);
  if (!link.ok && link.reason === 'claimed_by_other') {
    return {
      status: 'error',
      message: 'To konto Steam jest już przypisane do innego profilu. Skontaktuj się z adminem.',
    };
  }

  let games = 0;
  if (link.ok && !link.alreadyLinked) {
    const bf = await backfillOnLink(store, ds.discordId, consumed.steamId32);
    games = bf.gamesFound;
  }

  revalidatePath('/inhouse/link');

  return link.alreadyLinked
    ? { status: 'ok', message: 'To konto było już połączone.', games: 0 }
    : { status: 'ok', message: 'Połączono konto Steam!', games };
}
