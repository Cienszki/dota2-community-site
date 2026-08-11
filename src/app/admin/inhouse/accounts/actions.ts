'use server';

import { revalidatePath } from 'next/cache';
import { getDb, isInhouseConfigured } from '@/lib/firebase-admin';
import { requireWebsiteAdmin, isAuthError } from '@/lib/inhouse/admin-guard';
import { getInhouseStore } from '@/lib/inhouse/store';
import { excludeFromRanking, restoreToRanking } from '@/lib/inhouse/ranking-enrol';

// Account management. Every action here is destructive in some way, so each one
// names precisely what it touches and what it leaves alone.

export interface ActionResult {
  ok: boolean;
  message: string;
}

function fail(err: unknown, fallback: string): ActionResult {
  console.error(fallback, err);
  return { ok: false, message: isAuthError(err) ? 'Brak uprawnień.' : fallback };
}

/**
 * Remove Steam accounts from the ranking and keep them out.
 *
 * The remembering is the point. A plain delete would be undone by the next
 * inhouse they play, which from the player's side is being ignored rather than
 * removed — so the opt-out is recorded first and enrolment checks it.
 */
export async function removeFromRanking(
  steamIds: string[],
  reason: string,
): Promise<ActionResult> {
  try {
    const adminId = await requireWebsiteAdmin();
    await excludeFromRanking(steamIds, { reason: reason.trim() || null, excludedBy: adminId });
    revalidatePath('/admin/inhouse/accounts');
    revalidatePath('/ranking');
    return {
      ok: true,
      message: `Usunięto z rankingu ${steamIds.length} ${steamIds.length === 1 ? 'konto' : 'kont'} — nie wrócą po kolejnych meczach.`,
    };
  } catch (err) {
    return fail(err, 'Nie udało się usunąć z rankingu.');
  }
}

/** Lift the opt-out. The next enrolment sweep re-adds the row. */
export async function allowInRanking(steamIds: string[]): Promise<ActionResult> {
  try {
    await requireWebsiteAdmin();
    await restoreToRanking(steamIds);
    revalidatePath('/admin/inhouse/accounts');
    return { ok: true, message: 'Konto wróci do rankingu przy najbliższej synchronizacji.' };
  } catch (err) {
    return fail(err, 'Nie udało się przywrócić do rankingu.');
  }
}

/**
 * Detach one Steam account from a Discord profile.
 *
 * Goes through the shared core's `unlinkSteamAccount`, which is doing more than
 * removing an array entry: it detaches that account's attendance rows, clears
 * the teammate set and recomputes the counters from what remains. Someone with
 * three accounts who unlinks a smurf must not lose the games played on their
 * main, and that arithmetic is exactly what is easy to get wrong by hand.
 */
export async function unlinkSteam(discordId: string, steamId32: string): Promise<ActionResult> {
  try {
    await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { ok: false, message: 'Firestore nie jest skonfigurowany.' };

    const res = await getInhouseStore().unlinkSteamAccount(discordId, steamId32);
    if (!res.ok) return { ok: false, message: 'Tego konta nie ma na liście gracza.' };

    revalidatePath('/admin/inhouse/accounts');
    return {
      ok: true,
      message:
        `Odłączono ${steamId32}. Pozostało kont: ${res.remaining.length}. ` +
        `Odpięto ${res.gamesDetached} wpisów frekwencji.`,
    };
  } catch (err) {
    return fail(err, 'Nie udało się odłączyć konta Steam.');
  }
}

/**
 * Delete the Discord profile entirely.
 *
 * Unlinks every Steam account first — same recompute as above — then removes
 * the document. What deliberately survives: the attendance ledger and the match
 * records. Those are the history of games that were actually played, they are
 * keyed on Steam IDs rather than on this profile, and deleting them would
 * rewrite matches other people took part in.
 *
 * So this is "forget who this person is", not "erase the games". If they sign in
 * again a fresh profile is created, and linking the same Steam account brings
 * the history back through the usual retroactive backfill.
 */
export async function deletePlayerProfile(discordId: string): Promise<ActionResult> {
  try {
    await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { ok: false, message: 'Firestore nie jest skonfigurowany.' };

    const store = getInhouseStore();
    const player = await store.getPlayer(discordId);
    if (!player) return { ok: false, message: 'Nie znaleziono profilu.' };

    if ((player.steamIds ?? []).length > 0) {
      // No steamId argument means "all of them" — the one caller that genuinely
      // means that, per the core's own note.
      await store.unlinkSteamAccount(discordId);
    }

    // Deleted directly rather than through the store: the vendored core has no
    // delete for players, and adding one there is not this repo's to make (see
    // core/VENDORED.md). The teammates sub-collection goes too, since
    // `unlinkSteamAccount` above has already emptied it of meaning.
    const ref = getDb().collection('inhousePlayers').doc(discordId);
    const teammates = await ref.collection('teammates').limit(450).get();
    if (!teammates.empty) {
      const batch = getDb().batch();
      for (const doc of teammates.docs) batch.delete(doc.ref);
      await batch.commit();
    }
    await ref.delete();

    revalidatePath('/admin/inhouse/accounts');
    return {
      ok: true,
      message: 'Usunięto profil. Historia meczów pozostaje — jest przypisana do kont Steam.',
    };
  } catch (err) {
    return fail(err, 'Nie udało się usunąć profilu.');
  }
}
