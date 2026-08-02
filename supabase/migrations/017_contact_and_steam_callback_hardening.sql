-- =============================================================================
-- Migration 017: Rate limiting for /api/contact + /api/auth/steam/callback,
-- and OpenID response_nonce replay protection for the Steam callback
-- =============================================================================
-- Follows the same pattern already established in migration 012 for ward
-- clicks (per-IP sliding-window counter table + SECURITY DEFINER function,
-- restricted to service_role) instead of introducing an external dependency
-- like Upstash Redis.
--
-- Generalized into a single `bucket` column so both routes share one table/
-- function rather than duplicating the ward-click structure per feature.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Generic per-IP sliding-window rate limit table + function
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  ip_address text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limit_events_bucket_ip_time
  on public.rate_limit_events (bucket, ip_address, created_at);

alter table public.rate_limit_events enable row level security;
-- No public RLS policies — accessible only via service_role or SECURITY DEFINER.

create or replace function try_rate_limit(
  p_bucket         text,
  p_ip             text,
  p_max_events     int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from rate_limit_events
  where bucket = p_bucket
    and ip_address = p_ip
    and created_at > now() - (interval '1 second' * p_window_seconds);

  if recent_count >= p_max_events then
    return false;
  end if;

  insert into rate_limit_events (bucket, ip_address) values (p_bucket, p_ip);

  -- Probabilistic cleanup: ~1% chance per call to purge rows older than 1 day
  if random() < 0.01 then
    delete from rate_limit_events where created_at < now() - interval '1 day';
  end if;

  return true;
end;
$$;

revoke execute on function try_rate_limit(text, text, int, int)
  from public, anon, authenticated;

grant execute on function try_rate_limit(text, text, int, int)
  to service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Steam OpenID response_nonce replay protection
-- ─────────────────────────────────────────────────────────────────────────────
-- check_authentication only re-verifies the signature over whatever params
-- are handed to it — it does NOT track whether a given signed response has
-- already been consumed. Without this, a single captured callback URL
-- (trivial to obtain from your own browser during a normal login) could be
-- replayed indefinitely, re-triggering the DB upsert, an OpenDota API call,
-- and — for top-5000 players — a GitHub Actions dispatch, every single time.
--
-- Each Steam-issued openid.response_nonce is unique per login response, so
-- inserting it into a table with a primary key gives us an atomic
-- "has this exact response been used before" check for free.

create table if not exists public.steam_openid_nonces (
  nonce      text primary key,
  created_at timestamptz not null default now()
);

alter table public.steam_openid_nonces enable row level security;
-- No public RLS policies — only ever touched via supabaseAdmin (service_role).
