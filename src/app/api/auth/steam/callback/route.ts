import { after, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sign } from '@/lib/session';

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const STEAM_ID_PREFIX = 'https://steamcommunity.com/openid/id/';
const STEAM_ID64_OFFSET = BigInt('76561197960265728');

// Same 50-match / 14-day window as scripts/sync-player-stats.mjs (the daily
// cron that refreshes everyone else) — duplicated here rather than imported
// since that script is intentionally standalone (runs outside the Next.js
// app via GitHub Actions). Keep the two in sync if this logic ever changes.
const OPENDOTA_MATCHES_LIMIT = 50;
const FORM_WINDOW_DAYS = 14;

interface OpenDotaProfileResponse {
  profile?: { personaname?: string; avatarfull?: string };
  leaderboard_rank?: number;
  mmr_estimate?: { estimate?: number };
  rank_tier?: number;
}

interface OpenDotaMatch {
  player_slot: number;
  radiant_win: boolean;
  start_time: number;
}

// player_slot 0-4 = Radiant, 128-132 = Dire (OpenDota/Valve match schema).
function isWin(match: OpenDotaMatch): boolean {
  const isRadiant = match.player_slot < 128;
  return isRadiant ? match.radiant_win : !match.radiant_win;
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const claimedId = url.searchParams.get('openid.claimed_id');
  const responseNonce = url.searchParams.get('openid.response_nonce');

  if (!claimedId) {
    return NextResponse.json({ error: 'Brak openid.claimed_id w żądaniu.' }, { status: 400 });
  }

  // --- Rate limit (per IP) — cheap check before spending a round-trip to Steam ---
  const ip = getClientIp(request);
  const { data: allowed, error: rateLimitError } = await supabaseAdmin.rpc('try_rate_limit', {
    p_bucket: 'steam_callback',
    p_ip: ip,
    p_max_events: 10,
    p_window_seconds: 60,
  });
  if (rateLimitError) {
    console.error('Rate limit check failed:', rateLimitError.message);
  } else if (!allowed) {
    return NextResponse.json(
      { error: 'Zbyt wiele prób logowania. Spróbuj ponownie za chwilę.' },
      { status: 429 },
    );
  }

  // --- OpenID 2.0 verification ---
  const verifyParams = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (key.startsWith('openid.')) {
      verifyParams.set(key, value);
    }
  }
  verifyParams.set('openid.mode', 'check_authentication');

  let verifyResponse: Response;
  try {
    verifyResponse = await fetch(STEAM_OPENID_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams.toString(),
    });
  } catch {
    return NextResponse.json({ error: 'Nie udało się zweryfikować odpowiedzi Steam.' }, { status: 502 });
  }

  const verifyText = await verifyResponse.text();
  const isValid = verifyText.split('\n').some(
    (line) => line.trim().toLowerCase() === 'is_valid:true'
  );

  if (!isValid) {
    return NextResponse.json({ error: 'Weryfikacja OpenID nie powiodła się.' }, { status: 403 });
  }

  // --- Replay protection ---
  // check_authentication only re-verifies the signature; it doesn't track
  // whether this exact signed response was already consumed. Without this,
  // a single captured callback URL could be replayed indefinitely.
  if (!responseNonce) {
    return NextResponse.json({ error: 'Brak openid.response_nonce w odpowiedzi.' }, { status: 400 });
  }

  const { error: nonceError } = await supabaseAdmin
    .from('steam_openid_nonces')
    .insert({ nonce: responseNonce });

  if (nonceError) {
    if (nonceError.code === '23505') {
      // Postgres unique_violation => this exact Steam response was already used once.
      console.warn('Steam OpenID nonce replay rejected:', nonceError.message);
      return NextResponse.json(
        { error: 'Ta odpowiedź logowania Steam została już wykorzystana.' },
        { status: 403 },
      );
    }
    // Any other error (e.g. migration 017 not applied yet, transient DB issue)
    // shouldn't lock every legitimate login out — log it and continue.
    console.error('Steam OpenID nonce check failed unexpectedly:', nonceError);
  }

  after(async () => {
    try {
      await supabaseAdmin
        .from('steam_openid_nonces')
        .delete()
        .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    } catch (e) {
      console.warn('Nonce cleanup failed:', e);
    }
  });

  // --- Extract & validate Steam ID ---
  const steamId64 = claimedId.replace(STEAM_ID_PREFIX, '');
  if (!/^\d+$/.test(steamId64)) {
    return NextResponse.json({ error: 'Nieprawidłowy format identyfikatora Steam.' }, { status: 400 });
  }

  let steamId32: string;
  try {
    steamId32 = (BigInt(steamId64) - STEAM_ID64_OFFSET).toString();
  } catch (e) {
    console.error('Błąd konwersji Steam ID:', e);
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator Steam.' }, { status: 400 });
  }

  // --- Fetch OpenDota Data ---
  // Profile + matches fetched immediately so a newly-linked player shows real
  // winrate/forma right away on /ranking, instead of showing "—" until the
  // next daily sync-player-stats cron run.
  let openDotaName = `Gracz #${steamId32}`;
  let openDotaAvatar = 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
  let openDotaRank: number | null = null;
  let mmr: number | null = null;
  let rankTier: number | null = null;
  let winRate: number | null = null;
  let form: number | null = null;
  let hasPublicMatches = true;

  // Fetched independently (allSettled, not Promise.all) so a failure on one
  // request — a transient OpenDota timeout, a rate-limit blip — can't wipe
  // out data the other request already fetched successfully. A shared
  // try/catch around both would mean a matches-fetch error also discards an
  // already-parsed profile, leaving even the name/avatar at the fallback.
  //
  // Both also get an explicit timeout: plain fetch() has no default one, so
  // an OpenDota outage (e.g. a Cloudflare 522) would otherwise leave the
  // whole login hanging for however long the underlying TCP connection takes
  // to give up — 20+ seconds observed in practice. Failing fast here means
  // the player still gets logged in promptly, just without live stats until
  // the next retry/cron sync.
  const OPENDOTA_TIMEOUT_MS = 5000;
  const [profileResult, matchesResult] = await Promise.allSettled([
    fetch(`https://api.opendota.com/api/players/${steamId32}`, {
      signal: AbortSignal.timeout(OPENDOTA_TIMEOUT_MS),
    }).then((r) =>
      r.ok ? (r.json() as Promise<OpenDotaProfileResponse>) : Promise.reject(new Error(`HTTP ${r.status}`)),
    ),
    fetch(`https://api.opendota.com/api/players/${steamId32}/matches?limit=${OPENDOTA_MATCHES_LIMIT}`, {
      signal: AbortSignal.timeout(OPENDOTA_TIMEOUT_MS),
    }).then((r) =>
      r.ok ? (r.json() as Promise<OpenDotaMatch[]>) : Promise.reject(new Error(`HTTP ${r.status}`)),
    ),
  ]);

  if (profileResult.status === 'fulfilled') {
    const profile = profileResult.value;
    openDotaName = profile.profile?.personaname || openDotaName;
    openDotaAvatar = profile.profile?.avatarfull || openDotaAvatar;
    openDotaRank = profile.leaderboard_rank || null;
    mmr = profile.mmr_estimate?.estimate ?? null;
    rankTier = profile.rank_tier ?? null;
  } else {
    console.warn('OpenDota profile fetch failed:', profileResult.reason);
  }

  if (matchesResult.status === 'fulfilled') {
    const matches = matchesResult.value;
    hasPublicMatches = Array.isArray(matches) && matches.length > 0;

    if (hasPublicMatches) {
      const wins = matches.filter(isWin).length;
      winRate = Math.round((wins / matches.length) * 1000) / 10; // e.g. 68.2

      const cutoffSeconds = Date.now() / 1000 - FORM_WINDOW_DAYS * 24 * 60 * 60;
      const recentMatches = matches.filter((m) => m.start_time >= cutoffSeconds);
      const recentWins = recentMatches.filter(isWin).length;
      form = recentWins - (recentMatches.length - recentWins);
    }
  } else {
    console.warn('OpenDota matches fetch failed:', matchesResult.reason);
  }

  // --- Upsert Logic ---
  // Próbujemy znaleźć pasujące miejsce w rankingu lub stworzyć nowy rekord
  const { error: upsertError } = await supabaseAdmin
    .from('ranking_leaderboard')
    .upsert(
      {
        name: openDotaName,
        steam_id: steamId32,
        avatar: openDotaAvatar,
        leaderboard_rank: openDotaRank,
        mmr,
        rank_tier: rankTier,
        win_rate: winRate,
        form,
        has_public_matches: hasPublicMatches,
        is_registered: true,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'steam_id' }
    );

  if (upsertError) {
    console.error('Błąd upsertu do ranking_leaderboard:', upsertError.message);
    return NextResponse.json({ error: 'Nie udało się zapisać gracza w bazie danych.' }, { status: 500 });
  }

  // --- Trigger scrapera GitHub dla graczy z top 5000 (nieblokujące) ---
  if (openDotaRank !== null) {
    after(async () => {
      const token = process.env.GITHUB_ACCESS_TOKEN;
      if (!token) {
        console.warn('GITHUB_ACCESS_TOKEN nie jest ustawiony – pomijam dispatch do scrapera.');
        return;
      }
      try {
        const ghRes = await fetch('https://api.github.com/repos/woocash88/dota2-pl-leaderboard/dispatches', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ event_type: 'trigger-scraper' }),
        });
        if (!ghRes.ok) {
          console.error('GitHub dispatch nie powiódł się:', ghRes.status, await ghRes.text());
        }
      } catch (e) {
        console.error('Błąd dispatchu do GitHub:', e);
      }
    });
  }

  // --- Set session & redirect ---
  const sessionToken = sign(steamId32);
  const host = request.headers.get('host');
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  const response = NextResponse.redirect(`${protocol}://${host}/ranking`);

  response.cookies.set('pdl_session', sessionToken, {
    httpOnly: true,
    secure: protocol === 'https',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
