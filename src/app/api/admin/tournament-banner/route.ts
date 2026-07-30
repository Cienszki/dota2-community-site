import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const ALLOWED_ADMIN_EMAILS = ['voocash.s@gmail.com', 'wilq.wdz@gmail.com'];

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !ALLOWED_ADMIN_EMAILS.includes(user.email ?? '')) {
    return false;
  }
  return true;
}

export async function POST(request: Request) {
  try {
    const isAdmin = await verifyAdmin();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fileName = formData.get('fileName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Brak pliku' }, { status: 400 });
    }
    if (!fileName) {
      return NextResponse.json({ error: 'Brak nazwy pliku' }, { status: 400 });
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from('tournament-banners')
      .upload(`landing_${fileName}`, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('tournament-banners')
      .getPublicUrl(`landing_${fileName}`);

    // The storage path is stable (same tournament -> same filename, upsert:
    // true), so re-uploading a banner keeps the exact same public URL. That
    // makes browsers/CDN keep serving the previously cached bytes at that
    // URL — appending a cache-busting query param forces every re-upload to
    // be treated as a new resource.
    const bustedUrl = publicUrlData?.publicUrl
      ? `${publicUrlData.publicUrl}?v=${Date.now()}`
      : null;

    return NextResponse.json(
      { url: bustedUrl },
      { status: 200 },
    );
  } catch (err: unknown) {
    console.error('Błąd przesyłania banera turnieju:', err);
    return NextResponse.json(
      { error: 'Wystąpił błąd podczas przesyłania pliku.' },
      { status: 500 },
    );
  }
}
