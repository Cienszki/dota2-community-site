'use server';

import { supabase } from '@/lib/supabase';

export async function getWardClicks(): Promise<number> {
  const { data } = await supabase
    .from('global_counters')
    .select('value')
    .eq('id', 'ward_clicks')
    .maybeSingle();

  return data?.value ?? 0;
}
