// @dota2inhouse/core
//
// Shared inhouse domain logic. Consumed by two independent codebases:
//
//   - the lobby bot   (this repo: Discord gateway + Steam/Dota workers)
//   - the website     (separate repo: public pages, member surfaces, admin panel)
//
// Everything in here is safety-critical to keep identical across both. Three
// pieces in particular produce bugs that only appear under load if they drift:
//
//   InhouseStore.createReservation        race-safe slot allocation
//   InhouseStore.createModerationRecord   ban record + enforcement index
//   InhouseStore.computeSlots             the in-lobby / reserved double-count fix
//
// That is the whole reason this package exists. Reimplementing any of them on
// one side is how you get a lobby that overbooks at nine players, or a ban that
// silently doesn't enforce.
//
// Deliberately NOT here — worker-only, and dependent on a live Dota connection:
//   ban-guard.ts     kicks a banned Steam ID out of a lobby
//   chat-commands.ts the `!command` surface
//   session.ts       per-game orchestration against the Game Coordinator
//   fun.ts           `!roll`, `!coin`, `!wisdom` and friends
//
// There is no team-balancing or player-rating logic here, and there must not
// be: teams are decided in Dota, not by this system.

// ─── Domain types ────────────────────────────────────────────────────────────
export type {
  InhouseMode,
  GameState,
  TeamSide,
  LinkSource,
  ModerationKind,
  CommandTier,
  InhouseSettings,
  ResolvedSettings,
  InhouseGame,
  SlotSnapshot,
  GameResult,
  Membership,
  Reservation,
  WaitlistEntry,
  InhousePlayer,
  ModerationRecord,
  BanStatus,
  AttendanceRecord,
  LinkCode,
  ReadyEntry,
  SlotCounts,
} from './types';

export {
  ACCOUNT_HOLDING_STATES,
  TERMINAL_STATES,
  PLAYING_SIDES,
  isTerminal,
} from './types';

// ─── Settings (§4) ───────────────────────────────────────────────────────────
export {
  GAME_MODES,
  GAME_MODE_NAMES,
  SERVER_REGIONS,
  SERVER_REGION_NAMES,
  DOTA_TV_DELAYS,
  LOBBY_VISIBILITY,
  lobbyVisibilityFor,
  DEFAULT_SETTINGS,
  TOURNAMENT_SETTINGS,
  CHANGEABLE_SETTINGS,
  resolveSettings,
  normalizeDotaTvDelay,
  parseSettingCommand,
  formatSettings,
} from './settings';
export type { SettingChange } from './settings';

// ─── Firestore access ────────────────────────────────────────────────────────
export { InhouseStore, COLLECTIONS, LOBBY_CAPACITY, DEFAULT_MAX_OPEN_LOBBIES } from './store';

// ─── Steam account leasing (§12) ─────────────────────────────────────────────
export { leaseAccount, renewLease, releaseAccount, poolStatus, LEASE_TIMEOUT_MS } from './lease';
export type { LeaseResult } from './lease';

// ─── Result ingestion (§12) ──────────────────────────────────────────────────
export {
  ingestMatchResult,
  writeMatchResult,
  backfillAwards,
  backfillOnLink,
  fetchMatch,
  sideFromSlot,
} from './attendance';
export type { IngestOptions, IngestResult, OpenDotaMatch, OpenDotaPlayer } from './attendance';

export {
  fetchMatchDetails,
  waitForMatchDetails,
  abandoned,
  SteamApiError,
} from './steam-api';
export type { SteamMatchDetails, SteamMatchPlayer } from './steam-api';

// ─── Silly awards (§10) ──────────────────────────────────────────────────────
export { AWARDS, selectAwards } from './awards';
export type { Award, AwardDefinition } from './awards';

// ─── Steam ↔ Discord linking (§3) ────────────────────────────────────────────
export { generateCode, issueLinkCode, LINK_CODE_TTL_SECONDS } from './link-codes';

// ─── Logging ─────────────────────────────────────────────────────────────────
export { logger, setLogSink } from './logger';
export type { LogLevel, LogSink } from './logger';
