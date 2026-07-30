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
      .upload(fileName, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('tournament-banners')
      .getPublicUrl(fileName);

    // Same fixed-path + upsert:true setup as tournament-banner — re-uploads
    // reuse the same public URL, so a cache-busting query param is needed to
    // stop browsers/CDN from serving the previously cached image bytes.
    const bustedUrl = publicUrlData?.publicUrl
      ? `${publicUrlData.publicUrl}?v=${Date.now()}`
      : null;

    return NextResponse.json(
      { url: bustedUrl },
      { status: 200 },
    );
  } catch (err: unknown) {
    console.error('Błąd Hof banner upload:', err);
    return NextResponse.json(
      { error: 'Wystąpił błąd podczas przesyłania pliku.' },
      { status: 500 },
    );
  }
}
