'use server';

import { revalidatePath } from 'next/cache';
import { getDb, isInhouseConfigured } from '@/lib/firebase-admin';
import { requireWebsiteAdmin, isAuthError } from '@/lib/inhouse/admin-guard';
import { setLobbyPassword } from '@/lib/inhouse/lobby-config';
import {
  getInhouseStore,
  resolveSettings,
  COLLECTIONS,
  DOTA_TV_DELAYS,
  GAME_MODE_NAMES,
  SERVER_REGION_NAMES,
} from '@/lib/inhouse/store';

export interface FormState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
}

function n(formData: FormData, key: string): number {
  return Number(formData.get(key));
}

function b(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

// ─── inhouseConfig/global — admin defaults (§4, blocking prerequisite) ───────

export async function saveInhouseDefaults(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { status: 'error', message: 'Firestore nie jest skonfigurowany.' };

    const gameMode = n(formData, 'gameMode');
    const serverRegion = n(formData, 'serverRegion');
    const dotaTvDelay = n(formData, 'dotaTvDelay');
    const leagueId = n(formData, 'leagueId');

    // Validate against the shared enum maps (§9.1).
    if (!(gameMode in GAME_MODE_NAMES)) return { status: 'error', message: 'Nieprawidłowy tryb gry.' };
    if (!(serverRegion in SERVER_REGION_NAMES)) return { status: 'error', message: 'Nieprawidłowy region.' };
    if (!DOTA_TV_DELAYS.includes(dotaTvDelay as (typeof DOTA_TV_DELAYS)[number])) {
      return { status: 'error', message: 'Opóźnienie DotaTV musi być: 10, 120, 300 lub 900 s.' };
    }
    if (!Number.isInteger(leagueId) || leagueId < 0) {
      return { status: 'error', message: 'League ID musi być liczbą całkowitą ≥ 0.' };
    }

    const banLadderDays = String(formData.get('banLadderDays') ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((x) => Number.isFinite(x));

    const existing = await getInhouseStore().getAdminDefaults();
    const resolved = resolveSettings(existing, {
      gameMode,
      serverRegion,
      dotaTvDelay,
      leagueId,
      selectionPriorityRules: n(formData, 'selectionPriorityRules'),
      immortalDraft: b(formData, 'immortalDraft'),
      cheatsEnabled: b(formData, 'cheatsEnabled'),
      fillWithBots: b(formData, 'fillWithBots'),
      allowSpectators: b(formData, 'allowSpectators'),
      reservationTtlSeconds: n(formData, 'reservationTtlSeconds'),
      idleLobbyExpiryMinutes: n(formData, 'idleLobbyExpiryMinutes'),
      autoPublishNudgeMinutes: n(formData, 'autoPublishNudgeMinutes'),
      publishGateGames: n(formData, 'publishGateGames'),
      publishesPerDay: n(formData, 'publishesPerDay'),
      startCountdownSeconds: n(formData, 'startCountdownSeconds'),
      newcomerReservedSlots: n(formData, 'newcomerReservedSlots'),
      ...(banLadderDays.length ? { banLadderDays } : {}),
    });

    await getDb().collection(COLLECTIONS.config).doc('global').set(resolved);
    revalidatePath('/admin/inhouse');
    return {
      status: 'ok',
      message: leagueId === 0
        ? 'Zapisano. Uwaga: League ID = 0 — mecze nie będą publicznie pobierane.'
        : 'Zapisano ustawienia domyślne.',
    };
  } catch (err) {
    console.error('saveInhouseDefaults', err);
    return { status: 'error', message: isAuthError(err) ? 'Brak uprawnień.' : 'Nie udało się zapisać.' };
  }
}

// ─── inhouseConfig/lobby — the shared lobby password (§7.2) ──────────────────

export async function saveLobbyPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { status: 'error', message: 'Firestore nie jest skonfigurowany.' };

    const password = String(formData.get('password') ?? '').trim();

    // Dota's lobby password field is what this ends up in, and players retype it
    // from a card — so no whitespace, and short enough to not be a chore.
    if (!password) return { status: 'error', message: 'Hasło nie może być puste.' };
    if (/\s/.test(password)) return { status: 'error', message: 'Hasło nie może zawierać spacji.' };
    if (password.length > 32) return { status: 'error', message: 'Hasło może mieć maksymalnie 32 znaki.' };

    await setLobbyPassword(password);
    revalidatePath('/admin/inhouse');
    return {
      status: 'ok',
      message: 'Zapisano hasło. Obowiązuje dla lobby tworzonych od teraz.',
    };
  } catch (err) {
    console.error('saveLobbyPassword', err);
    return { status: 'error', message: isAuthError(err) ? 'Brak uprawnień.' : 'Nie udało się zapisać.' };
  }
}

// ─── inhouseConfig/admins — Discord + Steam admin ids (§9.2) ─────────────────

function parseIds(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

export async function saveInhouseAdmins(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireWebsiteAdmin();
    if (!isInhouseConfigured()) return { status: 'error', message: 'Firestore nie jest skonfigurowany.' };

    const discordIds = parseIds(formData.get('discordIds'));
    const steamIds = parseIds(formData.get('steamIds'));

    await getDb().collection(COLLECTIONS.config).doc('admins').set({ discordIds, steamIds });
    revalidatePath('/admin/inhouse');
    return {
      status: 'ok',
      message: `Zapisano: ${discordIds.length} Discord, ${steamIds.length} Steam. Zmiany działają w bocie do ~60 s.`,
    };
  } catch (err) {
    console.error('saveInhouseAdmins', err);
    return { status: 'error', message: isAuthError(err) ? 'Brak uprawnień.' : 'Nie udało się zapisać.' };
  }
}
