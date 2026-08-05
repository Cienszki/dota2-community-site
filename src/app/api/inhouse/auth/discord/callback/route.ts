import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { OAUTH_STATE_COOKIE, requestOrigin } from '@/lib/inhouse/oauth';
import {
  DISCORD_COOKIE_MAXAGE,
  DISCORD_COOKIE_NAME,
  signDiscordSession,
} from '@/lib/inhouse/session';
import { toSteam32 } from '@/lib/inhouse/display';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore, backfillOnLink } from '@/lib/inhouse/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Step two of the Discord link. Exchange the code, establish the Discord
// session, and — the high-value part (§3.6) — if a Steam account comes back
// with them (via the `connections` scope), link it and backfill their entire
// history immediately: "we found your 34 previous games".

interface DiscordConnection {
  type: string;
  id: string;
  verified?: boolean;
}

export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  const cookieStore = await cookies();
  const raw = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  let expectedState: string | null = null;
  let next = '/inhouse/link';
  if (raw) {
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      expectedState = typeof parsed.state === 'string' ? parsed.state : null;
      if (typeof parsed.next === 'string' && parsed.next.startsWith('/')) next = parsed.next;
    } catch {
      /* fall through to state failure */
    }
  }

  const redirectWith = (params: URLSearchParams, session?: string) => {
    const res = NextResponse.redirect(`${origin}${next}?${params.toString()}`);
    res.cookies.delete(OAUTH_STATE_COOKIE);
    if (session) {
      res.cookies.set(DISCORD_COOKIE_NAME, session, {
        httpOnly: true,
        secure: origin.startsWith('https'),
        sameSite: 'lax',
        path: '/',
        maxAge: DISCORD_COOKIE_MAXAGE,
      });
    }
    return res;
  };

  const fail = (reason: string) => redirectWith(new URLSearchParams({ error: reason }));

  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return fail('state');
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail('unconfigured');

  const redirectUri = `${origin}/api/inhouse/auth/discord/callback`;

  // ── Token exchange ──
  let accessToken: string;
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!tokenRes.ok) return fail('token');
    const tok = (await tokenRes.json()) as { access_token?: string };
    if (!tok.access_token) return fail('token');
    accessToken = tok.access_token;
  } catch {
    return fail('token');
  }

  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // ── Identity ──
  let discordId: string;
  let discordName: string | null;
  try {
    const meRes = await fetch('https://discord.com/api/v10/users/@me', { headers: authHeader });
    if (!meRes.ok) return fail('me');
    const me = (await meRes.json()) as { id: string; username?: string; global_name?: string };
    discordId = me.id;
    discordName = me.global_name || me.username || null;
  } catch {
    return fail('me');
  }

  // ── Prefer the per-server nickname (§3.1a), best-effort ──
  const guildId = process.env.DISCORD_GUILD_ID;
  if (guildId) {
    try {
      const memRes = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
        headers: authHeader,
      });
      if (memRes.ok) {
        const mem = (await memRes.json()) as {
          nick?: string | null;
          user?: { global_name?: string; username?: string };
        };
        discordName = mem.nick || mem.user?.global_name || mem.user?.username || discordName;
      }
    } catch {
      /* keep global name */
    }
  }

  // ── The free Steam link, best-effort ──
  let steamId32: string | null = null;
  try {
    const conRes = await fetch('https://discord.com/api/v10/users/@me/connections', {
      headers: authHeader,
    });
    if (conRes.ok) {
      const cons = (await conRes.json()) as DiscordConnection[];
      const steam = Array.isArray(cons) ? cons.find((c) => c.type === 'steam' && c.id) : undefined;
      if (steam) {
        try {
          steamId32 = toSteam32(steam.id);
        } catch {
          steamId32 = null;
        }
      }
    }
  } catch {
    /* connections are a bonus, never the funnel */
  }

  const session = signDiscordSession({ discordId, discordName });
  const result = new URLSearchParams();

  if (!isInhouseConfigured()) {
    result.set('error', 'unconfigured');
    return redirectWith(result, session);
  }

  try {
    const store = getInhouseStore();
    // Ensure the profile exists and the name is current even without a Steam link.
    await store.upsertPlayer(discordId, { discordName });

    if (steamId32) {
      const link = await store.linkSteamAccount(discordId, steamId32, 'discord_connection', discordName);
      if (!link.ok && link.reason === 'claimed_by_other') {
        result.set('error', 'claimed');
      } else if (link.ok && link.alreadyLinked) {
        result.set('linked', 'already');
      } else if (link.ok) {
        const bf = await backfillOnLink(store, discordId, steamId32);
        result.set('linked', '1');
        result.set('games', String(bf.gamesFound));
      }
    } else {
      result.set('connection', 'none');
    }
  } catch {
    result.set('error', 'store');
  }

  return redirectWith(result, session);
}
