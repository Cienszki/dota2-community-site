'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { validateImageFile } from '@/lib/validate-image';
import { ALLOWED_ADMIN_EMAILS } from '@/lib/admin-emails';

async function checkAdminAuth() {
  const supabaseClient = await createServerSupabaseClient();
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    throw new Error('Unauthenticated: No active session found.');
  }

  const isAuthorized = ALLOWED_ADMIN_EMAILS.includes(user.email ?? '');
  if (!isAuthorized) {
    throw new Error('Unauthorized: You do not have administrator permissions.');
  }

  return user;
}

export async function getRankPlayers() {
  try {
    await checkAdminAuth();

    const { data, error } = await supabaseAdmin
      .from('ranking_leaderboard')
      .select('id, steam_id, name, created_at')
      .is('is_official_leaderboard', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const normalized = (data ?? []).map((row) => ({
      id: row.id as string,
      steam_id: row.steam_id as string,
      name: row.name as string,
      created_at: row.created_at as string,
    }));

    return { success: true as const, data: normalized };
  } catch (err: unknown) {
    console.error('Server action — getRankPlayers:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas pobierania graczy z rankingu.',
    };
  }
}

export async function deleteRankPlayer(steamId: string) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin
      .from('ranking_leaderboard')
      .delete()
      .eq('steam_id', steamId);

    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — deleteRankPlayer:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas usuwania gracza z rankingu.',
    };
  }
}

export async function addStreamer(formData: {
  nick: string;
  motto: string;
  stream_url: string;
  position: number;
}) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin
      .from('streamers')
      .insert([{
        nick: formData.nick,
        motto: formData.motto,
        stream_url: formData.stream_url,
        position: formData.position,
      }]);

    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — addStreamer:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas dodawania streamera.',
    };
  }
}

export async function updateStreamer(
  id: string,
  data: { nick: string; motto: string; stream_url: string },
) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin
      .from('streamers')
      .update({
        nick: data.nick,
        motto: data.motto,
        stream_url: data.stream_url,
      })
      .eq('id', id);

    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — updateStreamer:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas aktualizacji streamera.',
    };
  }
}

export async function deleteStreamer(id: string) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin
      .from('streamers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — deleteStreamer:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas usuwania streamera.',
    };
  }
}

export async function getContentPage(slug: string) {
  try {
    await checkAdminAuth();

    const { data, error } = await supabaseAdmin
      .from('news')
      .select('id, title, content, created_at')
      .eq('category', 'ContentPage')
      .eq('title', slug)
      .maybeSingle();

    if (error) throw error;

    return {
      success: true as const,
      data: { id: (data?.id as number) ?? 0, content: (data?.content as string) ?? '' },
    };
  } catch (err: unknown) {
    console.error('Server action — getContentPage:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas pobierania treści strony.',
    };
  }
}

export async function upsertContentPage(slug: string, content: string) {
  try {
    await checkAdminAuth();

    // Check if row exists
    const { data: existing } = await supabaseAdmin
      .from('news')
      .select('id')
      .eq('category', 'ContentPage')
      .eq('title', slug)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from('news')
        .update({ content })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from('news')
        .insert({ title: slug, content, category: 'ContentPage' });
      if (error) throw error;
    }

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — upsertContentPage:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas zapisywania treści strony.',
    };
  }
}

export async function deleteContentPage(slug: string) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin
      .from('news')
      .delete()
      .eq('category', 'ContentPage')
      .eq('title', slug);

    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — deleteContentPage:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas usuwania strony.',
    };
  }
}

export async function uploadNewsImage(formData: FormData) {
  try {
    await checkAdminAuth();

    const file = formData.get('file') as File | null;
    if (!file) throw new Error('No file provided');

    const bucketName = 'news-images';
    const fileExt = file.name.split('.').pop();
    const filePath = `news/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return { success: true as const, publicUrl: publicUrlData.publicUrl };
  } catch (err: unknown) {
    console.error('Server action — uploadNewsImage:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas przesyłania zdjęcia.',
    };
  }
}

export async function updateStreamerPositions(
  updates: { id: string; position: number }[],
) {
  try {
    await checkAdminAuth();

    for (const { id, position } of updates) {
      const { error } = await supabaseAdmin
        .from('streamers')
        .update({ position })
        .eq('id', id);
      if (error) throw error;
    }
    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — updateStreamerPositions:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas aktualizacji pozycji streamerów.',
    };
  }
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

export async function saveTestimonial(
  id: string | null,
  data: {
    name: string;
    avatar_url: string | null;
    headline: string;
    text: string;
    rating: number;
  },
) {
  try {
    await checkAdminAuth();

    if (id) {
      const { error } = await supabaseAdmin.from('testimonials').update(data).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from('testimonials').insert(data);
      if (error) throw error;
    }

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — saveTestimonial:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas zapisywania opinii.',
    };
  }
}

export async function deleteTestimonial(id: string) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin.from('testimonials').delete().eq('id', id);
    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — deleteTestimonial:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas usuwania opinii.',
    };
  }
}

// ---------------------------------------------------------------------------
// Tournaments ("Co jest grane?" on the landing page)
// ---------------------------------------------------------------------------

interface TournamentPayload {
  name: string;
  tag: string;
  description: string;
  href: string;
  image_url: string | null;
  is_visible: boolean;
  sort_order: number;
}

// Admin-only read: the public browser client can only ever see tournaments
// with is_visible = true (RLS), so listing drafts/hidden entries in the
// admin table goes through here instead, using the service role.
export async function getAllTournamentsAdmin() {
  try {
    await checkAdminAuth();

    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true as const, data: data ?? [] };
  } catch (err: unknown) {
    console.error('Server action — getAllTournamentsAdmin:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas pobierania turniejów.',
    };
  }
}

export async function saveTournament(id: string | null, data: TournamentPayload) {
  try {
    await checkAdminAuth();

    if (id) {
      const { error } = await supabaseAdmin.from('tournaments').update(data).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from('tournaments').insert(data);
      if (error) throw error;
    }

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — saveTournament:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas zapisywania turnieju.',
    };
  }
}

export async function deleteTournament(id: string) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin.from('tournaments').delete().eq('id', id);
    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — deleteTournament:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas usuwania turnieju.',
    };
  }
}

export async function setTournamentVisibility(id: string, isVisible: boolean) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin
      .from('tournaments')
      .update({ is_visible: isVisible })
      .eq('id', id);
    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — setTournamentVisibility:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas zmiany widoczności turnieju.',
    };
  }
}

export async function uploadTournamentBanner(formData: FormData) {
  try {
    await checkAdminAuth();

    const file = formData.get('file') as File | null;
    const fileName = formData.get('fileName') as string | null;
    if (!file) throw new Error('Brak pliku.');
    if (!fileName) throw new Error('Brak nazwy pliku.');

    const validationError = validateImageFile(file, 5 * 1024 * 1024);
    if (validationError) throw new Error(validationError);

    const bucketName = 'tournament-banners';
    const filePath = `landing_${fileName}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(filePath, arrayBuffer, { contentType: file.type, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseAdmin.storage.from(bucketName).getPublicUrl(filePath);

    // Fixed path + upsert:true means re-uploading a banner reuses the exact
    // same URL — bust the cache so browsers fetch the new bytes.
    const bustedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    return { success: true as const, url: bustedUrl };
  } catch (err: unknown) {
    console.error('Server action — uploadTournamentBanner:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : (err instanceof Error ? err.message : 'Wystąpił błąd podczas przesyłania banera.'),
    };
  }
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

interface NewsPayload {
  title: string;
  category: string;
  content: string;
  image_url?: string;
}

export async function saveNews(id: number | null, payload: NewsPayload) {
  try {
    await checkAdminAuth();

    if (id) {
      const { error } = await supabaseAdmin.from('news').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from('news').insert([{ ...payload, status: 'draft' }]);
      if (error) throw error;
    }

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — saveNews:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas zapisywania newsa.',
    };
  }
}

export async function deleteNews(id: number) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin.from('news').delete().eq('id', id);
    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — deleteNews:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas usuwania newsa.',
    };
  }
}

export async function publishNews(id: number) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin.from('news').update({ status: 'published' }).eq('id', id);
    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — publishNews:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas publikacji newsa.',
    };
  }
}

// ---------------------------------------------------------------------------
// Global settings (stored as a single `news` row, category "SystemSettings")
// ---------------------------------------------------------------------------

export async function saveGlobalSettings(value: Record<string, unknown>) {
  try {
    await checkAdminAuth();

    const { data: existing, error: checkError } = await supabaseAdmin
      .from('news')
      .select('id')
      .eq('category', 'SystemSettings')
      .eq('title', 'global_settings')
      .maybeSingle();
    if (checkError) throw checkError;

    if (existing) {
      const { error } = await supabaseAdmin
        .from('news')
        .update({ content: JSON.stringify(value) })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from('news').insert([{
        title: 'global_settings',
        category: 'SystemSettings',
        content: JSON.stringify(value),
      }]);
      if (error) throw error;
    }

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — saveGlobalSettings:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas zapisywania ustawień.',
    };
  }
}

// ---------------------------------------------------------------------------
// Basher magazine issues
// ---------------------------------------------------------------------------

interface BasherIssuePayload {
  issue_number: number;
  title: string;
  publish_date: string;
  pages: string[];
  link_url: string | null;
}

// Storage URLs look like
// https://<project>.supabase.co/storage/v1/object/public/basher-magazines/basher_10_1.png?v=169...
// — pull out just the object path (and drop the cache-busting query string)
// so it can be passed to storage.remove().
function extractStoragePath(url: string, bucketName: string): string | null {
  const marker = `/${bucketName}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split('?')[0];
}

export async function uploadBasherPages(formData: FormData) {
  try {
    await checkAdminAuth();

    const issueNumber = formData.get('issueNumber') as string | null;
    if (!issueNumber) throw new Error('Brak numeru wydania.');

    const files = formData.getAll('files') as File[];
    if (files.length === 0) throw new Error('Brak plików do przesłania.');

    const bucketName = 'basher-magazines';
    const urls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      const validationError = validateImageFile(file, 8 * 1024 * 1024);
      if (validationError) throw new Error(validationError);

      const ext = file.name.split('.').pop() || 'png';
      const filePath = `basher_${issueNumber}_${i + 1}.${ext}`;
      const arrayBuffer = await file.arrayBuffer();

      const { error: uploadError } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(filePath, arrayBuffer, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabaseAdmin.storage.from(bucketName).getPublicUrl(filePath);

      // Fixed path + upsert:true means re-uploading a page reuses the exact
      // same URL — bust the cache so browsers fetch the new bytes.
      urls.push(`${publicUrlData.publicUrl}?v=${Date.now()}`);
    }

    return { success: true as const, urls };
  } catch (err: unknown) {
    console.error('Server action — uploadBasherPages:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : (err instanceof Error ? err.message : 'Wystąpił błąd podczas przesyłania stron.'),
    };
  }
}

export async function saveBasherIssue(id: string | null, payload: BasherIssuePayload) {
  try {
    await checkAdminAuth();

    // Duplicate issue-number check (skip when editing the same record)
    if (!id) {
      const { data: existingIssue } = await supabaseAdmin
        .from('basher_issues')
        .select('id')
        .eq('issue_number', payload.issue_number)
        .maybeSingle();

      if (existingIssue) {
        return {
          success: false as const,
          error: 'Magazyn z tym numerem wydania został już dodany!',
        };
      }
    }

    if (id) {
      const { error } = await supabaseAdmin.from('basher_issues').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from('basher_issues').insert([{ ...payload, status: 'draft' }]);
      if (error) throw error;
    }

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — saveBasherIssue:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas zapisywania magazynu.',
    };
  }
}

export async function deleteBasherIssue(id: string) {
  try {
    await checkAdminAuth();

    const { data: issue, error: fetchError } = await supabaseAdmin
      .from('basher_issues')
      .select('pages')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw fetchError;

    const bucketName = 'basher-magazines';
    const paths = ((issue?.pages as string[] | undefined) ?? [])
      .map((url) => extractStoragePath(url, bucketName))
      .filter((p): p is string => !!p);

    if (paths.length > 0) {
      const { error: removeError } = await supabaseAdmin.storage.from(bucketName).remove(paths);
      // Best-effort: an orphaned file is far less bad than being unable to
      // delete the issue at all, so log and continue rather than throw.
      if (removeError) console.error('Nie udało się usunąć plików magazynu ze Storage:', removeError);
    }

    const { error } = await supabaseAdmin.from('basher_issues').delete().eq('id', id);
    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — deleteBasherIssue:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas usuwania magazynu.',
    };
  }
}

export async function publishBasherIssue(id: string) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin.from('basher_issues').update({ status: 'published' }).eq('id', id);
    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — publishBasherIssue:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas publikacji magazynu.',
    };
  }
}

// ---------------------------------------------------------------------------
// Hall of Fame tournaments
// ---------------------------------------------------------------------------
// Previously implemented as /api/admin/hof + /api/admin/hof-banner route
// handlers (already server-side + supabaseAdmin + the same admin email
// check, just structured as Route Handlers rather than Server Actions).
// Moved here for consistency — one place for every admin write.

interface HofTournamentPayload {
  tournament_name: string;
  tournament_date: string;
  tournament_id: string;
  dotabuff_link: string;
  team_name: string;
  players: { name: string; friend_id?: number; is_substitute: boolean }[];
  image_url: string | null;
  team_logo_url: string | null;
}

export async function saveHofTournament(id: string | null, payload: HofTournamentPayload) {
  try {
    await checkAdminAuth();

    if (id) {
      const { error } = await supabaseAdmin.from('hall_of_fame_tournaments').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from('hall_of_fame_tournaments').insert([{ ...payload, status: 'draft' }]);
      if (error) throw error;
    }

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — saveHofTournament:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas zapisywania turnieju.',
    };
  }
}

export async function deleteHofTournament(id: string) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin.from('hall_of_fame_tournaments').delete().eq('id', id);
    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — deleteHofTournament:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas usuwania turnieju.',
    };
  }
}

export async function publishHofTournament(id: string) {
  try {
    await checkAdminAuth();

    const { error } = await supabaseAdmin
      .from('hall_of_fame_tournaments')
      .update({ status: 'published' })
      .eq('id', id);
    if (error) throw error;

    return { success: true as const };
  } catch (err: unknown) {
    console.error('Server action — publishHofTournament:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : 'Wystąpił błąd podczas publikacji turnieju.',
    };
  }
}

export async function uploadHofBanner(formData: FormData) {
  try {
    await checkAdminAuth();

    const file = formData.get('file') as File | null;
    const fileName = formData.get('fileName') as string | null;
    if (!file) throw new Error('Brak pliku.');
    if (!fileName) throw new Error('Brak nazwy pliku.');

    const validationError = validateImageFile(file, 5 * 1024 * 1024);
    if (validationError) throw new Error(validationError);

    const bucketName = 'tournament-banners';
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(fileName, arrayBuffer, { contentType: file.type, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseAdmin.storage.from(bucketName).getPublicUrl(fileName);

    // Same fixed-path + upsert:true setup as tournament banners — re-uploads
    // reuse the same public URL, so bust the cache on every upload.
    const bustedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    return { success: true as const, url: bustedUrl };
  } catch (err: unknown) {
    console.error('Server action — uploadHofBanner:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : (err instanceof Error ? err.message : 'Wystąpił błąd podczas przesyłania banera.'),
    };
  }
}

export async function uploadHofTeamLogo(formData: FormData) {
  try {
    await checkAdminAuth();

    const file = formData.get('file') as File | null;
    const fileName = formData.get('fileName') as string | null;
    if (!file) throw new Error('Brak pliku.');
    if (!fileName) throw new Error('Brak nazwy pliku.');

    const validationError = validateImageFile(file, 3 * 1024 * 1024);
    if (validationError) throw new Error(validationError);

    // Reuses the tournament-banners bucket with a distinct `logo_` prefix
    // rather than a separate bucket, to avoid another dashboard setup step.
    const bucketName = 'tournament-banners';
    const filePath = `logo_${fileName}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(filePath, arrayBuffer, { contentType: file.type, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseAdmin.storage.from(bucketName).getPublicUrl(filePath);
    const bustedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    return { success: true as const, url: bustedUrl };
  } catch (err: unknown) {
    console.error('Server action — uploadHofTeamLogo:', err);
    const isAuthError = err instanceof Error && (err.message.startsWith('Unauthenticated') || err.message.startsWith('Unauthorized'));
    return {
      success: false as const,
      error: isAuthError ? (err as Error).message : (err instanceof Error ? err.message : 'Wystąpił błąd podczas przesyłania logo drużyny.'),
    };
  }
}
