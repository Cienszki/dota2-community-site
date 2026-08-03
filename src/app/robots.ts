import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // '/admin' (no trailing slash) is a prefix match, so it also covers
      // '/admin-login' — listed separately anyway so the intent doesn't
      // depend on that subtlety being obvious to a future reader.
      disallow: ['/admin', '/admin-login', '/api/'],
    },
    sitemap: 'https://dota2inhouse.pl/sitemap.xml',
  };
}
