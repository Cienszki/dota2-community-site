// src/inhouse/settings.ts
// Admin defaults (§4) and the enum maps that back the `!mode` / `!region` chat
// commands.
//
// Precedence, lowest to highest:
//   DEFAULT_SETTINGS  →  admin defaults (Firestore `inhouseConfig/global`)
//                     →  per-game overrides (set by `!mode`, `!delay`, …)
//
// Keeping the whole surface here is what lets the create wizard have exactly one
// field: everything unusual is a chat command later, not a form.

import type { InhouseSettings, ResolvedSettings, InhouseMode } from './types';

// ─── Dota 2 enum maps ────────────────────────────────────────────────────────

/**
 * DOTA_GameMode values accepted by `!mode`.
 *
 * Note on "All Pick": the modern Dota client's lobby dropdown labelled
 * "All Pick" is DOTA_GAMEMODE_ALL_DRAFT (22), not the legacy
 * DOTA_GAMEMODE_AP (1). Both are exposed — `ap` gives you what players expect.
 */
export const GAME_MODES: Record<string, number> = {
  ap: 22,          // All Pick (modern / all draft) — the inhouse default
  allpick: 22,
  'all pick': 22,
  apclassic: 1,    // Legacy All Pick
  cm: 2,           // Captains Mode — the tournament default
  captains: 2,
  'captains mode': 2,
  rd: 3,           // Random Draft
  random: 3,
  sd: 4,           // Single Draft
  single: 4,
  ar: 5,           // All Random
  allrandom: 5,
  cd: 16,          // Captains Draft
  abilitydraft: 18,
  ad: 18,
  turbo: 23,
};

export const GAME_MODE_NAMES: Record<number, string> = {
  1: 'All Pick (classic)',
  2: 'Captains Mode',
  3: 'Random Draft',
  4: 'Single Draft',
  5: 'All Random',
  16: 'Captains Draft',
  18: 'Ability Draft',
  22: 'All Pick',
  23: 'Turbo',
};

/** EServerRegion values accepted by `!region`. */
export const SERVER_REGIONS: Record<string, number> = {
  uswest: 1,
  useast: 2,
  eu: 3,
  euwest: 3,
  europe: 3,
  korea: 4,
  singapore: 5,
  sea: 5,
  dubai: 6,
  australia: 7,
  aus: 7,
  stockholm: 8,
  eueast: 8,
  austria: 9,
  brazil: 10,
  southafrica: 11,
  chile: 14,
  peru: 15,
  india: 16,
  japan: 19,
  taiwan: 25,
  argentina: 37,
};

export const SERVER_REGION_NAMES: Record<number, string> = {
  1: 'US West',
  2: 'US East',
  3: 'EU West',
  4: 'Korea',
  5: 'SE Asia',
  6: 'Dubai',
  7: 'Australia',
  8: 'EU East (Stockholm)',
  9: 'Austria',
  10: 'Brazil',
  11: 'South Africa',
  14: 'Chile',
  15: 'Peru',
  16: 'India',
  19: 'Japan',
  25: 'Taiwan',
  37: 'Argentina',
};

/** Valid DotaTV delays, in seconds — the GC only accepts these four. */
export const DOTA_TV_DELAYS = [10, 120, 300, 900] as const;

/** DOTALobbyVisibility. */
export const LOBBY_VISIBILITY = {
  public: 0,
  friends: 1,
  unlisted: 2,
} as const;

/**
 * Lobby visibility follows publication, and is derived rather than configured.
 *
 * This is load-bearing for the most common way people actually join: they see
 * the game mentioned, open Dota, and find the lobby in the in-game browser
 * without ever touching Discord or the website.
 *
 *   unpublished → Unlisted. Invisible in the browser, so only the people the
 *                 host tells can find it. That is what "choose who to hear
 *                 about it first" means in practice.
 *   published   → Public. Listed in the browser and joinable by anyone with
 *                 the password, which is the whole point of publishing.
 *
 * The password still gates entry in both cases; visibility only controls
 * whether the lobby is *discoverable*.
 */
export function lobbyVisibilityFor(published: boolean): number {
  return published ? LOBBY_VISIBILITY.public : LOBBY_VISIBILITY.unlisted;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/**
 * Baseline settings for an inhouse game. The admin panel overrides these
 * centrally (see docs/admin-panel-notes.md); nothing here is per-game.
 *
 * `leagueId: 0` means "not configured". A game created with leagueId 0 will
 * still run, but the match is NOT publicly retrievable, which breaks the
 * attendance ledger and every match page. The worker logs a loud warning.
 */
export const DEFAULT_SETTINGS: ResolvedSettings = {
  mode: 'inhouse',

  published: false,
  locked: false,

  gameMode: GAME_MODES.ap,
  serverRegion: SERVER_REGIONS.eueast,
  dotaTvDelay: 120,
  leagueId: 0,
  selectionPriorityRules: 1, // coin flip for first pick / side (§4)
  immortalDraft: false,
  cheatsEnabled: false,
  fillWithBots: false,
  allowSpectators: true,
  pauseSetting: 1,

  reservationTtlSeconds: 300,
  idleLobbyExpiryMinutes: 45,
  autoPublishNudgeMinutes: 20,
  publishGateGames: 3,
  publishesPerDay: 0,
  startCountdownSeconds: 30,
  banLadderDays: [7, 30, 0], // 0 = permanent
  newcomerReservedSlots: 2,
};

/**
 * Settings a tournament session inherits. Preserves the behaviour that existed
 * before inhouses: Captains Mode, no reservations, no publish flow.
 */
export const TOURNAMENT_SETTINGS: ResolvedSettings = {
  ...DEFAULT_SETTINGS,
  mode: 'tournament',
  gameMode: GAME_MODES.cm,
  published: false,
  locked: false,
  reservationTtlSeconds: 0,
  autoPublishNudgeMinutes: 0,
};

function baselineFor(mode: InhouseMode): ResolvedSettings {
  return mode === 'tournament' ? TOURNAMENT_SETTINGS : DEFAULT_SETTINGS;
}

// ─── Coercion helpers ────────────────────────────────────────────────────────

function num(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 'on', 'yes', '1'].includes(s)) return true;
    if (['false', 'off', 'no', '0'].includes(s)) return false;
  }
  return fallback;
}

function str<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  return fallback;
}

function numArray(v: unknown, fallback: number[]): number[] {
  if (Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return v as number[];
  }
  return fallback;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

/**
 * Merge zero or more partial settings layers over the mode-appropriate baseline.
 * Later layers win. Undefined/absent fields never clobber an earlier layer.
 *
 * The mode is taken from the LAST layer that specifies one, because the mode
 * decides which baseline applies.
 */
export function resolveSettings(
  ...layers: Array<Record<string, unknown> | InhouseSettings | undefined | null>
): ResolvedSettings {
  const present = layers.filter(
    (l): l is Record<string, unknown> => l !== undefined && l !== null
  );

  let mode: InhouseMode = DEFAULT_SETTINGS.mode;
  for (const layer of present) {
    if (layer.mode === 'tournament' || layer.mode === 'inhouse') {
      mode = layer.mode;
    }
  }

  const base = baselineFor(mode);
  // Flatten: later layers overwrite earlier ones, skipping undefined values.
  const merged: Record<string, unknown> = {};
  for (const layer of present) {
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined) merged[k] = v;
    }
  }

  return {
    mode,

    published: bool(merged.published, base.published),
    locked: bool(merged.locked, base.locked),

    gameMode: num(merged.gameMode, base.gameMode),
    serverRegion: num(merged.serverRegion, base.serverRegion),
    dotaTvDelay: normalizeDotaTvDelay(num(merged.dotaTvDelay, base.dotaTvDelay)),
    leagueId: num(merged.leagueId, base.leagueId),
    selectionPriorityRules: num(merged.selectionPriorityRules, base.selectionPriorityRules),
    immortalDraft: bool(merged.immortalDraft, base.immortalDraft),
    cheatsEnabled: bool(merged.cheatsEnabled, base.cheatsEnabled),
    fillWithBots: bool(merged.fillWithBots, base.fillWithBots),
    allowSpectators: bool(merged.allowSpectators, base.allowSpectators),
    pauseSetting: num(merged.pauseSetting, base.pauseSetting),

    reservationTtlSeconds: num(merged.reservationTtlSeconds, base.reservationTtlSeconds),
    idleLobbyExpiryMinutes: num(merged.idleLobbyExpiryMinutes, base.idleLobbyExpiryMinutes),
    autoPublishNudgeMinutes: num(merged.autoPublishNudgeMinutes, base.autoPublishNudgeMinutes),
    publishGateGames: num(merged.publishGateGames, base.publishGateGames),
    publishesPerDay: num(merged.publishesPerDay, base.publishesPerDay),
    startCountdownSeconds: num(merged.startCountdownSeconds, base.startCountdownSeconds),
    banLadderDays: numArray(merged.banLadderDays, base.banLadderDays),
    newcomerReservedSlots: num(merged.newcomerReservedSlots, base.newcomerReservedSlots),
  };
}

/** Snap an arbitrary delay to the nearest valid DotaTV enum value. */
export function normalizeDotaTvDelay(seconds: number): number {
  if (seconds <= 10) return 10;
  if (seconds <= 120) return 120;
  if (seconds <= 300) return 300;
  return 900;
}

// ─── Chat-command parsing (§4 "Initiator overrides, by command only") ────────

export interface SettingChange {
  ok: boolean;
  /** The settings patch to apply, when ok. */
  patch?: Partial<InhouseSettings>;
  /** One-line lobby-chat response. Always present. */
  message: string;
}

/**
 * Parse an initiator setting override from lobby chat.
 * `key` is the command word without the leading `!`.
 *
 * Returns a patch rather than mutating, so the caller decides whether the game
 * is still pre-start (settings are frozen once the match launches).
 */
export function parseSettingCommand(key: string, rawArg: string): SettingChange {
  const arg = rawArg.trim().toLowerCase();

  switch (key) {
    case 'mode': {
      if (!arg) return { ok: false, message: `Usage: !mode ap|cm|rd|sd|ar|turbo` };
      const value = GAME_MODES[arg];
      if (value === undefined) {
        return { ok: false, message: `Unknown mode "${rawArg.trim()}". Try: ap, cm, rd, sd, ar, turbo` };
      }
      return { ok: true, patch: { gameMode: value }, message: `Mode set to ${GAME_MODE_NAMES[value] ?? value}.` };
    }

    case 'region': {
      if (!arg) return { ok: false, message: `Usage: !region eu|eueast|useast|sea|…` };
      const value = SERVER_REGIONS[arg.replace(/[\s_-]/g, '')];
      if (value === undefined) {
        return { ok: false, message: `Unknown region "${rawArg.trim()}". Try: eu, eueast, useast, uswest, sea, aus` };
      }
      return { ok: true, patch: { serverRegion: value }, message: `Region set to ${SERVER_REGION_NAMES[value] ?? value}.` };
    }

    case 'delay': {
      if (!arg) return { ok: false, message: `Usage: !delay 0|2|5|15  (minutes)` };
      const minutes = Number(arg);
      if (!Number.isFinite(minutes) || minutes < 0) {
        return { ok: false, message: `!delay takes minutes: 0, 2, 5 or 15.` };
      }
      const seconds = normalizeDotaTvDelay(minutes * 60);
      return {
        ok: true,
        patch: { dotaTvDelay: seconds },
        message: `DotaTV delay set to ${seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`}.`,
      };
    }

    case 'immortal': {
      const on = bool(arg, false);
      return {
        ok: true,
        patch: { immortalDraft: on },
        message: `Immortal draft ${on ? 'on' : 'off'}.`,
      };
    }

    case 'firstpick': {
      // "auto"/"coin" → GC coin flip; "manual" → bot decides, no player prompt.
      if (['coin', 'auto', 'flip', 'on'].includes(arg)) {
        return { ok: true, patch: { selectionPriorityRules: 1 }, message: `First pick: coin flip.` };
      }
      if (['manual', 'off', 'none'].includes(arg)) {
        return { ok: true, patch: { selectionPriorityRules: 0 }, message: `First pick: manual (no coin flip).` };
      }
      return { ok: false, message: `Usage: !firstpick coin|manual` };
    }

    default:
      return { ok: false, message: `Unknown setting "${key}". Try !help settings` };
  }
}

/** The settings `!settings` prints, in the order it prints them. */
export function formatSettings(s: ResolvedSettings): string {
  const parts = [
    GAME_MODE_NAMES[s.gameMode] ?? `mode ${s.gameMode}`,
    SERVER_REGION_NAMES[s.serverRegion] ?? `region ${s.serverRegion}`,
    `DotaTV ${s.dotaTvDelay >= 60 ? `${s.dotaTvDelay / 60}m` : `${s.dotaTvDelay}s`}`,
    `first pick ${s.selectionPriorityRules === 1 ? 'coin flip' : 'manual'}`,
  ];
  if (s.immortalDraft) parts.push('immortal draft');
  if (s.locked) parts.push('LOCKED');
  return parts.join(' · ');
}

/** What `!help settings` lists. */
export const CHANGEABLE_SETTINGS = ['mode', 'region', 'delay', 'immortal', 'firstpick'] as const;
