import 'server-only';
import { supabase } from '@/lib/supabase';

// FAQ entries for /inhouse (src/components/inhouse/FaqSection.tsx). Stored in
// Supabase — this is admin-authored copy, not bot/game state, so it follows
// the news/tournaments/streamers pattern rather than the Firestore-backed
// inhouse domain. Public read only; writes go through
// src/app/admin/inhouse/faq/actions.ts using supabaseAdmin.

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export async function getFaqs(): Promise<FaqEntry[]> {
  try {
    const { data, error } = await supabase
      .from('inhouse_faq')
      .select('id, question, answer')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.error('inhouse faq load failed', err);
    return [];
  }
}
