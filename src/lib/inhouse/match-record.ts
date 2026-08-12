import 'server-only';
import { getDb } from '@/lib/firebase-admin';

// The resolved facts of a played match, in `inhouseMatches/{dotaMatchId}`.
//
// Why a separate collection rather than more fields on the game document: the
// live board holds a Firestore `onSnapshot` over `inhouseGames` and re-projects
// every matching document on every change. A ten-player roster — and the
// per-player stat block that will eventually hang off it — would be re-read and
// re-serialised on every slot change of every open lobby, to render a board
// that never displays any of it.
//
// Division of labour with the game document:
//
//   inhouseGames/{id}   the match *object* — exists from the moment someone
//                       presses Create, carries settings, lobby name, slots,
//                       state, and the summary `result` the cards render.
//   inhouseMatches/{id} the match *record* — written once the match has been
//                       played and resolved from OpenDota. Everything detailed.
//
// **Keyed by `dotaMatchId`.** A match record can exist without an inhouse game:
// league matches played before this site existed, or started from Discord, are
// backfilled by enumerating the league, and they have no `inhouseGames`
// document to hang off. Keying on the match id makes "have we already got this
// one" a document get, which is the whole dedupe story for that backfill.
// `gameId` is carried as a nullable field and indexed for the reverse lookup.

const COLLECTION = 'inhouseMatches';

/** One player's line in the match. */
export interface MatchRosterEntry {
  /**
   * Null for a private or anonymous profile, which OpenDota reports with no
   * `account_id`. They played and the slot is real, so the row is kept — the
   * attendance ledger skips them, because nothing can be attributed.
   */
  steamId32: string | null;
  /** Null when this Steam account has never been linked to a Discord profile. */
  discordId: string | null;
  /** Steam persona at the time of the match. */
  playerName: string | null;
  heroId: number | null;
  side: 'radiant' | 'dire';
  won: boolean;
  /** Valve slot index; < 128 is Radiant. */
  playerSlot: number | null;
  /** 0 stayed, 1 disconnected, 2+ abandoned. */
  leaverStatus: number | null;
  /**
   * Per-player numbers, captured for medal derivation.
   *
   * Stored, not displayed. §10 rules these out as public per-player stats and
   * as anything cumulative and comparable; the sanctioned use is picking a
   * first, second and third in a named category — "most courier kills",
   * "most support gold spent" — which is an award, not a ladder.
   *
   * Sparse on purpose. Some of these only exist once the replay is parsed, so a
   * key is simply absent until then and the parse pass fills it in. Anything
   * deriving medals must treat a missing key as "no data", never as zero.
   */
  stats?: Record<string, number> | null;
}

export type ParseState =
  /** Match resolved, no parse requested yet. */
  | 'unparsed'
  /** Parse requested; waiting on OpenDota. */
  | 'requested'
  /** Replay parsed — the deep fields exist. */
  | 'parsed'
  /** Gave up: the replay expired or OpenDota will never deliver it. */
  | 'unavailable';

export interface MatchRecord {
  dotaMatchId: number;
  /** Null for a league match that was never an inhouse game on this site. */
  gameId: string | null;
  gameNumber: number | null;
  /**
   * The lobby's in-game name, copied off the game document at ingestion.
   *
   * Denormalized deliberately: it is shown wherever a match is identified, and
   * the game document it comes from can be purged (a cancelled lobby) while the
   * match record must survive. Null for a backfilled league match.
   */
  lobbyName: string | null;

  radiantWin: boolean;
  durationSeconds: number;
  /** Kill score. Available without a parse. */
  radiantScore: number | null;
  direScore: number | null;
  /** Match start, ISO. */
  startedAt: string;

  gameMode: number | null;
  lobbyType: number | null;
  leagueId: number | null;

  roster: MatchRosterEntry[];
  /**
   * Every Steam ID in `roster`, flattened.
   *
   * Firestore cannot query a field inside an array of objects, so "which
   * matches was this player in" is impossible against `roster` alone. This is
   * the queryable projection of it — `array-contains-any` over a player's
   * accounts, which also handles alts in one query. Anonymous slots contribute
   * nothing, so it can be shorter than the roster.
   */
  playerSteamIds: string[];

  parseState: ParseState;
  parseJobId: number | null;
  parseRequestedAt: string | null;
  parsedAt: string | null;

  ingestedAt: string;
  updatedAt: string;
}

export async function getMatchRecord(dotaMatchId: number): Promise<MatchRecord | null> {
  const snap = await getDb().collection(COLLECTION).doc(String(dotaMatchId)).get();
  return snap.exists ? (snap.data() as MatchRecord) : null;
}

/** The record for an inhouse game, if its match has been ingested. */
export async function getMatchRecordForGame(gameId: string): Promise<MatchRecord | null> {
  const snap = await getDb()
    .collection(COLLECTION)
    .where('gameId', '==', gameId)
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as MatchRecord);
}

/** Write the record. Overwrites wholesale — ingestion is idempotent by design. */
export async function putMatchRecord(record: MatchRecord): Promise<void> {
  await getDb().collection(COLLECTION).doc(String(record.dotaMatchId)).set(record);
}

export async function patchMatchRecord(
  dotaMatchId: number,
  patch: Partial<MatchRecord>,
): Promise<void> {
  await getDb()
    .collection(COLLECTION)
    .doc(String(dotaMatchId))
    .set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

/**
 * A player's most recent matches, newest first.
 *
 * Takes every Steam account the person owns, because someone who played three
 * games on a smurf played three games. `array-contains-any` caps at 30 values,
 * which no real player will approach.
 */
export async function listMatchesForPlayer(
  steamIds: string[],
  limit = 5,
): Promise<MatchRecord[]> {
  const ids = steamIds.filter(Boolean).slice(0, 30);
  if (ids.length === 0) return [];

  const snap = await getDb()
    .collection(COLLECTION)
    .where('playerSteamIds', 'array-contains-any', ids)
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as MatchRecord);
}

/**
 * Records still waiting on a replay parse, oldest first.
 *
 * The cron sweep drives off this. `unparsed` is included alongside `requested`
 * so a match whose parse request failed outright gets another attempt rather
 * than sitting forever in a state nothing retries.
 */
export async function listAwaitingParse(limit = 20): Promise<MatchRecord[]> {
  const snap = await getDb()
    .collection(COLLECTION)
    .where('parseState', 'in', ['unparsed', 'requested'])
    .orderBy('ingestedAt', 'asc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as MatchRecord);
}

/**
 * Per-player fields captured from OpenDota, by key.
 *
 * A whitelist rather than "store the whole player object": OpenDota sends
 * roughly 150 fields per player including several large nested structures, and
 * ten of those per match is a document nobody wants to read.
 *
 * Split by availability, because it decides when a medal category can first be
 * computed. The `basic` set is present as soon as OpenDota has the match; the
 * `parsed` set only exists once the replay has been parsed, which may be hours
 * later or never.
 */
export const STAT_FIELDS = {
  basic: [
    'kills',
    'deaths',
    'assists',
    'gold_per_min',
    'xp_per_min',
    'net_worth',
    'gold_spent',
    'last_hits',
    'denies',
    'hero_damage',
    'hero_healing',
    'tower_damage',
    'level',
    'observer_kills',
    'sentry_kills',
    'courier_kills',
    'roshan_kills',
    'rune_pickups',
    'firstblood_claimed',
  ],
  parsed: [
    'obs_placed',
    'sen_placed',
    'camps_stacked',
    'creeps_stacked',
    'stuns',
    'lane_efficiency_pct',
    'actions_per_min',
    'life_state_dead',
    'teamfight_participation',
    'buyback_count',
  ],
} as const;

/**
 * Statistics that are not a field but a computation over one.
 *
 * Kept beside the whitelist because the medal catalogue reads them by the same
 * name as the flat fields, and a caller should not have to know which is which.
 */
function derivedStats(player: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};

  // `damage_taken` is an object keyed by damage source, not a total.
  const taken = player.damage_taken;
  if (taken && typeof taken === 'object') {
    const total = Object.values(taken as Record<string, unknown>)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      .reduce((a, b) => a + b, 0);
    if (total > 0) out.damageTaken = total;
  }

  // Smoke is nested in the item-use counts rather than exposed on its own.
  const uses = player.item_uses;
  if (uses && typeof uses === 'object') {
    const smoke = (uses as Record<string, unknown>).smoke_of_deceit;
    if (typeof smoke === 'number' && Number.isFinite(smoke)) out.smokeUsed = smoke;
  }

  return out;
}

/** Pull the whitelisted numeric fields out of an OpenDota player object. */
export function extractStats(player: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of [...STAT_FIELDS.basic, ...STAT_FIELDS.parsed]) {
    const v = player[key];
    // Booleans matter here: `firstblood_claimed` arrives as one, and a medal
    // for "most first bloods" needs it countable.
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'boolean') out[key] = v ? 1 : 0;
  }
  return { ...out, ...derivedStats(player) };
}
