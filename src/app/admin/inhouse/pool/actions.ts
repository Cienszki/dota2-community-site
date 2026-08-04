'use server';

import { revalidatePath } from 'next/cache';
import { getDb, isInhouseConfigured } from '@/lib/firebase-admin';
import { requireWebsiteAdmin, isAuthError } from '@/lib/inhouse/admin-guard';
import { releaseAccount } from '@/lib/inhouse/store';

export async function forceRelease(botAccountId: string): Promise<{ ok: boolean; message: string }> {
  try {
    await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { ok: false, message: 'Firestore nie jest skonfigurowany.' };
    await releaseAccount(getDb(), botAccountId);
    revalidatePath('/admin/inhouse/pool');
    return { ok: true, message: 'Zwolniono konto do puli.' };
  } catch (err) {
    console.error('forceRelease', err);
    return { ok: false, message: isAuthError(err) ? 'Brak uprawnień.' : 'Nie udało się zwolnić.' };
  }
}
