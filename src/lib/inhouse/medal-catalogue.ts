// The medal catalogue — every award, what earns it, and where its art lives.
//
// Thirteen categories, three places each. A category names one statistic and a
// direction; first, second and third place in it are three separate medals with
// their own names and artwork, which is why the tiers are spelled out rather
// than generated from a template.
//
// This is data, not schema: `Medal` (see medals.ts) carries its own label and
// description, so the awarding task writes a snapshot of the definition onto
// the player. Renaming a medal here does not rewrite history, and it should
// not — an award said something at the time it was given.
//
// **`availability` is the field to read before building anything on a
// category.** It records what OpenDota actually provides, verified against a
// parsed match rather than assumed:
//
//   direct      the value is a field on the player object
//   derived     computable, but not from one field — see `note`
//   unavailable OpenDota does not expose it at all; the medal cannot be awarded
//
// `parseGated` categories only have data once the replay has been parsed, which
// the ingest pipeline requests but cannot guarantee. An unparsed match must
// count as no data, never as zero.

export type MedalPlaceTier = 1 | 2 | 3;

export interface MedalDefinition {
  /** Stable slug. Also the artwork filename: /images/medals/{id}.png */
  id: string;
  label: string;
  /** Tooltip copy, straight from the designer's sheet. */
  description: string;
  place: MedalPlaceTier;
  /** Lucide key, used until the artwork file exists. */
  icon: string;
}

export interface MedalCategory {
  id: string;
  label: string;
  /** Key in MatchRosterEntry.stats, or a derived key computed at ingestion. */
  stat: string;
  /** Which end of the ranking wins it. */
  direction: 'highest' | 'lowest';
  /** How per-match values combine into a career figure. */
  aggregate: 'sum' | 'average';
  availability: 'direct' | 'derived' | 'unavailable';
  parseGated: boolean;
  note?: string;
  tiers: MedalDefinition[];
}

export const MEDAL_CATEGORIES: MedalCategory[] = [
  {
    id: 'support-gold',
    label: 'Złoto na przedmioty wspierające',
    stat: 'supportGold',
    direction: 'highest',
    aggregate: 'sum',
    availability: 'derived',
    parseGated: true,
    note:
      "Sum the cost of support items in `purchase`. Needs an item -> cost + is-support table; Dota's item list is not in the match payload.",
    tiers: [
      { id: 'filantrop', label: 'Filantrop', description: 'Najwięcej wydanego złota na przedmioty supportujące', place: 1, icon: 'coins' },
      { id: 'wizjoner', label: 'Wizjoner', description: 'Top 2 wydanego złota na przedmioty supportujące', place: 2, icon: 'coins' },
      { id: 'kupiec-wardow', label: 'Kupiec wardów', description: 'Top 3 wydanego złota na przedmioty supportujące', place: 3, icon: 'coins' },
    ],
  },
  {
    id: 'healing',
    label: 'Wyleczone punkty zdrowia',
    stat: 'hero_healing',
    direction: 'highest',
    aggregate: 'sum',
    availability: 'direct',
    parseGated: false,
    tiers: [
      { id: 'ordynator-szpitala-inhouse', label: 'Ordynator Szpitala Inhouse', description: 'Najwięcej wyleczonych pkt zdrowia', place: 1, icon: 'heart' },
      { id: 'utalentowany-terapeuta', label: 'Utalentowany terapeuta', description: 'Top 2 najwięcej wyleczonych pkt zdrowia', place: 2, icon: 'heart' },
      { id: 'sanitariusz', label: 'Sanitariusz', description: 'Top 3 wyleczonych pkt zdrowia', place: 3, icon: 'heart' },
    ],
  },
  {
    id: 'damage-taken',
    label: 'Otrzymane obrażenia',
    stat: 'damageTaken',
    direction: 'highest',
    aggregate: 'sum',
    availability: 'derived',
    parseGated: true,
    note:
      'Sum the values of the `damage_taken` object, which is keyed by damage source.',
    tiers: [
      { id: 'worek-treningowy', label: 'Worek treningowy', description: 'Najwięcej otrzymanych obrażeń', place: 1, icon: 'shield' },
      { id: 'mocno-skopany', label: 'Mocno skopany', description: 'Top 2 otrzymanych obrażeń', place: 2, icon: 'shield' },
      { id: 'posiniaczony', label: 'Posiniaczony', description: 'Top 3 otrzymanych obrażeń', place: 3, icon: 'shield' },
    ],
  },
  {
    id: 'roshan',
    label: 'Zabójstwa Roshana',
    stat: 'roshan_kills',
    direction: 'highest',
    aggregate: 'sum',
    availability: 'direct',
    parseGated: false,
    tiers: [
      { id: 'gangbanger-roshana', label: 'Gangbanger Roshana', description: 'Pokonał Roshana największą ilość razy', place: 1, icon: 'swords' },
      { id: 'roshmembert', label: 'Roshmembert', description: 'Top 2 w dobijaniu Roshana', place: 2, icon: 'swords' },
      { id: 'przesladowca-roshana', label: 'Prześladowca Roshana', description: 'Top 3 w dobijaniu Roshana', place: 3, icon: 'swords' },
    ],
  },
  {
    id: 'stuns',
    label: 'Czas ogłuszenia przeciwników',
    stat: 'stuns',
    direction: 'highest',
    aggregate: 'sum',
    availability: 'direct',
    parseGated: true,
    tiers: [
      { id: 'paralizator', label: 'Paralizator', description: 'Ogłuszył przeciwników najdłużej ze wszystkich', place: 1, icon: 'zap' },
      { id: 'ogluszacz', label: 'Ogłuszacz', description: 'Top 2 ogłuszenia przeciwników', place: 2, icon: 'zap' },
      { id: 'wstrzasacz', label: 'Wstrząsacz', description: 'Top 3 ogłuszenia przeciwników', place: 3, icon: 'zap' },
    ],
  },
  {
    id: 'courier',
    label: 'Zabite kuriery',
    stat: 'courier_kills',
    direction: 'highest',
    aggregate: 'sum',
    availability: 'direct',
    parseGated: false,
    tiers: [
      { id: 'pracownik-kfc', label: 'Pracownik KFC', description: 'Zabił najwięcej kurierów przeciwnika', place: 1, icon: 'target' },
      { id: 'dzisiaj-nuggetsy', label: 'Dzisiaj nuggetsy', description: 'Top 2 zabitych kurierów przeciwnika', place: 2, icon: 'target' },
      { id: 'kurczak-z-rozna', label: 'Kurczak z rożna', description: 'Top 3 zabitych kurierów przeciwnika', place: 3, icon: 'target' },
    ],
  },
  {
    id: 'longest-games',
    label: 'Najdłuższe gry',
    stat: 'matchDuration',
    direction: 'highest',
    aggregate: 'average',
    availability: 'direct',
    parseGated: false,
    note:
      "Match-level, not per-player: average `durationSeconds` across the player's matches.",
    tiers: [
      { id: 'maratonczyk', label: 'Maratończyk', description: 'Ma najdłuższe gry ze wszystkich', place: 1, icon: 'clock' },
      { id: 'triatlonista', label: 'Triatlonista', description: 'Top 2 najdłużej trwających gier (średnia)', place: 2, icon: 'clock' },
      { id: 'jogger', label: 'Jogger', description: 'Top 3 najdłużej trwających gier (średnia)', place: 3, icon: 'clock' },
    ],
  },
  {
    id: 'shortest-games',
    label: 'Najkrótsze gry',
    stat: 'matchDuration',
    direction: 'lowest',
    aggregate: 'average',
    availability: 'direct',
    parseGated: false,
    note:
      "Match-level, not per-player: average `durationSeconds` across the player's matches.",
    tiers: [
      { id: 'blyskawica', label: 'Błyskawica', description: 'Ma najkrótsze gry ze wszystkich', place: 1, icon: 'zap' },
      { id: 'zapierdalacz', label: 'Zapierdalacz', description: 'Top 2 najkrócej trwających gier (średnia)', place: 2, icon: 'zap' },
      { id: 'czas-to-pieniadz', label: 'Czas to pieniądz', description: 'Top 3 najkrócej trwających gier (średnia)', place: 3, icon: 'zap' },
    ],
  },
  {
    id: 'dead-time',
    label: 'Czas spędzony martwym',
    stat: 'life_state_dead',
    direction: 'highest',
    aggregate: 'sum',
    availability: 'direct',
    parseGated: true,
    tiers: [
      { id: 'pogrzebany', label: 'Pogrzebany', description: 'Najdłuższy „dead time” ze wszystkich', place: 1, icon: 'clock' },
      { id: 'klawiatura-zbedna', label: 'Klawiatura zbędna', description: 'Top 2 „dead time”', place: 2, icon: 'clock' },
      { id: 'obserwator-meczu', label: 'Obserwator meczu', description: 'Top 3 „dead time”', place: 3, icon: 'clock' },
    ],
  },
  {
    id: 'first-blood',
    label: 'Zabójstwa First blood',
    stat: 'firstblood_claimed',
    direction: 'highest',
    aggregate: 'sum',
    availability: 'direct',
    parseGated: false,
    note:
      "Awarded to whoever GETS the first blood, which is exactly what `firstblood_claimed` flags — no derivation needed, and it works on unparsed matches too. It was originally specced as dying to first blood, which would have meant resolving the victim from the killer's kills_log against first_blood_time.",
    tiers: [
      { id: 'pan-keczup', label: 'Pan Keczup', description: 'Mistrz zabójstw First blood', place: 1, icon: 'target' },
      { id: 'zlamany-psychicznie', label: 'Łamacz psychiki', description: 'Top 2 zabójstw First blooda', place: 2, icon: 'target' },
      { id: 'nokaut-na-pierwszej-randce', label: 'Nokaut na pierwszej randce', description: 'Top 3 zabójstw First blooda', place: 3, icon: 'target' },
    ],
  },
  {
    id: 'lifesteal',
    label: 'Odzyskane HP z lifestealu',
    stat: 'selfHealing',
    direction: 'highest',
    aggregate: 'sum',
    availability: 'derived',
    parseGated: true,
    note:
      "The parsed `healing` object is keyed by the hero who RECEIVED the healing, so the entry matching the player's own hero is their self-healing. Verified on match 8940990352: a Centaur with hero_healing 0 has healing.npc_dota_hero_centaur = 49215. Note this is total self-sustain — lifesteal plus regen, salves and items — because neither OpenDota nor STRATZ breaks healing down by source. Closest available, and arguably the better medal.",
    tiers: [
      { id: 'dracula', label: 'Dracula', description: 'Najwięcej odzyskanego HP przez lifesteal i spell lifesteal', place: 1, icon: 'heart' },
      { id: 'mocno-ciagnie', label: 'Mocno ciągnie', description: 'Top 2 odzyskanego HP przez lifesteal i spell lifesteal', place: 2, icon: 'heart' },
      { id: 'ssak-pospolity', label: 'Ssak pospolity', description: 'Top 3 odzyskanego HP przez lifesteal i spell lifesteal', place: 3, icon: 'heart' },
    ],
  },
  {
    id: 'neutral-creeps',
    label: 'Zabite neutralne creepy',
    stat: 'neutral_kills',
    direction: 'highest',
    aggregate: 'sum',
    availability: 'direct',
    parseGated: false,
    tiers: [
      { id: 'mysliwy', label: 'Myśliwy', description: 'Zabił najwięcej neutralnych creepów', place: 1, icon: 'swords' },
      { id: 'klusownik', label: 'Kłusownik', description: 'Top 2 w neutralnych creepach', place: 2, icon: 'swords' },
      { id: 'milosnik-zwierzat', label: 'Miłośnik zwierząt', description: 'Top 3 w neutralnych creepach', place: 3, icon: 'swords' },
    ],
  },
  {
    id: 'smoke',
    label: 'Użyte Smoke of Deceit',
    stat: 'smokeUsed',
    direction: 'highest',
    aggregate: 'sum',
    availability: 'derived',
    parseGated: true,
    note:
      '`item_uses.smoke_of_deceit`, nested rather than top-level.',
    tiers: [
      { id: 'zadymiarz', label: 'Zadymiarz', description: 'Użył najwięcej Smoke ze wszystkich', place: 1, icon: 'eye' },
      { id: 'dymi-jak-z-wedzarni', label: 'Dymi jak z wędzarni', description: 'Top 2 użytych Smoke', place: 2, icon: 'eye' },
      { id: 'lubi-spalic-dymka', label: 'Lubi spalić dymka', description: 'Top 3 użytych Smoke', place: 3, icon: 'eye' },
    ],
  },
];

/** Every medal, flattened. */
export const ALL_MEDALS: MedalDefinition[] = MEDAL_CATEGORIES.flatMap((c) => c.tiers);

/** Categories that can actually be awarded today. */
export const AWARDABLE_CATEGORIES = MEDAL_CATEGORIES.filter(
  (c) => c.availability !== 'unavailable',
);

const BY_ID = new Map(ALL_MEDALS.map((m) => [m.id, m]));

export function medalDefinition(id: string): MedalDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * Artwork path for a medal.
 *
 * Convention over configuration: the file is named after the medal id, so
 * adding art is dropping a file in, with nothing to wire up. Callers should
 * fall back to the lucide icon when the file is missing — which is every medal
 * until the designer's files land.
 */
export function medalImagePath(id: string): string {
  return `/images/medals/${id}.png`;
}
