// The site's DB-backed static content pages (formerly served by a single
// `app/[slug]` catch-all). They were split into explicit routes so that
// `[slug]` no longer greedily matches — and 404s — every unknown top-level
// path. That greedy match would sit in front of the `next.config` fallback
// rewrite and stop tournament slugs (dota2inhouse.pl/wiosenna, …) from ever
// reaching the Firebase-hosted tournament app.
//
// Keep this list in step with the route folders under `app/` (one per key) and
// with the reserved-slugs list the tournament project enforces.

export interface ContentPageMeta {
  /** Heading + fallback <title>. */
  title: string;
  description: string;
  /** Preferred <title>/OG title when set. */
  ogTitle?: string;
}

export type ContentSlug = 'rekrutacja' | 'o-nas' | 'polityka-prywatnosci';

export const CONTENT_PAGES: Record<ContentSlug, ContentPageMeta> = {
  rekrutacja: {
    title: 'Rekrutacja',
    description:
      'Dołącz do ekipy Polish Dota2 Inhouse! Poszukujemy komentatorów, adminów, moderatorów, edytorów wideo oraz grafików.',
    ogTitle: 'Rekrutacja do Zespołu',
  },
  'o-nas': {
    title: 'O nas',
    description:
      'Poznaj historię Polish Dota2 Inhouse – polskiej ligi i społeczności graczy Dota 2 działającej od 2022 roku.',
    ogTitle: 'O Nas - Poznaj naszą społeczność',
  },
  'polityka-prywatnosci': {
    title: 'Polityka Prywatności',
    description: 'Polityka prywatności serwisu dota2inhouse.pl.',
  },
};
