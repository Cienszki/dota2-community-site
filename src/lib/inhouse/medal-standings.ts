import { AWARDABLE_CATEGORIES, type MedalCategory, type MedalDefinition } from './medal-catalogue';

// Who wins which medal, given match history.
//
// Pure and server-agnostic on purpose, the same split as pulse.ts /
// pulse-stats.ts: `medal-awards.ts` does the Firestore reads and writes, this
// decides the standings. Neither the ranking rules nor the eligibility bar
// should live somewhere that needs a database to exercise.

/** One player's line in a match — only the fields the standings read. */
export interface StandingsPlayerLine {
  steamId32: string | null;
  /**
   * Sparse. A `parseGated` stat is simply absent until the replay is parsed,
   * and an absent key means "no data", never zero.
   */
  stats?: Record<string, number> | null;
}

/** A match — only the fields the standings read. `MatchRecord` satisfies this. */
export interface StandingsMatch {
  durationSeconds: number;
  roster: StandingsPlayerLine[];
}

export interface MedalStandings {
  /** Medals earned, by Discord id. */
  byPlayer: Map<string, MedalDefinition[]>;
  /** Categories where nobody cleared the bar — usually too few matches yet. */
  emptyCategories: string[];
}

/**
 * Matches a player needs before an averaged category will consider them.
 *
 * Only averages need this, and they need it badly: "shortest games" decided on
 * a single 18-minute stomp is a permanent first place off one lucky night. Sums
 * are self-limiting — nobody totals the most courier kills without playing.
 */
export const MIN_MATCHES_FOR_AVERAGE = 5;

/** Three tiers per category, so three places. */
const PODIUM = 3;

interface Tally {
  total: number;
  /** Matches that contributed a value. Never a count of games played. */
  samples: number;
}

/**
 * Statistics that belong to the match rather than to a player's line in it.
 *
 * "Longest games" is the average length of the matches someone turned up to,
 * which is a fact about the match; every other category reads the per-player
 * stat block.
 */
const MATCH_LEVEL_STATS: Record<string, (match: StandingsMatch) => number | null> = {
  matchDuration: (match) =>
    typeof match.durationSeconds === 'number' && match.durationSeconds > 0
      ? match.durationSeconds
      : null,
};

/**
 * One player's value for a category in one match, or null for "no data".
 *
 * Null and zero are different answers and the difference is load-bearing: a
 * `parseGated` stat is absent until the replay is parsed, and counting that
 * absence as zero would drag down every average and hand "fewest X" medals to
 * people whose matches merely never parsed.
 */
function statValue(
  category: MedalCategory,
  match: StandingsMatch,
  line: StandingsPlayerLine,
): number | null {
  const matchLevel = MATCH_LEVEL_STATS[category.stat];
  if (matchLevel) return matchLevel(match);

  const value = line.stats?.[category.stat];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function aggregateValue(tally: Tally, aggregate: MedalCategory['aggregate']): number {
  return aggregate === 'average' ? tally.total / tally.samples : tally.total;
}

function eligible(category: MedalCategory, tally: Tally): boolean {
  if (tally.samples === 0) return false;
  if (category.aggregate === 'average') return tally.samples >= MIN_MATCHES_FOR_AVERAGE;

  // A total of zero is not an achievement. Without this, third place in "most
  // Roshan kills" goes to whoever sorts first among the many players who have
  // never killed one. Only applies to `highest` — for a `lowest` category zero
  // would be the achievement.
  return category.direction === 'highest' ? tally.total > 0 : true;
}

/**
 * Rank every category and hand out the podium.
 *
 * `ownerOf` maps a Steam account to the Discord id that owns it, including
 * alts, so three accounts count as one player. Lines whose account maps to
 * nobody are skipped: an anonymous or unlinked player has nowhere to hang a
 * medal. They still played — this only skips the award.
 */
export function computeMedalStandings(
  matches: readonly StandingsMatch[],
  ownerOf: ReadonlyMap<string, string>,
): MedalStandings {
  const tallies = new Map<string, Map<string, Tally>>();
  for (const category of AWARDABLE_CATEGORIES) tallies.set(category.id, new Map());

  for (const match of matches) {
    for (const line of match.roster ?? []) {
      const discordId = line.steamId32 ? ownerOf.get(String(line.steamId32)) : undefined;
      if (!discordId) continue;

      for (const category of AWARDABLE_CATEGORIES) {
        const value = statValue(category, match, line);
        if (value === null) continue;

        const board = tallies.get(category.id);
        if (!board) continue;
        const tally = board.get(discordId) ?? { total: 0, samples: 0 };
        tally.total += value;
        tally.samples += 1;
        board.set(discordId, tally);
      }
    }
  }

  const byPlayer = new Map<string, MedalDefinition[]>();
  const emptyCategories: string[] = [];

  for (const category of AWARDABLE_CATEGORIES) {
    const board = tallies.get(category.id);
    if (!board) continue;

    const ranked = [...board.entries()]
      .filter(([, tally]) => eligible(category, tally))
      .map(([discordId, tally]) => ({
        discordId,
        value: aggregateValue(tally, category.aggregate),
      }))
      .sort((a, b) => {
        const byValue =
          category.direction === 'highest' ? b.value - a.value : a.value - b.value;
        if (byValue !== 0) return byValue;
        // Deterministic tie-break. Without it two equal players swap the medal
        // on every recompute, which rewrites awardedAt and republishes both to
        // the "recently awarded" feed forever.
        return a.discordId.localeCompare(b.discordId);
      })
      .slice(0, PODIUM);

    if (ranked.length === 0) {
      emptyCategories.push(category.id);
      continue;
    }

    ranked.forEach((row, index) => {
      const tier = category.tiers.find((t) => t.place === index + 1);
      if (!tier) return;
      byPlayer.set(row.discordId, [...(byPlayer.get(row.discordId) ?? []), tier]);
    });
  }

  return { byPlayer, emptyCategories };
}
