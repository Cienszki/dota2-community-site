import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://dota2inhouse.pl';

  return [
    '',
    '/newsy',
    '/ranking',
    '/hall-of-fame',
    '/basher',
    '/streamy',
    '/rekrutacja',
    '/o-nas',
    '/kontakt',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1.0 : 0.8,
  }));
}
