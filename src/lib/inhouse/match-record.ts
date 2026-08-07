import 'server-only';
import { getDb } from '@/lib/firebase-admin';

// The resolved facts of a played match, in `inhouseMatches/{gameId}`.
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
// Keyed by gameId, not dotaMatchId, because gameId is what every other
// collection joins on and it exists before the match does.

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
   * Per-player performance stats. Deliberately empty for now.
   *
   * §10 of the design doc rules out rivalrous, performance-based numbers on
   * public surfaces, and the decision on which of these to collect has been
   * explicitly deferred. The field exists so adding KDA, GPM or net worth later
   * is a write-side change only — nothing that reads a match record has to
   * change shape when it lands.
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
  gameId: string;
  gameNumber: number;
  dotaMatchId: number;

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

  parseState: ParseState;
  parseJobId: number | null;
  parseRequestedAt: string | null;
  parsedAt: string | null;

  ingestedAt: string;
  updatedAt: string;
}

export async function getMatchRecord(gameId: string): Promise<MatchRecord | null> {
  const snap = await getDb().collection(COLLECTION).doc(gameId).get();
  return snap.exists ? (snap.data() as MatchRecord) : null;
}

/** Write the record. Overwrites wholesale — ingestion is idempotent by design. */
export async function putMatchRecord(record: MatchRecord): Promise<void> {
  await getDb().collection(COLLECTION).doc(record.gameId).set(record);
}

export async function patchMatchRecord(
  gameId: string,
  patch: Partial<MatchRecord>,
): Promise<void> {
  await getDb()
    .collection(COLLECTION)
    .doc(gameId)
    .set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
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
