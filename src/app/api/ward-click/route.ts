import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';

    const { data, error } = await supabaseAdmin.rpc(
      'try_increment_ward_clicks',
      { p_ip: ip, p_max_clicks: 500, p_window_seconds: 60 },
    );

    if (error) throw error;

    const result = data as unknown as { success: boolean; value: number };

    if (result.success) {
      return NextResponse.json({ success: true, value: result.value }, { status: 200 });
    }

    return NextResponse.json(
      { error: 'Zwolnij trochę!', value: result.value },
      { status: 429 },
    );
  } catch (err) {
    console.error('ward-click POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
