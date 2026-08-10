'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireWebsiteAdmin, isAuthError } from '@/lib/inhouse/admin-guard';

export interface FaqRow {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

export interface FaqFormState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
}

function revalidateFaq(): void {
  revalidatePath('/inhouse');
  revalidatePath('/admin/inhouse/faq');
}

export async function listFaqsAdmin(): Promise<FaqRow[]> {
  const { data, error } = await supabaseAdmin
    .from('inhouse_faq')
    .select('id, question, answer, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addFaq(_prev: FaqFormState, formData: FormData): Promise<FaqFormState> {
  try {
    await requireWebsiteAdmin();

    const question = String(formData.get('question') ?? '').trim();
    const answer = String(formData.get('answer') ?? '').trim();
    if (!question) return { status: 'error', message: 'Podaj pytanie.' };
    if (!answer) return { status: 'error', message: 'Podaj odpowiedź.' };

    // New questions append at the end — no manual reordering UI yet, see
    // migration 023's header comment.
    const { data: last } = await supabaseAdmin
      .from('inhouse_faq')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (last?.sort_order ?? -1) + 1;

    const { error } = await supabaseAdmin
      .from('inhouse_faq')
      .insert({ question, answer, sort_order: nextOrder });
    if (error) throw error;

    revalidateFaq();
    return { status: 'ok', message: 'Dodano pytanie.' };
  } catch (err) {
    console.error('addFaq', err);
    return { status: 'error', message: isAuthError(err) ? 'Brak uprawnień.' : 'Nie udało się dodać pytania.' };
  }
}

export async function updateFaq(_prev: FaqFormState, formData: FormData): Promise<FaqFormState> {
  try {
    await requireWebsiteAdmin();

    const id = String(formData.get('id') ?? '');
    const question = String(formData.get('question') ?? '').trim();
    const answer = String(formData.get('answer') ?? '').trim();
    if (!id) return { status: 'error', message: 'Brak identyfikatora pytania.' };
    if (!question) return { status: 'error', message: 'Podaj pytanie.' };
    if (!answer) return { status: 'error', message: 'Podaj odpowiedź.' };

    const { error } = await supabaseAdmin
      .from('inhouse_faq')
      .update({ question, answer, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    revalidateFaq();
    return { status: 'ok', message: 'Zapisano zmiany.' };
  } catch (err) {
    console.error('updateFaq', err);
    return { status: 'error', message: isAuthError(err) ? 'Brak uprawnień.' : 'Nie udało się zapisać zmian.' };
  }
}

export async function deleteFaq(id: string): Promise<{ ok: boolean }> {
  try {
    await requireWebsiteAdmin();
    const { error } = await supabaseAdmin.from('inhouse_faq').delete().eq('id', id);
    if (error) throw error;
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    console.error('deleteFaq', err);
    return { ok: false };
  }
}
