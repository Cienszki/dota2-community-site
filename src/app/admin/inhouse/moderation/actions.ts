'use server';

import { revalidatePath } from 'next/cache';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { requireWebsiteAdmin, isAuthError } from '@/lib/inhouse/admin-guard';
import { getInhouseStore } from '@/lib/inhouse/store';
import { emitBotEvent } from '@/lib/inhouse/commands';

// Moderation (§9.5). Bans start from a match, not a name: the incident supplies
// the Steam ID, whether or not the person ever linked. Creating a ban is three
// writes and all are required — the store handles the durable record + the
// enforcement index (including alts); this action adds the third: the botEvents
// entry that tells the Discord gateway to pull the role and DM them.

export interface ModResult {
  ok: boolean;
  message: string;
}

interface BanInput {
  gameId: string | null;
  subjectSteamId32: string | null;
  subjectDiscordId: string | null;
  subjectName: string | null;
  reason: string;
  durationDays: number; // 0 = permanent
}

export async function banPlayer(input: BanInput): Promise<ModResult> {
  try {
    const adminId = await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { ok: false, message: 'Firestore nie jest skonfigurowany.' };
    if (!input.subjectSteamId32 && !input.subjectDiscordId) {
      return { ok: false, message: 'Ban wymaga co najmniej jednej tożsamości (Steam lub Discord).' };
    }
    if (!input.reason.trim()) return { ok: false, message: 'Podaj powód bana.' };

    const store = getInhouseStore();
    const record = await store.createModerationRecord({
      kind: 'ban',
      subjectDiscordId: input.subjectDiscordId,
      subjectSteamId32: input.subjectSteamId32,
      subjectName: input.subjectName,
      reason: input.reason.trim(),
      adminId,
      sourceGameId: input.gameId,
      durationDays: input.durationDays,
    });

    // Step 3: tell the Discord gateway (without this the record exists but
    // Discord never reacts).
    await emitBotEvent({
      type: 'inhouse_ban_created',
      moderationId: record.id,
      gameId: input.gameId,
      subjectSteamId32: input.subjectSteamId32,
      subjectDiscordId: input.subjectDiscordId,
      identityGap: record.identityGap,
      durationDays: input.durationDays,
    });

    revalidatePath('/admin/inhouse/moderation');
    const dur = input.durationDays > 0 ? `${input.durationDays} dni` : 'na stałe';
    const gap =
      record.identityGap === 'no_discord'
        ? ' Uwaga: brak Discorda — nie usunięto roli.'
        : record.identityGap === 'no_steam'
          ? ' Uwaga: brak Steama — nie zostanie wykopany z lobby.'
          : '';
    return { ok: true, message: `Zbanowano (${dur}).${gap}` };
  } catch (err) {
    console.error('banPlayer', err);
    return { ok: false, message: isAuthError(err) ? 'Brak uprawnień.' : 'Nie udało się nałożyć bana.' };
  }
}

export async function warnPlayer(input: Omit<BanInput, 'durationDays'>): Promise<ModResult> {
  try {
    const adminId = await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { ok: false, message: 'Firestore nie jest skonfigurowany.' };
    if (!input.subjectSteamId32 && !input.subjectDiscordId) {
      return { ok: false, message: 'Ostrzeżenie wymaga tożsamości.' };
    }
    if (!input.reason.trim()) return { ok: false, message: 'Podaj powód ostrzeżenia.' };

    await getInhouseStore().createModerationRecord({
      kind: 'warn',
      subjectDiscordId: input.subjectDiscordId,
      subjectSteamId32: input.subjectSteamId32,
      subjectName: input.subjectName,
      reason: input.reason.trim(),
      adminId,
      sourceGameId: input.gameId,
    });
    revalidatePath('/admin/inhouse/moderation');
    return { ok: true, message: 'Zapisano ostrzeżenie. Bez skutku funkcjonalnego — tak ma być.' };
  } catch (err) {
    console.error('warnPlayer', err);
    return { ok: false, message: isAuthError(err) ? 'Brak uprawnień.' : 'Nie udało się zapisać ostrzeżenia.' };
  }
}

export async function revokeBan(moderationId: string): Promise<ModResult> {
  try {
    const adminId = await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { ok: false, message: 'Firestore nie jest skonfigurowany.' };

    const store = getInhouseStore();
    await store.revokeModerationRecord(moderationId, adminId);

    // Bot gap #2: the gateway doesn't restore the role yet, but emit the event
    // so it works the moment that ~10-line handler lands.
    await emitBotEvent({ type: 'inhouse_ban_lifted', moderationId });

    revalidatePath('/admin/inhouse/moderation');
    return { ok: true, message: 'Ban zdjęty. Rola na Discordzie nie jest przywracana automatycznie.' };
  } catch (err) {
    console.error('revokeBan', err);
    return { ok: false, message: isAuthError(err) ? 'Brak uprawnień.' : 'Nie udało się zdjąć bana.' };
  }
}
