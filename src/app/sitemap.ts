import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://dota2inhouse.pl';

  return [
    '',
    '/newsy',
    '/inhouse',
    '/inhouse/how-it-works',
    '/ranking',
    '/hall-of-fame',
    '/basher',
    '/streamy',
    '/wesprzyj-nas',
    '/rekrutacja',
    '/o-nas',
    '/kontakt',
    // Individual /inhouse/{id} game pages are deliberately NOT listed — an
    // unpublished game must leave no trace on any public surface (invariant 0.1).
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1.0 : 0.8,
  }));
}
