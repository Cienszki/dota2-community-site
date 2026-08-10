import 'server-only';
import { unstable_cache } from 'next/cache';
import { fetchHeroes } from './opendota';

// Hero id → display info, for the match page roster (which hero, not how well
// they played it — §8 only rules out performance rankings, not who picked
// what). The hero list only changes on a patch, so it is cached for a day
// rather than fetched per render.

export interface HeroInfo {
  name: string;
  /** Null when the icon can't be derived (unknown hero id, fetch failure). */
  icon: string | null;
}

function iconUrl(internalName: string): string {
  // Valve's static CDN, already allowlisted in next.config's image
  // remotePatterns for cdn.cloudflare.steamstatic.com.
  const slug = internalName.replace(/^npc_dota_hero_/, '');
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/${slug}.png`;
}

const cachedHeroMap = unstable_cache(
  async (): Promise<Record<number, HeroInfo>> => {
    const heroes = await fetchHeroes();
    const map: Record<number, HeroInfo> = {};
    if (heroes) {
      for (const h of heroes) {
        map[h.id] = { name: h.localized_name, icon: iconUrl(h.name) };
      }
    }
    return map;
  },
  ['inhouse-hero-map'],
  { revalidate: 86_400 },
);

/** The full id → info map, for resolving a whole roster in one call. */
export async function getHeroMap(): Promise<Record<number, HeroInfo>> {
  return cachedHeroMap();
}

/** A single hero, or a numbered fallback if the map is empty or unknown. */
export async function getHeroInfo(heroId: number | null): Promise<HeroInfo | null> {
  if (!heroId) return null;
  const map = await getHeroMap();
  return map[heroId] ?? { name: `Hero ${heroId}`, icon: null };
}
