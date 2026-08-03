import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireEnv } from '@/lib/env';

const escapeHtml = (str: string) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { data: allowed, error: rateLimitError } = await supabaseAdmin.rpc('try_rate_limit', {
      p_bucket: 'contact_form',
      p_ip: ip,
      p_max_events: 3,
      p_window_seconds: 3600,
    });
    if (rateLimitError) {
      console.error('Rate limit check failed:', rateLimitError.message);
    } else if (!allowed) {
      return NextResponse.json(
        { error: 'Zbyt wiele wiadomości. Spróbuj ponownie za godzinę.' },
        { status: 429 },
      );
    }

    const { email, message } = await request.json();

    if (!email || !message) {
      return NextResponse.json({ error: 'Brakujące pola' }, { status: 400 });
    }

    const smtpUser = requireEnv('SMTP_USER', process.env.SMTP_USER);

    const transporter = nodemailer.createTransport({
      host: requireEnv('SMTP_HOST', process.env.SMTP_HOST),
      port: Number(requireEnv('SMTP_PORT', process.env.SMTP_PORT)),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: smtpUser,
        pass: requireEnv('SMTP_PASS', process.env.SMTP_PASS),
      },
    });

    await transporter.sendMail({
      from: `Formularz Kontaktowy <${smtpUser}>`,
      to: 'polishdota2inhouse@gmail.com',
      replyTo: email,
      subject: `[dota2inhouse.pl] Nowa wiadomość od ${email}`,
      text: message,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #dc2626; border-b: 1px solid #eee; padding-bottom: 10px;">
            Nowa wiadomość ze strony dota2inhouse.pl
          </h2>
          <p><strong>Od:</strong> ${escapeHtml(email)}</p>
          <p><strong>Treść:</strong></p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; white-space: pre-wrap; margin-top: 10px;">
            ${escapeHtml(message)}
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Błąd SMTP:', error);
    return NextResponse.json({ error: 'Błąd serwera podczas wysyłki' }, { status: 500 });
  }
}