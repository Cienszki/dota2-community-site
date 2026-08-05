// src/inhouse/types.ts
// Shared domain types for the inhouse system.
//
// These are used by BOTH processes:
//   - the lobby worker (src/index.ts)   — executes Dota 2 GC operations
//   - the Discord gateway (src/discord/) — renders panels and cards
//
// Firestore is the shared state store between them. Every type here maps to a
// document shape described in docs/inhouse-data-model.md.

/**
 * Distinguishes the two kinds of session this bot can host.
 * `tournament` preserves all pre-existing behaviour (fixed teams, auto-kick of
 * uninvited players, late timer). `inhouse` is the open 5v5 flow.
 */
export type InhouseMode = 'tournament' | 'inhouse';

/**
 * Game lifecycle. Mirrors the state machine in the design doc §12.
 *
 *   draft → lobby_creating → open → ready → in_progress → finished
 *                │            │        │
 *                │            │        └─ abandoned (no match_id ever arrived)
 *                │            └────────── expired / cancelled
 *                └─────────────────────── failed (3 create retries exhausted)
 */
export type GameState =
  | 'draft'
  | 'lobby_creating'
  | 'open'
  | 'ready'
  | 'in_progress'
  | 'finished'
  | 'cancelled'
  | 'expired'
  | 'abandoned'
  | 'failed';

/** States in which the game still occupies a leased Steam account. */
export const ACCOUNT_HOLDING_STATES: readonly GameState[] = [
  'lobby_creating',
  'open',
  'ready',
  'in_progress',
];

/** States from which no further transition is possible. */
export const TERMINAL_STATES: readonly GameState[] = [
  'finished',
  'cancelled',
  'expired',
  'abandoned',
  'failed',
];

export function isTerminal(state: GameState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** Which side of the lobby a member currently occupies. */
export type TeamSide = 'radiant' | 'dire' | 'spectator' | 'unassigned';

/** Sides that count as "going to play" for slot accounting (§7.1). */
export const PLAYING_SIDES: readonly TeamSide[] = ['radiant', 'dire', 'unassigned'];

/** How a player's Steam↔Discord link was established (§3). */
export type LinkSource = 'discord_connection' | 'steam_openid' | 'lobby_code' | 'manual';

/** Moderation record kind (§2). */
export type ModerationKind = 'warn' | 'ban';

/** Permission tier for a lobby chat command (§7.3). */
export type CommandTier = 'everyone' | 'initiator' | 'admin';

// ─── Settings ────────────────────────────────────────────────────────────────

/**
 * Admin defaults (§4). Set once on the website; every game inherits them.
 * All fields optional on the wire; `resolveSettings()` fills the gaps.
 */
export interface InhouseSettings {
  mode?: InhouseMode;

  // ── Runtime state of a single game (not admin defaults) ──
  published?: boolean;
  locked?: boolean;

  // ── Lobby configuration ──
  /** Dota2 DOTA_GameMode enum. 2 = All Pick (Captains Mode = 2? see GAME_MODES). */
  gameMode?: number;
  /** Dota2 EServerRegion enum. 8 = Europe West. */
  serverRegion?: number;
  /** DotaTV delay in seconds — mapped to the LobbyDotaTVDelay enum by DotaClient. */
  dotaTvDelay?: number;
  /** League ID. Required for matches to be publicly retrievable (§1). */
  leagueId?: number;
  /**
   * 0 = Manual (bot decides sides, single launch call)
   * 1 = Automatic / coin flip (players pick side + pick order, two-phase launch)
   */
  selectionPriorityRules?: number;
  /**
   * Immortal Draft — random captains who draft their own teams.
   *
   * NOT CURRENTLY APPLIED. The Game Coordinator schema bundled with
   * `dota2@6.2.0` has no field for it (see docs/worker-api.md), so this value
   * is stored and displayed but never reaches the lobby. Teams are seated by
   * the players themselves until the schema is updated.
   */
  immortalDraft?: boolean;
  cheatsEnabled?: boolean;
  fillWithBots?: boolean;
  allowSpectators?: boolean;
  /** 0 = unlimited, 1 = limited, 2 = disabled */
  pauseSetting?: number;

  // ── Inhouse policy ──
  /** Seconds a reserved slot is held for a linked player (§7.1). */
  reservationTtlSeconds?: number;
  /** Minutes an idle lobby survives with no activity before expiring. */
  idleLobbyExpiryMinutes?: number;
  /** Minutes at 5–9 players before the auto-publish nudge fires (§6). */
  autoPublishNudgeMinutes?: number;
  /** Games a player must have played before they may publish (§15 Q4). */
  publishGateGames?: number;
  /** Max publishes per person per day. 0 = unlimited. */
  publishesPerDay?: number;
  /** Seconds of abortable countdown before launch (§7.2). */
  startCountdownSeconds?: number;
  /** Ban ladder, in days. 0 in the final position means permanent. */
  banLadderDays?: number[];
  /** Reserve N of 10 slots for players with <3 games when a host tags the game. */
  newcomerReservedSlots?: number;
}

export type ResolvedSettings = Required<InhouseSettings>;

// ─── Game ────────────────────────────────────────────────────────────────────

/** A single inhouse game. Firestore: `inhouseGames/{gameId}`. */
export interface InhouseGame {
  id: string;
  /**
   * Short human-readable number ("game #412"). Allocated from a counter doc.
   * This is what admins and players refer to; `id` is the Firestore key.
   */
  gameNumber: number;
  mode: InhouseMode;
  state: GameState;

  /** Discord user ID of whoever pressed Create. Transferable via `!host`. */
  initiatorDiscordId: string;
  /** Steam32 of the initiator, when known. Lets `!host` work from lobby chat. */
  initiatorSteamId32: string | null;
  /** Display name used in card titles ("Pawel's inhouse"). */
  initiatorName: string;

  published: boolean;
  publishedAt: string | null;
  /** Who pressed Publish — may differ from the initiator after a `!host` handover. */
  publishedByDiscordId: string | null;

  locked: boolean;

  settings: ResolvedSettings;

  /** Leased Steam account executing this game's lobby. */
  botAccountId: string | null;
  /** Dota 2 GC lobby ID, once created. */
  dotaLobbyId: string | null;
  lobbyName: string | null;
  lobbyPassword: string | null;
  /** Dota 2 match ID, once the game launches. */
  dotaMatchId: number | null;

  /** Host tagged the game as newcomer-friendly (§11). */
  newcomerFriendly: boolean;

  /** Scheduled start. Null means "now". */
  scheduledFor: string | null;

  /** Discord surfaces owned by this game, so they can be edited in place. */
  discord: {
    hostPanelChannelId: string | null;
    hostPanelMessageId: string | null;
    cardChannelId: string | null;
    cardMessageId: string | null;
    voiceChannelId: string | null;
    scheduledEventId: string | null;
  };

  createdAt: string;
  updatedAt: string;
  /** Set when the game reaches a terminal state. */
  endedAt: string | null;
  /** Human-readable reason for cancelled/expired/failed. */
  endReason: string | null;

  /** Bumped whenever a player joins/leaves — drives the idle expiry clock. */
  lastActivityAt: string;
  /** Set once the auto-publish nudge has fired, so it only fires once. */
  nudgedAt: string | null;

  /**
   * Denormalized slot picture, written by the worker session on every change.
   *
   * Discord and the website read this one record rather than reassembling the
   * count from the event stream — which is what keeps "3 slots open" saying the
   * same thing on every surface at the same moment.
   */
  slotSnapshot?: SlotSnapshot | null;

  /** Filled by result ingestion once the match settles. */
  result?: GameResult | null;
}

export interface SlotSnapshot {
  inLobby: string[];
  radiant: string[];
  dire: string[];
  unassigned: string[];
  committed: number;
  slotsOpen: number;
  reserved: Array<{
    discordId: string;
    steamId32: string;
    playerName: string | null;
    expiresAt: string;
  }>;
  updatedAt: string;
}

export interface GameResult {
  radiantWin: boolean;
  durationSeconds: number;
  /**
   * False until OpenDota's parsed replay data arrives, and permanently false
   * for a match that never parses. Only the awards depend on it — the result
   * itself comes from the Steam Web API and is always present.
   */
  parsed: boolean;
  awards: Array<{ id: string; steamId32: string; text: string }>;
  /**
   * Steam IDs with `leaver_status >= 2`.
   *
   * Surfaced to hosts and admins only, never publicly — this is the one
   * reliable signal for "made nine other people waste an hour", and it is
   * moderation input, not a stat.
   */
  abandoners?: string[];
  ingestedAt: string;
}

/**
 * A player currently sitting in the Dota lobby.
 * Firestore: `inhouseGames/{gameId}/memberships/{steamId32}`.
 *
 * Keyed on steamId32 rather than a player ID **on purpose**: unlinked players
 * appear in lobbies and must be recorded anyway, both to capture ban identity
 * (§2) and to backfill retroactive credit when they link later (§3).
 */
export interface Membership {
  steamId32: string;
  /** Null when the Steam account has never been linked to a Discord user. */
  discordId: string | null;
  /** Steam persona name, as reported by the Game Coordinator. */
  playerName: string | null;
  /**
   * The player's nickname on this Discord server, when they are linked.
   *
   * Preferred over `playerName` everywhere a name is shown: it is the name
   * people actually know each other by, and members keep it current.
   */
  displayName?: string | null;
  side: TeamSide;
  /** Per-team slot index (0-4 within a side), as reported by the GC. */
  slot: number;
  joinedAt: string;
  leftAt: string | null;
}

/**
 * A held slot for a linked player who pressed Join but hasn't arrived yet.
 * Firestore: `inhouseGames/{gameId}/reservations/{discordId}`.
 */
export interface Reservation {
  discordId: string;
  steamId32: string;
  playerName: string | null;
  createdAt: string;
  expiresAt: string;
  /** Set when the Steam ID actually appears in the lobby. */
  consumedAt: string | null;
  /** Set when the TTL lapsed or the player cancelled. */
  releasedAt: string | null;
  releaseReason: 'expired' | 'cancelled' | 'left_lobby' | 'game_ended' | null;
}

/** Firestore: `inhouseGames/{gameId}/waitlist/{discordId}`. */
export interface WaitlistEntry {
  discordId: string;
  steamId32: string | null;
  playerName: string | null;
  /** Monotonically increasing; lowest value is promoted first. */
  position: number;
  createdAt: string;
}

// ─── Player ──────────────────────────────────────────────────────────────────

/** Firestore: `inhousePlayers/{discordId}`. */
export interface InhousePlayer {
  discordId: string;

  /**
   * The player's name on *this Discord server*, not their global username.
   *
   * Members can set a per-server nickname and change it whenever they like, so
   * this is refreshed every time the gateway sees them. It is the name shown on
   * every surface — Discord embeds, the website, lobby chat — in preference to
   * the Steam persona, which is often something they picked in 2013.
   */
  discordName: string | null;

  /**
   * Every Steam account this person plays on. Plenty of people have two or
   * three and switch between them; they are all one person here.
   *
   * The first entry is the primary — used wherever a single account is needed,
   * such as the name on a profile. Order is otherwise not meaningful.
   *
   * Queried with `array-contains`, never equality. A lookup that only checks
   * one account will silently miss alts, which matters most for ban
   * enforcement: a ban follows the *person*, so it applies to every account in
   * this list.
   */
  steamIds: string[];

  /**
   * Primary Steam account, denormalized from `steamIds[0]` for the many call
   * sites that need exactly one. Null when nothing is linked.
   */
  steamId32: string | null;

  linkedAt: string | null;
  linkSource: LinkSource | null;

  /** Opt-in ping roles the player subscribes to (§6). */
  pingOptIn: string[];
  region: string | null;

  // ── Cumulative, non-rivalrous, monotonic counters only (§10) ──
  gamesPlayed: number;
  gamesPublished: number;
  nightsPlayed: number;
  distinctTeammates: number;
  heroesPlayed: number;

  /** ISO date strings (YYYY-MM-DD), used to derive nightsPlayed. */
  firstSeenAt: string | null;
  lastPlayedAt: string | null;

  /**
   * Soft no-show tracking (§9). Never surfaced publicly — hosts and admins only.
   * Auto-recovers: a reliable game decrements it.
   */
  noShowCount: number;
  lastNoShowAt: string | null;
}

// ─── Moderation ──────────────────────────────────────────────────────────────

/** Firestore: `inhouseModeration/{id}`. */
export interface ModerationRecord {
  id: string;
  kind: ModerationKind;
  /** At least one of these two is always present. */
  subjectDiscordId: string | null;
  subjectSteamId32: string | null;
  subjectName: string | null;
  reason: string;
  adminId: string;
  /** The game the incident happened in — this is what supplies identity (§2). */
  sourceGameId: string | null;
  createdAt: string;
  /** Null on a warn, or on a permanent ban. */
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  /**
   * Which identity was missing at ban time, so the admin panel can surface the
   * enforcement gap rather than hiding it (§2).
   */
  identityGap: 'none' | 'no_discord' | 'no_steam';
}

/** Result of a ban lookup across both identity spaces. */
export interface BanStatus {
  banned: boolean;
  record: ModerationRecord | null;
  /** Which identity matched, for logging. */
  matchedOn: 'discord' | 'steam' | null;
}

// ─── Attendance ──────────────────────────────────────────────────────────────

/**
 * Firestore: `inhouseAttendance/{gameId}__{steamId32}`.
 *
 * Derived from the **match**, never from signups — signing up isn't playing,
 * and the whole social layer rests on this ledger being true (§12).
 */
export interface AttendanceRecord {
  gameId: string;
  steamId32: string;
  discordId: string | null;
  dotaMatchId: number;
  heroId: number | null;
  side: 'radiant' | 'dire';
  won: boolean;
  /** ISO date (YYYY-MM-DD) of the match, used for nightsPlayed. */
  playedOn: string;
  createdAt: string;
}

/** Firestore: `inhouseLinkCodes/{code}`. */
export interface LinkCode {
  code: string;
  steamId32: string;
  playerName: string | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByDiscordId: string | null;
}

/** Firestore: `inhouseReadyPool/{discordId}` — the "who's around" panel (§9). */
export interface ReadyEntry {
  discordId: string;
  discordName: string;
  steamId32: string | null;
  createdAt: string;
  expiresAt: string;
  region: string | null;
}

// ─── Slot accounting ─────────────────────────────────────────────────────────

/** Output of the slot accounting calculation (§7.1). */
export interface SlotCounts {
  /** Steam32 IDs present in the lobby on a playing side, excluding the bot. */
  inLobby: string[];
  /** Active reservations whose Steam ID is NOT already in the lobby. */
  pendingReservations: Reservation[];
  /** `inLobby.length + pendingReservations.length` */
  committed: number;
  /** `10 - committed`, floored at 0. */
  slotsOpen: number;
  /** True when 10 players are physically present (reservations don't count). */
  ready: boolean;
  radiant: string[];
  dire: string[];
  unassigned: string[];
}
