// Pure presentation helpers for inhouse surfaces. No Admin SDK, no server-only
// imports — safe in client components. The enum→name maps come straight from
// the shared package so the website labels a mode/region exactly as the bot's
// !settings does.

import { GAME_MODE_NAMES, SERVER_REGION_NAMES } from './core/settings';

export function modeName(gameMode: number): string {
  return GAME_MODE_NAMES[gameMode] ?? `Mode ${gameMode}`;
}

/**
 * Polish names for the EServerRegion values.
 *
 * The Dota API only ever gives a number, and the shared package maps those to
 * English labels for the bot's lobby chat. The website is Polish, so it gets its
 * own map rather than editing the vendored copy (see core/VENDORED.md). Keys
 * must stay in step with `SERVER_REGION_NAMES`; anything missing falls back to
 * the English label rather than showing a bare number.
 */
export const SERVER_REGION_NAMES_PL: Record<number, string> = {
  1: 'USA Zachód',
  2: 'USA Wschód',
  3: 'Europa Zachodnia',
  4: 'Korea',
  5: 'Azja Południowo-Wschodnia',
  6: 'Dubaj',
  7: 'Australia',
  8: 'Europa Wschodnia (Sztokholm)',
  9: 'Austria',
  10: 'Brazylia',
  11: 'RPA',
  14: 'Chile',
  15: 'Peru',
  16: 'Indie',
  19: 'Japonia',
  25: 'Tajwan',
  37: 'Argentyna',
};

export function regionName(serverRegion: number): string {
  return (
    SERVER_REGION_NAMES_PL[serverRegion] ??
    SERVER_REGION_NAMES[serverRegion] ??
    `Region ${serverRegion}`
  );
}

/**
 * A `steam://` link that launches Dota 2 straight into spectating this league.
 *
 * There is no Valve-documented URL for "spectate match #N" — the only surviving
 * mechanism is the `dota_spectator_auto_spectate_games` convar, which takes a
 * league ID and picks up that league's live game. Inhouse games are league
 * games (that is what makes their results publicly retrievable at all), so the
 * league ID is exactly the handle we have.
 *
 * Returns null when no league is configured, since the convar would then have
 * nothing to latch onto and the button would silently do nothing.
 */
export function spectateUrl(leagueId: number): string | null {
  if (!Number.isInteger(leagueId) || leagueId <= 0) return null;
  // Only the space is escaped. The leading `+` must reach Steam literally — it
  // is what marks the rest as a launch command, and percent-encoding it turns
  // the whole thing into an argument Dota ignores.
  return `steam://rungame/570//+dota_spectator_auto_spectate_games%20${leagueId}`;
}

/** Polish label for a game state, as shown on the lobby cards. */
export function stateLabel(state: string): string {
  switch (state) {
    case 'open':
    case 'ready':
      return 'nabór';
    case 'in_progress':
      return 'w trakcie';
    case 'finished':
      return 'zakończony';
    default:
      return 'zamknięty';
  }
}

/** DotaTV delay as human copy: "2 min" / "10 s". */
export function delayLabel(seconds: number): string {
  return seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
}

/** Match duration as m:ss (e.g. 2530 → "42:10"). */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Which name to show for a player (§3.1a). Prefer the server nickname the bot
 * keeps current, then the denormalized roster copy, then the Steam persona,
 * then a Steam-ID fallback. Never the Discord *global* username.
 */
export function resolveDisplayName(opts: {
  discordName?: string | null;
  displayName?: string | null;
  playerName?: string | null;
  steamId32?: string | null;
}): string {
  return (
    opts.discordName?.trim() ||
    opts.displayName?.trim() ||
    opts.playerName?.trim() ||
    (opts.steamId32 ? `Player ${opts.steamId32}` : 'Player')
  );
}

const STEAM64_BASE = BigInt('76561197960265728');

export function toSteam64(id32: string): string {
  return String(BigInt(id32) + STEAM64_BASE);
}

export function toSteam32(id64: string): string {
  return String(BigInt(id64) - STEAM64_BASE);
}

/** Compact "za 2 godz." / "za 15 min" style label for a future ISO timestamp. */
export function untilLabelPl(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return 'teraz';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `za ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `za ${hours} godz.`;
  const days = Math.round(hours / 24);
  return `za ${days} dni`;
}
