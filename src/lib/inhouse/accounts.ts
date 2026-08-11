import 'server-only';
import { getDb } from '@/lib/firebase-admin';
import { getRankingStatus } from './ranking-enrol';
import type { AttendanceRecord, InhousePlayer, ModerationRecord } from './core/types';

// The account list behind /admin/inhouse/accounts.
//
// There are two identity spaces and the screen has to show both, because most
// of the people in the system are in only one of them: a Steam ID appears the
// moment someone walks into a lobby, whereas an `inhousePlayers` document only
// exists for those who linked. Listing linked players alone would hide the
// majority; listing Steam IDs alone would lose the fact that three of them are
// one person.
//
// So the unit here is the **person where we can identify one, and the account
// where we cannot** — a linked profile collapses its Steam accounts into one
// row, and every unlinked Steam ID gets a row of its own.

/** How many rows the screen assembles. Paging can come when it needs to. */
const LIMIT = 300;

export interface AccountSteamEntry {
  steamId32: string;
  /** Steam persona last seen in a lobby, when we have one. */
  playerName: string | null;
  inRanking: boolean;
  excludedFromRanking: boolean;
}

export interface AccountRow {
  /** Stable key: the Discord ID for a linked person, else `steam:{id}`. */
  key: string;
  discordId: string | null;
  discordName: string | null;
  steam: AccountSteamEntry[];
  gamesPlayed: number;
  linkedAt: string | null;
  linkSource: string | null;
  /** Live ban against either identity, if any. */
  ban: { id: string; reason: string; expiresAt: string | null } | null;
}

export interface AccountsPage {
  rows: AccountRow[];
  /** False when migration 024 has not been run — ranking columns are unreadable. */
  rankingAvailable: boolean;
  totals: { linked: number; unlinked: number; inRanking: number; excluded: number };
}

/** Steam IDs seen in the attendance ledger, with the last name each played under. */
async function steamIdsFromAttendance(): Promise<Map<string, string | null>> {
  const seen = new Map<string, string | null>();
  const snap = await getDb()
    .collection('inhouseAttendance')
    .orderBy('createdAt', 'desc')
    .limit(LIMIT * 4)
    .get();
  for (const doc of snap.docs) {
    const row = doc.data() as AttendanceRecord;
    if (row.steamId32 && !seen.has(row.steamId32)) seen.set(row.steamId32, null);
  }
  return seen;
}

/**
 * Names for unlinked Steam accounts.
 *
 * The ledger doesn't carry one — attendance is derived from the match roster,
 * which is Steam IDs and hero ids. The match records do carry the persona, so
 * that is where a human-readable name for an unlinked account comes from.
 */
async function namesFromMatches(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const snap = await getDb()
    .collection('inhouseMatches')
    .orderBy('startedAt', 'desc')
    .limit(50)
    .get();
  for (const doc of snap.docs) {
    const roster = (doc.data().roster ?? []) as Array<{
      steamId32: string | null;
      playerName: string | null;
    }>;
    for (const r of roster) {
      if (r.steamId32 && r.playerName && !names.has(r.steamId32)) {
        names.set(r.steamId32, r.playerName);
      }
    }
  }
  return names;
}

/** Live bans, indexed by both identity spaces. */
async function liveBans(): Promise<{
  byDiscord: Map<string, ModerationRecord>;
  bySteam: Map<string, ModerationRecord>;
}> {
  const byDiscord = new Map<string, ModerationRecord>();
  const bySteam = new Map<string, ModerationRecord>();

  const snap = await getDb()
    .collection('inhouseModeration')
    .where('kind', '==', 'ban')
    .limit(LIMIT)
    .get();

  const now = Date.now();
  for (const doc of snap.docs) {
    const r = doc.data() as ModerationRecord;
    if (r.revokedAt) continue;
    if (r.expiresAt && Date.parse(r.expiresAt) <= now) continue;
    if (r.subjectDiscordId) byDiscord.set(r.subjectDiscordId, r);
    if (r.subjectSteamId32) bySteam.set(r.subjectSteamId32, r);
  }
  return { byDiscord, bySteam };
}

/** Assemble the whole account list. */
export async function listAccounts(): Promise<AccountsPage> {
  const [playerSnap, ledger, names, bans] = await Promise.all([
    getDb().collection('inhousePlayers').limit(LIMIT).get(),
    steamIdsFromAttendance(),
    namesFromMatches(),
    liveBans(),
  ]);

  const players = playerSnap.docs.map((d) => d.data() as InhousePlayer);

  // Every Steam ID anywhere, so ranking status is one round trip rather than
  // one per row.
  const allSteamIds = new Set<string>(ledger.keys());
  for (const p of players) for (const id of p.steamIds ?? []) allSteamIds.add(id);
  const ranking = await getRankingStatus([...allSteamIds]);
  const rank = ranking.statuses;

  const status = (id: string): AccountSteamEntry => ({
    steamId32: id,
    playerName: names.get(id) ?? null,
    inRanking: rank.get(id)?.listed ?? false,
    excludedFromRanking: rank.get(id)?.excluded ?? false,
  });

  const toBan = (r: ModerationRecord | undefined) =>
    r ? { id: r.id, reason: r.reason, expiresAt: r.expiresAt } : null;

  const rows: AccountRow[] = [];
  const claimed = new Set<string>();

  for (const p of players) {
    const steamIds = p.steamIds ?? [];
    for (const id of steamIds) claimed.add(id);

    rows.push({
      key: p.discordId,
      discordId: p.discordId,
      discordName: p.discordName,
      steam: steamIds.map(status),
      gamesPlayed: p.gamesPlayed ?? 0,
      linkedAt: p.linkedAt,
      linkSource: p.linkSource,
      ban:
        toBan(bans.byDiscord.get(p.discordId)) ??
        toBan(steamIds.map((id) => bans.bySteam.get(id)).find(Boolean)),
    });
  }

  // Everyone who has played but never linked — the majority, by design.
  for (const id of ledger.keys()) {
    if (claimed.has(id)) continue;
    rows.push({
      key: `steam:${id}`,
      discordId: null,
      discordName: null,
      steam: [status(id)],
      gamesPlayed: 0,
      linkedAt: null,
      linkSource: null,
      ban: toBan(bans.bySteam.get(id)),
    });
  }

  rows.sort((a, b) => {
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
    return (a.discordName ?? a.key).localeCompare(b.discordName ?? b.key, 'pl');
  });

  const flat = rows.flatMap((r) => r.steam);
  return {
    rows,
    rankingAvailable: ranking.available,
    totals: {
      linked: rows.filter((r) => r.discordId).length,
      unlinked: rows.filter((r) => !r.discordId).length,
      inRanking: flat.filter((s) => s.inRanking).length,
      excluded: flat.filter((s) => s.excludedFromRanking).length,
    },
  };
}

/**
 * Games played per Steam account, for the unlinked rows.
 *
 * Not folded into `listAccounts` — it is one aggregation query per account, and
 * the list is meant to load quickly. The detail view asks for it.
 */
export async function gamesPlayedFor(steamId32: string): Promise<number> {
  const snap = await getDb()
    .collection('inhouseAttendance')
    .where('steamId32', '==', steamId32)
    .count()
    .get();
  return snap.data().count;
}
