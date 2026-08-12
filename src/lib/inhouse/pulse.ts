// The "Puls Ligi Inhouse" score — a single 0-10 number for how alive the
// league is this week, and the visual gauge that reads it out. Ported from
// the designer's standalone simulator (ZMIANY/gemini-code-*.html); the
// formula below is a line-for-line translation of that file's
// `updateCalculator`, not a reinterpretation of it.
//
// Pure and server-agnostic on purpose: `pulse-stats.ts` (Firestore) computes
// the six inputs, `InhousePulse.tsx` (client) turns a score back into a
// label/colour/glow for the gauge. Neither of those should have to duplicate
// the thresholds, so both import this file instead.

export interface PulseInputs {
  /** Finished games in the last 7 days. */
  games: number;
  /** Average finished games per week, over the 3 weeks before this one. */
  avgGames: number;
  /** Distinct players in the last 7 days. */
  players: number;
  /** Average distinct players per week, over the 3 weeks before this one. */
  avgPlayers: number;
  /** % of possible pairs (among players active in the quality window) who have actually shared a lobby. */
  mixPercent: number;
  /** Shannon entropy of hero picks in the quality window, as % of the theoretical max. */
  heroEntropyPercent: number;
}

export type PulseTier =
  | 'deep-freeze'
  | 'freeze'
  | 'cooldown'
  | 'active'
  | 'strong'
  | 'blazing'
  | 'overload';

export interface PulseStatus {
  tier: PulseTier;
  icon: string;
  label: string;
  description: string;
}

/** 0 games is 0, full stop — nothing below computes anything meaningful without it. */
export function computePulseScore(inputs: PulseInputs): number {
  if (inputs.games <= 0) return 0;

  // A brand-new league has no 3-week history yet; treating that as a floor of
  // 1 rather than dividing by zero means any activity reads as "above
  // baseline", which is the right instinct for a cold start.
  const avgGames = Math.max(inputs.avgGames, 1);
  const avgPlayers = Math.max(inputs.avgPlayers, 1);

  const attendanceRatio = inputs.players / avgPlayers;
  const rawAttendanceScore =
    attendanceRatio <= 1 ? attendanceRatio * 3.5 : 3.5 + (attendanceRatio - 1) * 5.0;

  const rawMixScore =
    inputs.mixPercent <= 60
      ? (inputs.mixPercent / 100) * 3.5
      : 0.6 * 3.5 + ((inputs.mixPercent - 60) / 100) * 5.0;

  const rawEntropyScore =
    inputs.heroEntropyPercent < 50
      ? (inputs.heroEntropyPercent / 100) * 3.0
      : 0.5 * 3.0 + ((inputs.heroEntropyPercent - 50) / 100) * 5.0;

  const isAboveAvg = inputs.games > avgGames;
  const gamesScore = !isAboveAvg
    ? (inputs.games / avgGames) * 2.5
    : 2.5 + ((inputs.games - avgGames) / avgGames) * 2.0;

  const volumeRatio = Math.min(inputs.games / avgGames, 1);
  const scaledQualityScore = (rawAttendanceScore + rawMixScore + rawEntropyScore) * volumeRatio;

  return Math.min(Math.max(scaledQualityScore + gamesScore, 0), 10);
}

/**
 * Label, description and icon for a score. A pure function of the score
 * alone — `computePulseScore` only ever returns exactly 0 when `games <= 0`,
 * so that one case is distinguishable from a merely-quiet week without
 * threading the raw inputs through too.
 */
export function pulseStatusFor(score: number): PulseStatus {
  if (score <= 0) {
    return {
      tier: 'deep-freeze',
      icon: '🧊',
      label: 'Głębokie zamrożenie (0.0)',
      description: 'Brak rozegranych gier w tym tygodniu. Serwer całkowicie zamrożony!',
    };
  }
  if (score <= 0.3) {
    return {
      tier: 'deep-freeze',
      icon: '🧊',
      label: 'Głębokie zamrożenie',
      description: 'Ekstremalny mróz! Serwer całkowicie skuty lodem!',
    };
  }
  if (score <= 1.5) {
    return {
      tier: 'freeze',
      icon: '❄️',
      label: 'Zamrożenie',
      description: 'Bardzo niska aktywność na serwerze.',
    };
  }
  if (score <= 3.0) {
    return {
      tier: 'cooldown',
      icon: '🌬️',
      label: 'Ochłodzenie',
      description: 'Powolne tempo, pojedyncze gry w ciągu tygodnia.',
    };
  }
  if (score <= 7.0) {
    return {
      tier: 'active',
      icon: '🎮',
      label: 'Jest grane!',
      description: 'Stabilna frekwencja i równe tempo gier ligowych.',
    };
  }
  if (score <= 8.5) {
    return {
      tier: 'strong',
      icon: '⚡',
      label: 'Mocne inhousy',
      description: 'Wysoka aktywność, dynamiczne i wymieszane składy!',
    };
  }
  if (score <= 9.7) {
    return {
      tier: 'blazing',
      icon: '🔥',
      label: 'Liga płonie!',
      description: 'Eksplozja aktywności! Prawie wszyscy gracze w grze!',
    };
  }
  return {
    tier: 'overload',
    icon: '🎮',
    label: 'Przeciążenie ligi!',
    description: 'Ekstremalne przeciążenie sieci! Absolutny rekord aktywności!',
  };
}
