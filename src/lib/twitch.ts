let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

export async function getTwitchAppToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Twitch client credentials not configured. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in environment variables.'
    );
  }

  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'client_credentials');

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Twitch token request failed (${res.status}): ${body}`
    );
  }

  const data = await res.json();
  cachedToken = data.access_token as string;
  // Subtract a small safety margin (60s) so we don't use a token right at expiry
  tokenExpiresAt = Date.now() + (data.expires_in as number) * 1000 - 60_000;

  return cachedToken;
}

export async function getLiveChannels(logins: string[]): Promise<Set<string>> {
  if (logins.length === 0) {
    return new Set();
  }

  try {
    const token = await getTwitchAppToken();
    const clientId = process.env.TWITCH_CLIENT_ID!;

    const liveSet = new Set<string>();
    const chunkSize = 100;

    for (let i = 0; i < logins.length; i += chunkSize) {
      const chunk = logins.slice(i, i + chunkSize);
      const params = new URLSearchParams();
      for (const login of chunk) {
        params.append('user_login', login);
      }

      const res = await fetch(
        `https://api.twitch.tv/helix/streams?${params.toString()}`,
        {
          headers: {
            'Client-Id': clientId,
            Authorization: `Bearer ${token}`,
          },
          // Next.js doesn't cache fetch() by default — without this, every
          // single page load hit the Helix API fresh, risking Twitch's
          // per-app rate limit under real traffic. A short window is enough
          // since "is this streamer live" doesn't need to be second-fresh.
          next: { revalidate: 60 },
        }
      );

      if (!res.ok) {
        console.error(`Twitch Helix API error (${res.status}): ${await res.text()}`);
        return new Set();
      }

      const data = await res.json();
      for (const stream of data.data ?? []) {
        if (stream.user_login) {
          liveSet.add((stream.user_login as string).toLowerCase());
        }
      }
    }

    return liveSet;
  } catch (err) {
    console.error('getLiveChannels failed:', err);
    return new Set();
  }
}
