// Pure presentation helpers for inhouse surfaces. No Admin SDK, no server-only
// imports — safe in client components. The enum→name maps come straight from
// the shared package so the website labels a mode/region exactly as the bot's
// !settings does.

import { GAME_MODE_NAMES, SERVER_REGION_NAMES } from './core/settings';

export function modeName(gameMode: number): string {
  return GAME_MODE_NAMES[gameMode] ?? `Mode ${gameMode}`;
}

export function regionName(serverRegion: number): string {
  return SERVER_REGION_NAMES[serverRegion] ?? `Region ${serverRegion}`;
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
