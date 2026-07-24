-- =============================================================================
-- Migration 012: Server-side rate limiting for ward clicks
--   - Create ward_click_rate_limits table (IP + timestamp tracking)
--   - Create try_increment_ward_clicks() SECURITY DEFINER function
--   - Revoke public access to the old unthrottled increment function
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rate limit tracking table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.ward_click_rate_limits (
  id bigint generated always as identity primary key,
  ip_address text not null,
  clicked_at timestamptz not null default now()
);

create index if not exists idx_ward_click_ip_time
  on public.ward_click_rate_limits (ip_address, clicked_at);

alter table public.ward_click_rate_limits enable row level security;

-- No public RLS policies — accessible only via service_role or SECURITY DEFINER


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rate-limited increment function
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function try_increment_ward_clicks(
  p_ip            text,
  p_max_clicks    int default 500,
  p_window_seconds int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count   int;
  current_value  bigint;
begin
  -- Count existing clicks from this IP within the sliding window
  select count(*) into recent_count
  from ward_click_rate_limits
  where ip_address = p_ip
    and clicked_at > now() - (interval '1 second' * p_window_seconds);

  -- Rate-limited — return current counter value without incrementing
  if recent_count >= p_max_clicks then
    select value into current_value
    from global_counters
    where id = 'ward_clicks';

    return jsonb_build_object('success', false, 'value', current_value);
  end if;

  -- Record this click
  insert into ward_click_rate_limits (ip_address) values (p_ip);

  -- Atomically increment the global counter
  update global_counters
  set value = value + 1
  where id = 'ward_clicks'
  returning value into current_value;

  -- Probabilistic cleanup: ~1 % chance per call to purge rows older than 1 h
  if random() < 0.01 then
    delete from ward_click_rate_limits
    where clicked_at < now() - interval '1 hour';
  end if;

  return jsonb_build_object('success', true, 'value', current_value);
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Restrict function execution to service_role only
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function try_increment_ward_clicks(text, int, int)
  from public, anon, authenticated;

grant execute on function try_increment_ward_clicks(text, int, int)
  to service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Revoke public access to the old unthrottled increment_ward_clicks function
--    so bots cannot bypass rate limiting by calling it directly.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function increment_ward_clicks()
  from anon, authenticated;
