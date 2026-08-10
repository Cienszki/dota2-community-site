// src/inhouse/store.ts
// Firestore data-access layer for the inhouse system.
//
// This is the ONLY module that knows collection names and document shapes.
// Both processes go through it:
//   - the lobby worker  (authoritative for who is physically in the lobby)
//   - the Discord bot   (authoritative for reservations, waitlist, publishing)
//
// Two invariants worth stating up front:
//
//  1. Reservation creation is race-safe. Three people clicking Join at 9/10 is a
//     daily occurrence, so `createReservation` re-reads and re-checks the slot
//     count inside a Firestore transaction. Overbooking produces exactly the
//     experience reservations exist to prevent.
//
//  2. Ban checks are an authorization boundary, not a UI state. `inhouseBans`
//     is a denormalized lookup index keyed by identity so every join path can
//     check with a single document get, on the hot path, without a query.

import type {
  Firestore,
  Transaction,
  DocumentReference,
  CollectionReference,
  Query,
} from 'firebase-admin/firestore';
import type {
  AttendanceRecord,
  BanStatus,
  GameState,
  InhouseGame,
  InhousePlayer,
  LinkCode,
  LinkSource,
  Membership,
  ModerationKind,
  ModerationRecord,
  ReadyEntry,
  Reservation,
  ResolvedSettings,
  SlotCounts,
  TeamSide,
  WaitlistEntry,
} from './types';
import { PLAYING_SIDES, isTerminal } from './types';
import { resolveSettings } from './settings';
import { logger } from './logger';

export const COLLECTIONS = {
  games: 'inhouseGames',
  players: 'inhousePlayers',
  moderation: 'inhouseModeration',
  bans: 'inhouseBans',
  attendance: 'inhouseAttendance',
  linkCodes: 'inhouseLinkCodes',
  readyPool: 'inhouseReadyPool',
  config: 'inhouseConfig',
  counters: 'inhouseCounters',
  // Sub-collections of a game document
  memberships: 'memberships',
  reservations: 'reservations',
  waitlist: 'waitlist',
} as const;

/** A full lobby is ten players. Nothing in the system is configurable here. */
export const LOBBY_CAPACITY = 10;

/**
 * How many published lobbies may recruit at once before a new one is refused.
 * Overridable from `inhouseConfig/lobby`; two is the considered default.
 */
export const DEFAULT_MAX_OPEN_LOBBIES = 2;

const now = (): string => new Date().toISOString();

/** Sentinel used to abort a link-code transaction on collision. */
class CodeTakenError extends Error {
  constructor() {
    super('link code already taken');
  }
}

/** Ban index keys. Two identity spaces, two keys, either one is sufficient. */
const discordBanKey = (discordId: string): string => `d_${discordId}`;
const steamBanKey = (steamId32: string): string => `s_${steamId32}`;

export class InhouseStore {
  constructor(private db: Firestore) {}

  // ─── Refs ──────────────────────────────────────────────────────────────────

  private gameRef(gameId: string): DocumentReference {
    return this.db.collection(COLLECTIONS.games).doc(gameId);
  }

  private membershipsRef(gameId: string): CollectionReference {
    return this.gameRef(gameId).collection(COLLECTIONS.memberships);
  }

  private reservationsRef(gameId: string): CollectionReference {
    return this.gameRef(gameId).collection(COLLECTIONS.reservations);
  }

  private waitlistRef(gameId: string): CollectionReference {
    return this.gameRef(gameId).collection(COLLECTIONS.waitlist);
  }

  /** Active memberships only — `present` is denormalized so no index is needed. */
  private presentQuery(gameId: string): Query {
    return this.membershipsRef(gameId).where('present', '==', true);
  }

  /** Live reservations — `active` covers both "not consumed" and "not released". */
  private activeReservationsQuery(gameId: string): Query {
    return this.reservationsRef(gameId).where('active', '==', true);
  }

  // ─── Admin defaults ────────────────────────────────────────────────────────

  /**
   * Global admin defaults, written by the website's admin panel.
   * Falls back to code defaults when the document doesn't exist yet, so the
   * system is usable before the admin panel ships.
   */
  async getAdminDefaults(): Promise<ResolvedSettings> {
    try {
      const snap = await this.db.collection(COLLECTIONS.config).doc('global').get();
      return resolveSettings(snap.exists ? (snap.data() as Record<string, unknown>) : undefined);
    } catch (error) {
      logger.warn(`Failed to read admin defaults, using code defaults: ${String(error)}`);
      return resolveSettings();
    }
  }

  /**
   * Lobby-level config from `inhouseConfig/lobby`, written by the admin panel.
   *
   * `password` is one shared value for every lobby rather than per-game, so a
   * regular can type the same password every night without reading it off a card
   * first. Null means unset, and the caller generates one.
   *
   * `maxOpenLobbies` caps simultaneously *recruiting published* lobbies.
   * Unpublished ones deliberately don't count: a host quietly filling a private
   * game is not competing for the same players, so it must never block anyone.
   * A third concurrent lobby splits the same people three ways and none of them
   * reach ten.
   *
   * Falls back to code defaults so the system works before the panel writes it.
   */
  async getLobbyConfig(): Promise<{ password: string | null; maxOpenLobbies: number }> {
    try {
      const snap = await this.db.collection(COLLECTIONS.config).doc('lobby').get();
      const data = (snap.exists ? snap.data() : {}) as Record<string, unknown>;

      const password = typeof data.password === 'string' && data.password.trim()
        ? data.password.trim()
        : null;
      const max = Number(data.maxOpenLobbies);

      return {
        password,
        maxOpenLobbies: Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_MAX_OPEN_LOBBIES,
      };
    } catch (error) {
      logger.warn(`Failed to read lobby config, using defaults: ${String(error)}`);
      return { password: null, maxOpenLobbies: DEFAULT_MAX_OPEN_LOBBIES };
    }
  }

  /**
   * Admin identities, cached briefly.
   *
   * Held in `inhouseConfig/admins` as two arrays so an admin can be recognised
   * from lobby chat (where only a Steam ID is available) as well as from
   * Discord. The admin panel maintains this document.
   */
  private adminCache: { discordIds: Set<string>; steamIds: Set<string>; at: number } | null = null;
  private static readonly ADMIN_CACHE_TTL_MS = 60_000;

  async isAdmin(ids: { discordId?: string | null; steamId32?: string | null }): Promise<boolean> {
    if (!this.adminCache || Date.now() - this.adminCache.at > InhouseStore.ADMIN_CACHE_TTL_MS) {
      try {
        const snap = await this.db.collection(COLLECTIONS.config).doc('admins').get();
        const data = snap.exists ? snap.data() ?? {} : {};
        this.adminCache = {
          discordIds: new Set((data.discordIds ?? []) as string[]),
          steamIds: new Set(((data.steamIds ?? []) as Array<string | number>).map(String)),
          at: Date.now(),
        };
      } catch (error) {
        logger.warn(`Admin list read failed: ${String(error)}`);
        // Fail closed: an unreadable admin list must not grant admin powers.
        this.adminCache = { discordIds: new Set(), steamIds: new Set(), at: Date.now() };
      }
    }

    if (ids.steamId32 && this.adminCache.steamIds.has(ids.steamId32)) return true;
    if (ids.discordId && this.adminCache.discordIds.has(ids.discordId)) return true;

    // Fall back to the linked identity, so an admin listed only by Discord ID
    // is still recognised when they type `!kick` in a lobby.
    if (ids.steamId32 && !ids.discordId) {
      const player = await this.findPlayerBySteamId(ids.steamId32);
      if (player && this.adminCache.discordIds.has(player.discordId)) return true;
    }
    return false;
  }

  /** Drop the admin cache, so a role change applies immediately. */
  invalidateAdminCache(): void {
    this.adminCache = null;
  }

  // ─── Worker command queue ──────────────────────────────────────────────────

  /**
   * Queue a command for the lobby worker holding a given Steam account.
   *
   * `createdAt` must be an ISO string: the worker parses it with `new Date()`
   * and expires anything older than five minutes. A Firestore Timestamp here
   * silently produces a command that is never executed.
   */
  async enqueueBotCommand(
    botAccountId: string,
    command: Record<string, unknown>
  ): Promise<void> {
    await this.db
      .collection('botCommands')
      .doc(botAccountId)
      .collection('queue')
      .add({
        botAccountId,
        command,
        status: 'pending',
        createdAt: now(),
      });
  }

  // ─── Games ─────────────────────────────────────────────────────────────────

  async getGame(gameId: string): Promise<InhouseGame | null> {
    const snap = await this.gameRef(gameId).get();
    return snap.exists ? (snap.data() as InhouseGame) : null;
  }

  /**
   * Allocate the next human-readable game number ("#412"). Uses a counter
   * document under a transaction so concurrent creates can't collide.
   */
  private async nextGameNumber(): Promise<number> {
    const ref = this.db.collection(COLLECTIONS.counters).doc('games');
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
      const next = current + 1;
      tx.set(ref, { value: next, updatedAt: now() }, { merge: true });
      return next;
    });
  }

  async createGame(input: {
    initiatorDiscordId: string;
    initiatorName: string;
    initiatorSteamId32?: string | null;
    settings: ResolvedSettings;
    scheduledFor?: string | null;
    newcomerFriendly?: boolean;
  }): Promise<InhouseGame> {
    const ref = this.db.collection(COLLECTIONS.games).doc();
    const gameNumber = await this.nextGameNumber();
    const ts = now();

    const game: InhouseGame = {
      id: ref.id,
      gameNumber,
      mode: input.settings.mode,
      state: 'draft',
      initiatorDiscordId: input.initiatorDiscordId,
      initiatorSteamId32: input.initiatorSteamId32 ?? null,
      initiatorName: input.initiatorName,
      published: false,
      publishedAt: null,
      publishedByDiscordId: null,
      locked: false,
      settings: input.settings,
      botAccountId: null,
      dotaLobbyId: null,
      lobbyName: null,
      lobbyPassword: null,
      dotaMatchId: null,
      newcomerFriendly: input.newcomerFriendly ?? false,
      scheduledFor: input.scheduledFor ?? null,
      discord: {
        hostPanelChannelId: null,
        hostPanelMessageId: null,
        cardChannelId: null,
        cardMessageId: null,
        voiceChannelId: null,
        scheduledEventId: null,
      },
      createdAt: ts,
      updatedAt: ts,
      endedAt: null,
      endReason: null,
      lastActivityAt: ts,
      nudgedAt: null,
    };

    await ref.set(game);
    logger.info(`Inhouse game created: ${ref.id} (#${gameNumber}) by ${input.initiatorName}`);
    return game;
  }

  async updateGame(gameId: string, patch: Record<string, unknown>): Promise<void> {
    await this.gameRef(gameId).update({ ...patch, updatedAt: now() });
  }

  /** Bump the idle clock. Called whenever a player joins or leaves. */
  async touchGame(gameId: string): Promise<void> {
    await this.gameRef(gameId).update({ lastActivityAt: now(), updatedAt: now() });
  }

  /**
   * Move a game to a new state, refusing transitions out of a terminal state.
   * Returns false when the transition was rejected.
   */
  async transitionState(
    gameId: string,
    next: GameState,
    extra: Record<string, unknown> = {}
  ): Promise<boolean> {
    return this.db.runTransaction(async (tx) => {
      const ref = this.gameRef(gameId);
      const snap = await tx.get(ref);
      if (!snap.exists) return false;

      const game = snap.data() as InhouseGame;
      if (isTerminal(game.state)) {
        logger.warn(`Refusing ${game.state} → ${next} for game ${gameId}: already terminal`);
        return false;
      }
      if (game.state === next) return true;

      const patch: Record<string, unknown> = { ...extra, state: next, updatedAt: now() };
      if (isTerminal(next)) patch.endedAt = now();

      tx.update(ref, patch);
      logger.info(`Game ${gameId}: ${game.state} → ${next}`);
      return true;
    });
  }

  /** Games still holding a Steam account lease, for recovery on worker restart. */
  async listActiveGames(): Promise<InhouseGame[]> {
    const snap = await this.db
      .collection(COLLECTIONS.games)
      .where('state', 'in', ['lobby_creating', 'open', 'ready', 'in_progress'])
      .get();
    return snap.docs.map((d) => d.data() as InhouseGame);
  }

  /**
   * Games currently recruiting that the public may see.
   *
   * Publishing is what decides who learns about a game *while it is filling* —
   * an unpublished lobby lets the host choose who to tell first. So this is the
   * only listing helper a public "games filling now" surface may use, and it
   * always carries the `published == true` filter.
   *
   * A finished game is a different matter: see `listRecentFinishedGames`.
   */
  async listPublishedOpenGames(): Promise<InhouseGame[]> {
    const snap = await this.db
      .collection(COLLECTIONS.games)
      .where('published', '==', true)
      .where('state', 'in', ['open', 'ready'])
      .get();
    return snap.docs.map((d) => d.data() as InhouseGame);
  }

  /**
   * Finished games, published or not.
   *
   * Deliberately unfiltered by `published`. Keeping a lobby quiet is about
   * controlling who gets told while there are still slots to fill; once the
   * match has been played that no longer applies, and showing it is how a
   * visitor can tell the community is alive and playing.
   *
   * Only `finished` qualifies — not `cancelled`, `expired` or `abandoned`.
   * A game that never played says nothing good and still leaks that it existed.
   */
  async listRecentFinishedGames(limit = 20): Promise<InhouseGame[]> {
    const snap = await this.db
      .collection(COLLECTIONS.games)
      .where('state', '==', 'finished')
      .orderBy('endedAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data() as InhouseGame);
  }

  /**
   * Whether a game may be shown on a public surface at all.
   *
   * The single predicate every public read path should use, so the rule lives
   * in one place: visible once published, or once actually played.
   */
  static isPubliclyVisible(game: Pick<InhouseGame, 'published' | 'state'>): boolean {
    return game.published || game.state === 'finished';
  }

  /** The game a given bot account is currently executing, if any. */
  async findGameByBotAccount(botAccountId: string): Promise<InhouseGame | null> {
    const snap = await this.db
      .collection(COLLECTIONS.games)
      .where('botAccountId', '==', botAccountId)
      .where('state', 'in', ['lobby_creating', 'open', 'ready', 'in_progress'])
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as InhouseGame);
  }

  /** Most recently finished game, for `!lastgame`. */
  async getMostRecentFinishedGame(): Promise<InhouseGame | null> {
    const snap = await this.db
      .collection(COLLECTIONS.games)
      .where('state', '==', 'finished')
      .orderBy('endedAt', 'desc')
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as InhouseGame);
  }

  /**
   * The community stat `!record` prints.
   *
   * Deliberately server-wide rather than per-player: community counters carry
   * no competitive charge and build real belonging, whereas any "top player"
   * framing is the thing §10 exists to prevent. The admin panel writes these.
   */
  async getCommunityRecord(): Promise<{ label: string; value: string; when: string | null } | null> {
    const snap = await this.db.collection(COLLECTIONS.config).doc('records').get();
    if (!snap.exists) return null;

    const records = (snap.data()?.entries ?? []) as Array<{
      label: string;
      value: string;
      when?: string | null;
    }>;
    if (!records.length) return null;

    const chosen = records[Math.floor(Math.random() * records.length)];
    return { label: chosen.label, value: chosen.value, when: chosen.when ?? null };
  }

  // ─── Memberships ───────────────────────────────────────────────────────────

  /**
   * Record a player as present in the lobby. Idempotent — the GC re-sends the
   * full member list on every update, so this is called constantly.
   */
  async upsertMembership(
    gameId: string,
    m: {
      steamId32: string;
      side: TeamSide;
      slot: number;
      playerName?: string | null;
      discordId?: string | null;
      displayName?: string | null;
    }
  ): Promise<void> {
    const ref = this.membershipsRef(gameId).doc(m.steamId32);
    const snap = await ref.get();

    if (!snap.exists) {
      const record: Membership & { present: boolean } = {
        steamId32: m.steamId32,
        discordId: m.discordId ?? null,
        playerName: m.playerName ?? null,
        displayName: m.displayName ?? null,
        side: m.side,
        slot: m.slot,
        joinedAt: now(),
        leftAt: null,
        present: true,
      };
      await ref.set(record);
      return;
    }

    const patch: Record<string, unknown> = { side: m.side, slot: m.slot, present: true, leftAt: null };
    if (m.playerName) patch.playerName = m.playerName;
    if (m.discordId) patch.discordId = m.discordId;
    if (m.displayName) patch.displayName = m.displayName;
    await ref.update(patch);
  }

  /**
   * Mark a player as gone. The row is kept, not deleted: it is the ban-identity
   * record (§2) and the retroactive-credit source (§3).
   */
  async markMembershipLeft(gameId: string, steamId32: string): Promise<void> {
    const ref = this.membershipsRef(gameId).doc(steamId32);
    const snap = await ref.get();
    if (!snap.exists) return;
    await ref.update({ present: false, leftAt: now() });
  }

  async listMemberships(gameId: string, presentOnly = true): Promise<Membership[]> {
    const snap = presentOnly
      ? await this.presentQuery(gameId).get()
      : await this.membershipsRef(gameId).get();
    return snap.docs.map((d) => d.data() as Membership);
  }

  // ─── Slot accounting (§7.1) ────────────────────────────────────────────────

  /**
   * The count that matters is everyone who is going to play: unassigned players
   * PLUS anyone already seated on Radiant or Dire, since people sit with their
   * friends and a lobby can legitimately start from any mix.
   *
   *   in_lobby  = { unassigned ∪ radiant ∪ dire }, excluding the bot
   *   committed = |in_lobby| + |{ active reservations whose steam_id ∉ in_lobby }|
   *   slots_open = 10 - committed
   *
   * The `∉ in_lobby` clause is the whole double-count fix: a reservation stops
   * counting the instant its owner actually walks in.
   */
  static computeSlots(memberships: Membership[], reservations: Reservation[]): SlotCounts {
    const nowMs = Date.now();

    const playing = memberships.filter((m) => PLAYING_SIDES.includes(m.side));
    const inLobby = playing.map((m) => m.steamId32);
    const inLobbySet = new Set(inLobby);
    // People already present, by Discord identity. Someone can reserve on one
    // Steam account and walk in on another — without this their reservation
    // keeps counting and the lobby looks full one player early.
    const presentDiscordIds = new Set(
      playing.map((m) => m.discordId).filter((id): id is string => Boolean(id))
    );

    const pendingReservations = reservations.filter(
      (r) =>
        r.consumedAt === null &&
        r.releasedAt === null &&
        Date.parse(r.expiresAt) > nowMs &&
        !inLobbySet.has(r.steamId32) &&
        !presentDiscordIds.has(r.discordId)
    );

    const committed = inLobby.length + pendingReservations.length;

    return {
      inLobby,
      pendingReservations,
      committed,
      slotsOpen: Math.max(0, LOBBY_CAPACITY - committed),
      ready: inLobby.length >= LOBBY_CAPACITY,
      radiant: playing.filter((m) => m.side === 'radiant').map((m) => m.steamId32),
      dire: playing.filter((m) => m.side === 'dire').map((m) => m.steamId32),
      unassigned: playing.filter((m) => m.side === 'unassigned').map((m) => m.steamId32),
    };
  }

  /** Read both sub-collections and compute the current slot picture. */
  async getSlots(gameId: string): Promise<SlotCounts> {
    const [members, reservations] = await Promise.all([
      this.listMemberships(gameId, true),
      this.listActiveReservations(gameId),
    ]);
    return InhouseStore.computeSlots(members, reservations);
  }

  /** Transaction-internal variant — all reads must happen before any write. */
  private async getSlotsInTransaction(tx: Transaction, gameId: string): Promise<SlotCounts> {
    const [memberSnap, resSnap] = await Promise.all([
      tx.get(this.presentQuery(gameId)),
      tx.get(this.activeReservationsQuery(gameId)),
    ]);
    return InhouseStore.computeSlots(
      memberSnap.docs.map((d) => d.data() as Membership),
      resSnap.docs.map((d) => d.data() as Reservation)
    );
  }

  // ─── Reservations (§7.1) ───────────────────────────────────────────────────

  async listActiveReservations(gameId: string): Promise<Reservation[]> {
    const snap = await this.activeReservationsQuery(gameId).get();
    return snap.docs.map((d) => d.data() as Reservation);
  }

  /** Every reservation ever made for a game, including consumed and released. */
  async listAllReservations(gameId: string): Promise<Reservation[]> {
    const snap = await this.reservationsRef(gameId).get();
    return snap.docs.map((d) => d.data() as Reservation);
  }

  /**
   * Hold a slot for a linked player who pressed Join.
   *
   * Race safety is not optional here. The whole operation runs inside a
   * transaction that re-reads the game document and both sub-collections, then
   * re-checks `committed < 10` before writing. Firestore aborts and retries the
   * transaction if any read document changed underneath it, which gives the same
   * guarantee as `SELECT … FOR UPDATE`.
   *
   * Only for linked players: an unlinked player can't be recognised when they
   * walk in, so their reservation could never be consumed and would just burn a
   * slot for the full TTL.
   */
  async createReservation(
    gameId: string,
    input: { discordId: string; steamId32: string; playerName?: string | null; ttlSeconds: number }
  ): Promise<
    | { ok: true; reservation: Reservation; slotsOpen: number }
    | { ok: false; reason: 'game_not_open' | 'locked' | 'full' | 'already_reserved' | 'already_in_lobby' }
  > {
    return this.db.runTransaction(async (tx) => {
      const gameRef = this.gameRef(gameId);
      const reservationRef = this.reservationsRef(gameId).doc(input.discordId);

      // ── All reads first ──
      const [gameSnap, existingSnap] = await Promise.all([tx.get(gameRef), tx.get(reservationRef)]);
      if (!gameSnap.exists) return { ok: false as const, reason: 'game_not_open' as const };

      const game = gameSnap.data() as InhouseGame;
      if (game.state !== 'open') return { ok: false as const, reason: 'game_not_open' as const };
      if (game.locked) return { ok: false as const, reason: 'locked' as const };

      const slots = await this.getSlotsInTransaction(tx, gameId);

      if (slots.inLobby.includes(input.steamId32)) {
        return { ok: false as const, reason: 'already_in_lobby' as const };
      }
      if (existingSnap.exists) {
        const existing = existingSnap.data() as Reservation;
        const stillLive =
          existing.consumedAt === null &&
          existing.releasedAt === null &&
          Date.parse(existing.expiresAt) > Date.now();
        if (stillLive) return { ok: false as const, reason: 'already_reserved' as const };
      }
      if (slots.committed >= LOBBY_CAPACITY) {
        return { ok: false as const, reason: 'full' as const };
      }

      // ── Writes ──
      const createdAt = now();
      const reservation: Reservation & { active: boolean } = {
        discordId: input.discordId,
        steamId32: input.steamId32,
        playerName: input.playerName ?? null,
        createdAt,
        expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
        consumedAt: null,
        releasedAt: null,
        releaseReason: null,
        active: true,
      };
      tx.set(reservationRef, reservation);
      tx.update(gameRef, { lastActivityAt: createdAt, updatedAt: createdAt });

      return {
        ok: true as const,
        reservation,
        // -1 because the reservation we just wrote isn't in the snapshot we read.
        slotsOpen: Math.max(0, LOBBY_CAPACITY - slots.committed - 1),
      };
    });
  }

  /**
   * Consume the reservation belonging to a Steam ID that just walked into the
   * lobby. Called from the worker's member-joined path.
   */
  /**
   * Consume the reservation belonging to a player who just walked in.
   *
   * Matches on the arriving Steam ID first, then falls back to the person: a
   * reservation made from Discord is keyed on the Discord ID, and someone with
   * several accounts may well reserve on their main and turn up on a smurf.
   * Missing that would leave the slot held until it expired while its owner was
   * already standing in the lobby.
   */
  async consumeReservationBySteamId(gameId: string, steamId32: string): Promise<Reservation | null> {
    const direct = await this.activeReservationsQuery(gameId)
      .where('steamId32', '==', steamId32)
      .limit(1)
      .get();

    let doc = direct.empty ? null : direct.docs[0];

    if (!doc) {
      const player = await this.findPlayerBySteamId(steamId32);
      if (!player) return null;

      // Reservations are keyed by Discord ID, so this is a direct get.
      const byPerson = await this.reservationsRef(gameId).doc(player.discordId).get();
      const record = byPerson.exists ? (byPerson.data() as Reservation & { active?: boolean }) : null;
      if (!record?.active) return null;
      doc = byPerson as unknown as (typeof direct.docs)[number];
    }

    const ts = now();
    await doc.ref.update({ consumedAt: ts, active: false });
    logger.info(`Reservation consumed: game=${gameId} steam=${steamId32}`);
    return { ...(doc.data() as Reservation), consumedAt: ts };
  }

  async releaseReservation(
    gameId: string,
    discordId: string,
    reason: NonNullable<Reservation['releaseReason']>
  ): Promise<Reservation | null> {
    const ref = this.reservationsRef(gameId).doc(discordId);
    const snap = await ref.get();
    if (!snap.exists) return null;

    const reservation = snap.data() as Reservation & { active?: boolean };
    if (reservation.consumedAt || reservation.releasedAt) return null;

    const ts = now();
    await ref.update({ releasedAt: ts, releaseReason: reason, active: false });
    return { ...reservation, releasedAt: ts, releaseReason: reason };
  }

  /**
   * Release every reservation whose TTL has lapsed.
   * Returns them so the caller can DM the players and promote the waitlist.
   */
  async expireLapsedReservations(gameId: string): Promise<Reservation[]> {
    const active = await this.listActiveReservations(gameId);
    const nowMs = Date.now();
    const lapsed = active.filter(
      (r) => r.consumedAt === null && r.releasedAt === null && Date.parse(r.expiresAt) <= nowMs
    );

    for (const r of lapsed) {
      await this.reservationsRef(gameId)
        .doc(r.discordId)
        .update({ releasedAt: now(), releaseReason: 'expired', active: false });
    }
    if (lapsed.length) {
      logger.info(`Expired ${lapsed.length} reservation(s) for game ${gameId}`);
    }
    return lapsed;
  }

  // ─── Waitlist ──────────────────────────────────────────────────────────────

  async addToWaitlist(
    gameId: string,
    entry: { discordId: string; steamId32?: string | null; playerName?: string | null }
  ): Promise<WaitlistEntry> {
    const ref = this.waitlistRef(gameId).doc(entry.discordId);
    const existing = await ref.get();
    if (existing.exists) return existing.data() as WaitlistEntry;

    // Position is a timestamp so ordering survives concurrent inserts without a
    // counter; ties are impossible in practice and harmless if they happen.
    const record: WaitlistEntry = {
      discordId: entry.discordId,
      steamId32: entry.steamId32 ?? null,
      playerName: entry.playerName ?? null,
      position: Date.now(),
      createdAt: now(),
    };
    await ref.set(record);
    return record;
  }

  async removeFromWaitlist(gameId: string, discordId: string): Promise<void> {
    await this.waitlistRef(gameId).doc(discordId).delete();
  }

  async listWaitlist(gameId: string): Promise<WaitlistEntry[]> {
    const snap = await this.waitlistRef(gameId).orderBy('position', 'asc').get();
    return snap.docs.map((d) => d.data() as WaitlistEntry);
  }

  /** Pop the head of the waitlist. The caller turns it into a reservation. */
  async popWaitlistHead(gameId: string): Promise<WaitlistEntry | null> {
    const snap = await this.waitlistRef(gameId).orderBy('position', 'asc').limit(1).get();
    if (snap.empty) return null;
    const entry = snap.docs[0].data() as WaitlistEntry;
    await snap.docs[0].ref.delete();
    return entry;
  }

  // ─── Players ───────────────────────────────────────────────────────────────

  async getPlayer(discordId: string): Promise<InhousePlayer | null> {
    const snap = await this.db.collection(COLLECTIONS.players).doc(discordId).get();
    return snap.exists ? (snap.data() as InhousePlayer) : null;
  }

  /**
   * Find the person who plays on a given Steam account.
   *
   * `array-contains`, not equality: people have alts, and a lookup that only
   * matched the primary account would treat the same person as a stranger the
   * moment they logged into their other one — and, worse, would let a banned
   * player walk straight back in on a second account.
   */
  async findPlayerBySteamId(steamId32: string): Promise<InhousePlayer | null> {
    const snap = await this.db
      .collection(COLLECTIONS.players)
      .where('steamIds', 'array-contains', steamId32)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as InhousePlayer);
  }

  /**
   * Attach a Steam account to a Discord profile.
   *
   * Additive: a second or third account joins the list rather than replacing
   * the first. The primary stays whatever was linked first, because that is
   * the one whose name people already recognise.
   */
  async linkSteamAccount(
    discordId: string,
    steamId32: string,
    linkSource: LinkSource,
    discordName?: string | null
  ): Promise<{ ok: boolean; reason?: 'claimed_by_other'; alreadyLinked: boolean; total: number }> {
    const owner = await this.findPlayerBySteamId(steamId32);
    if (owner && owner.discordId !== discordId) {
      return { ok: false, reason: 'claimed_by_other', alreadyLinked: false, total: 0 };
    }

    const player = await this.getPlayer(discordId);
    const steamIds = player?.steamIds ?? [];

    if (steamIds.includes(steamId32)) {
      return { ok: true, alreadyLinked: true, total: steamIds.length };
    }

    const next = [...steamIds, steamId32];
    await this.upsertPlayer(discordId, {
      steamIds: next,
      steamId32: next[0],
      linkedAt: player?.linkedAt ?? now(),
      linkSource: player?.linkSource ?? linkSource,
      ...(discordName ? { discordName } : {}),
    });

    logger.info(`Linked steam ${steamId32} to ${discordId} (${next.length} account(s) total)`);
    return { ok: true, alreadyLinked: false, total: next.length };
  }

  /**
   * Refresh the cached server nickname.
   *
   * Members rename themselves freely, and this is the name every surface
   * shows, so it is worth writing whenever the gateway sees them. Skips the
   * write when nothing changed — this runs on ordinary interactions.
   */
  async touchDiscordName(discordId: string, discordName: string): Promise<void> {
    const player = await this.getPlayer(discordId);
    if (!player || player.discordName === discordName) return;
    await this.db.collection(COLLECTIONS.players).doc(discordId).update({ discordName });
  }

  async upsertPlayer(discordId: string, patch: Partial<InhousePlayer>): Promise<InhousePlayer> {
    const ref = this.db.collection(COLLECTIONS.players).doc(discordId);
    const snap = await ref.get();

    if (!snap.exists) {
      const player: InhousePlayer = {
        discordId,
        discordName: null,
        steamIds: [],
        steamId32: null,
        linkedAt: null,
        linkSource: null,
        pingOptIn: [],
        region: null,
        gamesPlayed: 0,
        gamesPublished: 0,
        nightsPlayed: 0,
        distinctTeammates: 0,
        heroesPlayed: 0,
        firstSeenAt: now(),
        lastPlayedAt: null,
        noShowCount: 0,
        lastNoShowAt: null,
        ...patch,
      };
      await ref.set(player);
      return player;
    }

    await ref.update({ ...patch });
    return { ...(snap.data() as InhousePlayer), ...patch };
  }

  /**
   * Detach one Steam account from a Discord profile.
   *
   * How a mistaken link gets corrected, and deliberately self-service: the
   * person holding the account types `!unlink` in a lobby and the bot already
   * knows which Steam ID that is. Nobody can unlink anyone else.
   *
   * With several accounts linked, only the named one is removed and the rest
   * stay — someone fixing a typo on their smurf shouldn't lose their main.
   * `steamId32` is omitted only by callers who genuinely mean "all of them".
   *
   * The derived counters are recomputed from the ledger afterwards rather than
   * zeroed. That matters once alts exist: removing one account should leave the
   * games played on the others intact. This looks like it violates "counters
   * never decay" (§10), but it isn't decay — those numbers were attributed from
   * an account that is no longer this person's.
   *
   * `gamesPublished` is kept: publishing is something the Discord account did.
   */
  async unlinkSteamAccount(
    discordId: string,
    steamId32?: string
  ): Promise<{ ok: boolean; removed: string[]; remaining: string[]; gamesDetached: number }> {
    const player = await this.getPlayer(discordId);
    const linked = player?.steamIds ?? [];
    if (!linked.length) return { ok: false, removed: [], remaining: [], gamesDetached: 0 };

    const removed = steamId32 ? linked.filter((id) => id === steamId32) : [...linked];
    if (!removed.length) return { ok: false, removed: [], remaining: linked, gamesDetached: 0 };

    const remaining = linked.filter((id) => !removed.includes(id));

    let gamesDetached = 0;
    for (const id of removed) {
      gamesDetached += await this.detachDiscordIdFromAttendance(id, discordId);
    }

    // Teammates are rebuilt from the remaining accounts' history, so the old
    // set has to go first or it would keep people they only met on the
    // detached account.
    await this.clearTeammates(discordId);

    const totals = await this.aggregateStats(remaining);
    await this.db.collection(COLLECTIONS.players).doc(discordId).update({
      steamIds: remaining,
      steamId32: remaining[0] ?? null,
      linkedAt: remaining.length ? (player?.linkedAt ?? null) : null,
      linkSource: remaining.length ? (player?.linkSource ?? null) : null,
      gamesPlayed: totals.gamesPlayed,
      nightsPlayed: totals.nightsPlayed,
      heroesPlayed: totals.heroesPlayed,
      distinctTeammates: 0,
      lastPlayedAt: totals.lastPlayedOn,
    });

    logger.info(
      `Unlinked ${removed.join(', ')} from ${discordId} ` +
        `(${remaining.length} account(s) remaining, ${gamesDetached} rows detached)`
    );
    return { ok: true, removed, remaining, gamesDetached };
  }

  /** Remove a Discord ID from a Steam ID's attendance rows. Returns the count. */
  private async detachDiscordIdFromAttendance(
    steamId32: string,
    discordId: string
  ): Promise<number> {
    const snap = await this.db
      .collection(COLLECTIONS.attendance)
      .where('steamId32', '==', steamId32)
      .get();

    const rows = snap.docs.filter((d) => (d.data() as AttendanceRecord).discordId === discordId);
    for (let i = 0; i < rows.length; i += 450) {
      const batch = this.db.batch();
      for (const doc of rows.slice(i, i + 450)) batch.update(doc.ref, { discordId: null });
      await batch.commit();
    }
    return rows.length;
  }

  /** Drop the teammates sub-collection backing `distinctTeammates`. */
  private async clearTeammates(discordId: string): Promise<void> {
    const collection = this.db
      .collection(COLLECTIONS.players)
      .doc(discordId)
      .collection('teammates');

    // Paged rather than fetched whole: a regular accumulates hundreds of these.
    for (;;) {
      const snap = await collection.limit(450).get();
      if (snap.empty) return;

      const batch = this.db.batch();
      for (const doc of snap.docs) batch.delete(doc.ref);
      await batch.commit();
    }
  }

  // ─── Moderation (§2) ───────────────────────────────────────────────────────

  /**
   * Check whether either identity is banned. A single document get per identity
   * space — cheap enough to sit on every join path without caching.
   *
   * Callers must pass whatever they have. A join from the Discord button knows
   * only the Discord ID; the GC member-joined event knows only the Steam ID.
   */
  async checkBan(ids: { discordId?: string | null; steamId32?: string | null }): Promise<BanStatus> {
    const keys: Array<{ key: string; on: 'discord' | 'steam' }> = [];
    if (ids.discordId) keys.push({ key: discordBanKey(ids.discordId), on: 'discord' });
    if (ids.steamId32) keys.push({ key: steamBanKey(ids.steamId32), on: 'steam' });
    if (!keys.length) return { banned: false, record: null, matchedOn: null };

    const snaps = await this.db.getAll(
      ...keys.map(({ key }) => this.db.collection(COLLECTIONS.bans).doc(key))
    );

    for (let i = 0; i < snaps.length; i++) {
      const snap = snaps[i];
      if (!snap.exists) continue;

      const entry = snap.data() as { moderationId: string; expiresAt: string | null };
      // A lapsed ban is not a ban. Clean the index up opportunistically.
      if (entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()) {
        void snap.ref.delete().catch(() => undefined);
        continue;
      }

      const modSnap = await this.db.collection(COLLECTIONS.moderation).doc(entry.moderationId).get();
      const record = modSnap.exists ? (modSnap.data() as ModerationRecord) : null;
      if (record?.revokedAt) {
        void snap.ref.delete().catch(() => undefined);
        continue;
      }
      return { banned: true, record, matchedOn: keys[i].on };
    }

    return { banned: false, record: null, matchedOn: null };
  }

  /**
   * Record a warning or ban and, for bans, write the enforcement index entries.
   *
   * Surfaces the identity gap rather than hiding it: banning by Steam ID alone
   * means the Discord role can't be pulled, and banning by Discord ID alone
   * means they could still join a lobby manually with the password.
   */
  async createModerationRecord(input: {
    kind: ModerationKind;
    subjectDiscordId?: string | null;
    subjectSteamId32?: string | null;
    subjectName?: string | null;
    reason: string;
    adminId: string;
    sourceGameId?: string | null;
    /** Duration in days. 0 or omitted on a ban means permanent. */
    durationDays?: number;
  }): Promise<ModerationRecord> {
    const discordId = input.subjectDiscordId ?? null;
    const steamId32 = input.subjectSteamId32 ?? null;
    if (!discordId && !steamId32) {
      throw new Error('createModerationRecord requires at least one identity');
    }

    const ref = this.db.collection(COLLECTIONS.moderation).doc();
    const expiresAt =
      input.kind === 'ban' && input.durationDays && input.durationDays > 0
        ? new Date(Date.now() + input.durationDays * 86400_000).toISOString()
        : null;

    const record: ModerationRecord = {
      id: ref.id,
      kind: input.kind,
      subjectDiscordId: discordId,
      subjectSteamId32: steamId32,
      subjectName: input.subjectName ?? null,
      reason: input.reason,
      adminId: input.adminId,
      sourceGameId: input.sourceGameId ?? null,
      createdAt: now(),
      expiresAt,
      revokedAt: null,
      revokedBy: null,
      identityGap: discordId && steamId32 ? 'none' : discordId ? 'no_steam' : 'no_discord',
    };

    await ref.set(record);

    if (input.kind === 'ban') {
      // A ban follows the PERSON, not the account they happened to be on.
      // Indexing only the offending Steam ID would let anyone evade it by
      // logging into their alt, which is the single easiest way to make the
      // whole moderation system pointless.
      const steamIds = new Set<string>(steamId32 ? [steamId32] : []);

      const owner = discordId
        ? await this.getPlayer(discordId)
        : steamId32
          ? await this.findPlayerBySteamId(steamId32)
          : null;
      for (const id of owner?.steamIds ?? []) steamIds.add(id);

      const batch = this.db.batch();
      const indexEntry = { moderationId: ref.id, expiresAt, createdAt: record.createdAt };
      const banDiscordId = discordId ?? owner?.discordId ?? null;

      if (banDiscordId) {
        batch.set(this.db.collection(COLLECTIONS.bans).doc(discordBanKey(banDiscordId)), indexEntry);
      }
      for (const id of steamIds) {
        batch.set(this.db.collection(COLLECTIONS.bans).doc(steamBanKey(id)), indexEntry);
      }
      await batch.commit();

      logger.warn(
        `Ban recorded: discord=${banDiscordId ?? '—'} steam=[${[...steamIds].join(', ') || '—'}] ` +
          `gap=${record.identityGap} expires=${expiresAt ?? 'never'}`
      );
    }

    return record;
  }

  async revokeModerationRecord(moderationId: string, adminId: string): Promise<void> {
    const ref = this.db.collection(COLLECTIONS.moderation).doc(moderationId);
    const snap = await ref.get();
    if (!snap.exists) return;

    const record = snap.data() as ModerationRecord;
    await ref.update({ revokedAt: now(), revokedBy: adminId });

    // Clear every key the ban wrote, including alts — otherwise an unban
    // restores one account and silently leaves the others locked out.
    const owner = record.subjectDiscordId
      ? await this.getPlayer(record.subjectDiscordId)
      : record.subjectSteamId32
        ? await this.findPlayerBySteamId(record.subjectSteamId32)
        : null;

    const steamIds = new Set<string>(record.subjectSteamId32 ? [record.subjectSteamId32] : []);
    for (const id of owner?.steamIds ?? []) steamIds.add(id);

    const batch = this.db.batch();
    const banDiscordId = record.subjectDiscordId ?? owner?.discordId ?? null;
    if (banDiscordId) {
      batch.delete(this.db.collection(COLLECTIONS.bans).doc(discordBanKey(banDiscordId)));
    }
    for (const id of steamIds) {
      batch.delete(this.db.collection(COLLECTIONS.bans).doc(steamBanKey(id)));
    }
    await batch.commit();
  }

  /** Prior bans against either identity, used to pick the next ladder rung. */
  async countPriorBans(ids: { discordId?: string | null; steamId32?: string | null }): Promise<number> {
    const queries: Promise<number>[] = [];
    if (ids.discordId) {
      queries.push(
        this.db
          .collection(COLLECTIONS.moderation)
          .where('kind', '==', 'ban')
          .where('subjectDiscordId', '==', ids.discordId)
          .get()
          .then((s) => s.size)
      );
    }
    if (ids.steamId32) {
      queries.push(
        this.db
          .collection(COLLECTIONS.moderation)
          .where('kind', '==', 'ban')
          .where('subjectSteamId32', '==', ids.steamId32)
          .get()
          .then((s) => s.size)
      );
    }
    if (!queries.length) return 0;
    // Max rather than sum: a record carrying both identities would double-count.
    return Math.max(...(await Promise.all(queries)));
  }

  // ─── Attendance (§10, §12) ─────────────────────────────────────────────────

  /**
   * Write the attendance ledger for a finished match.
   * Idempotent on (gameId, steamId32) so a retried ingestion can't double-count.
   */
  async writeAttendance(records: AttendanceRecord[]): Promise<void> {
    if (!records.length) return;
    const batch = this.db.batch();
    for (const r of records) {
      const ref = this.db.collection(COLLECTIONS.attendance).doc(`${r.gameId}__${r.steamId32}`);
      batch.set(ref, r);
    }
    await batch.commit();
    logger.info(`Attendance written: ${records.length} row(s) for game ${records[0].gameId}`);
  }

  async listAttendanceForSteamId(steamId32: string): Promise<AttendanceRecord[]> {
    const snap = await this.db
      .collection(COLLECTIONS.attendance)
      .where('steamId32', '==', steamId32)
      .get();
    return snap.docs.map((d) => d.data() as AttendanceRecord);
  }

  /**
   * Record who a player has now played alongside, and keep `distinctTeammates`
   * in step.
   *
   * Stored as a sub-collection rather than an array so the write is idempotent
   * and doesn't grow a single document without bound. The count is denormalized
   * onto the profile because that is what gets rendered.
   *
   * Note this is a *count*, never a list on any public surface: "recent
   * teammates" would be a reconstruction of who plays with whom, assembled one
   * row at a time, which §10 rules out.
   */
  async recordTeammates(discordId: string, teammateSteamIds: string[]): Promise<void> {
    if (!teammateSteamIds.length) return;

    const collection = this.db
      .collection(COLLECTIONS.players)
      .doc(discordId)
      .collection('teammates');

    const refs = teammateSteamIds.map((id) => collection.doc(id));
    const existing = await this.db.getAll(...refs);
    const fresh = teammateSteamIds.filter((_, i) => !existing[i].exists);
    if (!fresh.length) return;

    const batch = this.db.batch();
    for (const steamId32 of fresh) {
      batch.set(collection.doc(steamId32), { steamId32, firstPlayedAt: now() });
    }
    await batch.commit();

    const total = (await collection.count().get()).data().count;
    await this.db.collection(COLLECTIONS.players).doc(discordId).update({ distinctTeammates: total });
  }

  /**
   * Stamp a newly-linked Discord ID onto that Steam ID's historical attendance
   * rows, so retroactive credit (§3) resolves on future reads.
   */
  async attachDiscordIdToAttendance(steamId32: string, discordId: string): Promise<void> {
    const snap = await this.db
      .collection(COLLECTIONS.attendance)
      .where('steamId32', '==', steamId32)
      .get();
    if (snap.empty) return;

    // Firestore caps a batch at 500 writes.
    const docs = snap.docs.filter((d) => (d.data() as AttendanceRecord).discordId !== discordId);
    for (let i = 0; i < docs.length; i += 450) {
      const batch = this.db.batch();
      for (const doc of docs.slice(i, i + 450)) batch.update(doc.ref, { discordId });
      await batch.commit();
    }
    logger.info(`Attached ${discordId} to ${docs.length} historical attendance rows`);
  }

  /**
   * Attendance figures across one or more Steam accounts.
   *
   * Nights and heroes are deduplicated across accounts: playing two games on
   * two different accounts on the same evening is one night, not two.
   */
  async aggregateStats(steamIds: string[]): Promise<{
    gamesPlayed: number;
    nightsPlayed: number;
    heroesPlayed: number;
    firstPlayedOn: string | null;
    lastPlayedOn: string | null;
  }> {
    if (!steamIds.length) {
      return { gamesPlayed: 0, nightsPlayed: 0, heroesPlayed: 0, firstPlayedOn: null, lastPlayedOn: null };
    }

    const histories = await Promise.all(steamIds.map((id) => this.listAttendanceForSteamId(id)));
    const all = histories.flat();

    const nights = new Set(all.map((r) => r.playedOn));
    const heroes = new Set(all.filter((r) => r.heroId !== null).map((r) => r.heroId));
    const days = [...nights].sort();

    return {
      gamesPlayed: all.length,
      nightsPlayed: nights.size,
      heroesPlayed: heroes.size,
      firstPlayedOn: days[0] ?? null,
      lastPlayedOn: days[days.length - 1] ?? null,
    };
  }

  /**
   * Everything a profile needs for whoever plays on a given Steam account.
   *
   * Resolves the person first, then aggregates across *all* their accounts —
   * so someone who walks in on their smurf still sees their real totals, and
   * the website never shows two half-profiles for one person.
   *
   * Works for players who have never linked, which is the majority: most
   * people hear about a game, find the lobby in Dota's browser and play,
   * without ever pressing anything on Discord. Their `inhousePlayers` document
   * does not exist and their counters are never incremented — but the ledger
   * has every game, because attendance is derived from the match roster rather
   * than from signups.
   *
   * Anything ranking or listing players must use this rather than reading
   * `inhousePlayers` directly, or it silently covers only the linked minority
   * and splits people with alts in two.
   */
  async getStatsForSteamId(steamId32: string): Promise<{
    steamIds: string[];
    gamesPlayed: number;
    nightsPlayed: number;
    heroesPlayed: number;
    firstPlayedOn: string | null;
    lastPlayedOn: string | null;
    linked: boolean;
    discordId: string | null;
    displayName: string | null;
  }> {
    const player = await this.findPlayerBySteamId(steamId32);
    const steamIds = player?.steamIds?.length ? player.steamIds : [steamId32];
    const totals = await this.aggregateStats(steamIds);

    return {
      steamIds,
      ...totals,
      linked: player !== null,
      discordId: player?.discordId ?? null,
      displayName: player?.discordName ?? null,
    };
  }

  async hasAttendance(gameId: string): Promise<boolean> {
    const snap = await this.db
      .collection(COLLECTIONS.attendance)
      .where('gameId', '==', gameId)
      .limit(1)
      .get();
    return !snap.empty;
  }

  // ─── Link codes (§3) ───────────────────────────────────────────────────────

  async createLinkCode(input: {
    code: string;
    steamId32: string;
    playerName?: string | null;
    ttlSeconds: number;
  }): Promise<LinkCode> {
    const record: LinkCode = {
      code: input.code,
      steamId32: input.steamId32,
      playerName: input.playerName ?? null,
      createdAt: now(),
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
      consumedAt: null,
      consumedByDiscordId: null,
    };
    await this.db.collection(COLLECTIONS.linkCodes).doc(input.code).set(record);
    return record;
  }

  /**
   * Create a link code only if that code is not already taken.
   * Returns false on collision so the caller can retry with a fresh code.
   */
  async createLinkCodeIfAbsent(input: {
    code: string;
    steamId32: string;
    playerName?: string | null;
    ttlSeconds: number;
  }): Promise<boolean> {
    const ref = this.db.collection(COLLECTIONS.linkCodes).doc(input.code);
    try {
      await this.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          const existing = snap.data() as LinkCode;
          const live = !existing.consumedAt && Date.parse(existing.expiresAt) > Date.now();
          if (live) throw new CodeTakenError();
        }
        tx.set(ref, {
          code: input.code,
          steamId32: input.steamId32,
          playerName: input.playerName ?? null,
          createdAt: now(),
          expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
          consumedAt: null,
          consumedByDiscordId: null,
        } satisfies LinkCode);
      });
      return true;
    } catch (error) {
      if (error instanceof CodeTakenError) return false;
      throw error;
    }
  }

  /**
   * Redeem a link code. Runs in a transaction so a code can only ever be used
   * once, even if two people race it.
   */
  async consumeLinkCode(
    code: string,
    discordId: string
  ): Promise<{ ok: true; steamId32: string } | { ok: false; reason: 'not_found' | 'expired' | 'used' }> {
    const ref = this.db.collection(COLLECTIONS.linkCodes).doc(code.trim().toUpperCase());
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false as const, reason: 'not_found' as const };

      const record = snap.data() as LinkCode;
      if (record.consumedAt) return { ok: false as const, reason: 'used' as const };
      if (Date.parse(record.expiresAt) <= Date.now()) return { ok: false as const, reason: 'expired' as const };

      tx.update(ref, { consumedAt: now(), consumedByDiscordId: discordId });
      return { ok: true as const, steamId32: record.steamId32 };
    });
  }

  // ─── Ready pool (§9) ───────────────────────────────────────────────────────

  async setReady(entry: Omit<ReadyEntry, 'createdAt'>): Promise<void> {
    await this.db
      .collection(COLLECTIONS.readyPool)
      .doc(entry.discordId)
      .set({ ...entry, createdAt: now() });
  }

  async clearReady(discordId: string): Promise<void> {
    await this.db.collection(COLLECTIONS.readyPool).doc(discordId).delete();
  }

  /** Live ready entries. Expired rows are dropped lazily on read. */
  async listReady(): Promise<ReadyEntry[]> {
    const snap = await this.db.collection(COLLECTIONS.readyPool).get();
    const nowMs = Date.now();
    const live: ReadyEntry[] = [];

    for (const doc of snap.docs) {
      const entry = doc.data() as ReadyEntry;
      if (Date.parse(entry.expiresAt) <= nowMs) {
        void doc.ref.delete().catch(() => undefined);
        continue;
      }
      live.push(entry);
    }
    return live;
  }
}
