// Medals a player has been awarded.
//
// Pure — no server imports — so both the profile card and anything client-side
// can read the shape.
//
// There is deliberately no enum of categories. A medal is whatever an admin's
// awarding task decided to hand out that round: it carries its own label and
// description rather than referencing a fixed list, so adding "most courier
// kills" later is data, not a schema change and a deploy. The task that derives
// them from match data does not exist yet — the numbers behind it are being
// collected (see `match-record.ts`, `STAT_FIELDS`), but which categories to
// award is still open.
//
// Stored inline on `inhousePlayers/{discordId}.medals`. A player accumulates a
// handful, they are read on every profile render, and they are never queried
// across players — three reasons not to make them a collection.

/** Podium position within a category. Null for a non-competitive award. */
export type MedalPlace = 1 | 2 | 3 | null;

export interface Medal {
  /**
   * Stable identifier, unique per player — `{category}-{period}` in practice.
   * Re-running the awarding task must overwrite rather than duplicate, and this
   * is what makes that possible.
   */
  id: string;
  label: string;
  /** What earning it took. Shown on hover. */
  description: string | null;
  place: MedalPlace;
  /** Key into MEDAL_ICONS. Falls back to a trophy if unrecognised. */
  icon: string;
  /**
   * Custom artwork, once it exists. Until then the icon carries it — which is
   * why this is nullable rather than the icon being a temporary hack: art
   * arriving later is a field being filled in, not a rewrite.
   */
  imageUrl: string | null;
  /** Human label for the window it covers, e.g. "sierpień 2026". */
  period: string | null;
  awardedAt: string;
}

/**
 * Icon keys the awarding task may use.
 *
 * A closed set on purpose: the medal record is written by a task, and letting
 * it name arbitrary components would mean a typo renders nothing. Unknown keys
 * fall back rather than disappearing.
 */
export const MEDAL_ICON_KEYS = [
  'trophy',
  'flame',
  'star',
  'shield',
  'crown',
  'target',
  'zap',
  'heart',
  'coins',
  'eye',
  'clock',
  'swords',
] as const;

export type MedalIconKey = (typeof MEDAL_ICON_KEYS)[number];

/** Gold, silver, bronze — and a neutral tone for awards with no podium. */
export function placeColour(place: MedalPlace): string {
  switch (place) {
    case 1:
      return '#fbbf24';
    case 2:
      return '#cbd5e1';
    case 3:
      return '#d97706';
    default:
      return '#94a3b8';
  }
}

export function placeLabel(place: MedalPlace): string | null {
  switch (place) {
    case 1:
      return '1. miejsce';
    case 2:
      return '2. miejsce';
    case 3:
      return '3. miejsce';
    default:
      return null;
  }
}

/** Everything a tooltip needs, assembled once so both surfaces read the same. */
export function medalTooltip(medal: Medal): string {
  return [medal.label, placeLabel(medal.place), medal.period, medal.description]
    .filter(Boolean)
    .join(' · ');
}

/** Newest first, podium ahead of participation within the same moment. */
export function sortMedals(medals: Medal[]): Medal[] {
  return [...medals].sort((a, b) => {
    const byDate = (b.awardedAt ?? '').localeCompare(a.awardedAt ?? '');
    if (byDate !== 0) return byDate;
    return (a.place ?? 9) - (b.place ?? 9);
  });
}
