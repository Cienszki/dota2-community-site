import { cache } from 'react';
import { supabase } from './supabase';

export interface GlobalSettings {
  font_family?: string;
  partner_link?: string;
  twitch_link?: string;
  youtube_link?: string;
  instagram_link?: string;
  discord_link?: string;
}

// Wrapped in React's per-request `cache()` so the handful of call sites that
// need this same single settings row (root layout for the font, Footer for
// social links, the landing page for the partner link) share one underlying
// Supabase request per render instead of each firing its own query.
export const getGlobalSettings = cache(async (): Promise<GlobalSettings> => {
  try {
    const { data, error } = await supabase
      .from('news')
      .select('content')
      .eq('category', 'SystemSettings')
      .eq('title', 'global_settings')
      .maybeSingle();

    if (error || !data?.content) return {};
    return JSON.parse(data.content) as GlobalSettings;
  } catch {
    return {};
  }
});
