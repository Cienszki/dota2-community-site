'use server';

import { revalidatePath } from 'next/cache';
import { getDb, isInhouseConfigured } from '@/lib/firebase-admin';
import { requireWebsiteAdmin, isAuthError } from '@/lib/inhouse/admin-guard';

export interface RecurringSlot {
  id: string;
  label: string;
  daysOfWeek: number[];
  time: string;
  timeZoneOffsetMinutes: number;
  openAheadMinutes: number;
  hostDiscordId: string;
  hostName: string;
  autoPublish: boolean;
  enabled: boolean;
}

export interface SlotFormState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
}

const SCHEDULE_DOC = () => getDb().collection('inhouseConfig').doc('schedule');

async function readSlots(): Promise<RecurringSlot[]> {
  const snap = await SCHEDULE_DOC().get();
  const data = snap.data();
  return Array.isArray(data?.slots) ? (data!.slots as RecurringSlot[]) : [];
}

async function writeSlots(slots: RecurringSlot[]): Promise<void> {
  await SCHEDULE_DOC().set({ slots });
  revalidatePath('/admin/inhouse/schedule');
}

export async function addSlot(_prev: SlotFormState, formData: FormData): Promise<SlotFormState> {
  try {
    await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { status: 'error', message: 'Firestore nie jest skonfigurowany.' };

    const label = String(formData.get('label') ?? '').trim();
    const time = String(formData.get('time') ?? '').trim();
    const daysOfWeek = formData.getAll('daysOfWeek').map((d) => Number(d)).filter((d) => d >= 0 && d <= 6);

    if (!label) return { status: 'error', message: 'Podaj nazwę.' };
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) return { status: 'error', message: 'Godzina w formacie HH:MM.' };
    if (!daysOfWeek.length) return { status: 'error', message: 'Wybierz co najmniej jeden dzień.' };

    const slot: RecurringSlot = {
      id: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}-${time.replace(':', '')}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      daysOfWeek,
      time,
      timeZoneOffsetMinutes: Number(formData.get('timeZoneOffsetMinutes') ?? 120),
      openAheadMinutes: Number(formData.get('openAheadMinutes') ?? 240),
      hostDiscordId: String(formData.get('hostDiscordId') ?? '').trim(),
      hostName: String(formData.get('hostName') ?? 'Community').trim() || 'Community',
      autoPublish: formData.get('autoPublish') === 'on',
      enabled: true,
    };

    const slots = await readSlots();
    slots.push(slot);
    await writeSlots(slots);
    return { status: 'ok', message: `Dodano slot „${label}”.` };
  } catch (err) {
    console.error('addSlot', err);
    return { status: 'error', message: isAuthError(err) ? 'Brak uprawnień.' : 'Nie udało się dodać slotu.' };
  }
}

export async function deleteSlot(id: string): Promise<{ ok: boolean }> {
  try {
    await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { ok: false };
    const slots = (await readSlots()).filter((s) => s.id !== id);
    await writeSlots(slots);
    return { ok: true };
  } catch (err) {
    console.error('deleteSlot', err);
    return { ok: false };
  }
}

export async function toggleSlot(id: string): Promise<{ ok: boolean }> {
  try {
    await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { ok: false };
    const slots = (await readSlots()).map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    await writeSlots(slots);
    return { ok: true };
  } catch (err) {
    console.error('toggleSlot', err);
    return { ok: false };
  }
}
