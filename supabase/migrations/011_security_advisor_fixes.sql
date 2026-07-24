-- =============================================================================
-- Migration 011: Resolve Security Advisor warnings
--   - Fix permissive RLS write policies on all tables
--   - Add SET search_path = public to SECURITY DEFINER functions
--   - Restrict EXECUTE on increment_gold to authenticated users only
-- =============================================================================
-- Run this script in the Supabase SQL Editor (Dashboard → SQL Editor).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RLS POLICY ALWAYS TRUE — Drop permissive write policies & recreate
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop any leftover anon-write policies (safeguard — most already handled
-- in migration 009, but re-dropping with IF EXISTS is idempotent).

-- basher_issues
drop policy if exists "Anon Insert" on basher_issues;
drop policy if exists "Anon Update" on basher_issues;
drop policy if exists "Anon Delete" on basher_issues;

-- hall_of_fame_tournaments
drop policy if exists "Anon Insert" on hall_of_fame_tournaments;
drop policy if exists "Anon Update" on hall_of_fame_tournaments;
drop policy if exists "Anon Delete" on hall_of_fame_tournaments;

-- news
drop policy if exists "Anon Insert" on news;
drop policy if exists "Anon Update" on news;
drop policy if exists "Anon Delete" on news;

-- testimonials
drop policy if exists "Anon Insert" on testimonials;
drop policy if exists "Anon Update" on testimonials;
drop policy if exists "Anon Delete" on testimonials;

-- ranking_leaderboard — the "Service role full access" policy uses USING(true)
-- without a TO role clause, meaning it applies to ALL roles (including anon).
-- Drop and recreate with explicit TO service_role.
drop policy if exists "Service role full access for ranking_leaderboard" on ranking_leaderboard;

create policy "Service role full access for ranking_leaderboard"
  on ranking_leaderboard
  for all
  to service_role
  using (true)
  with check (true);

-- All tables above already have public SELECT policies and admin email-based
-- write policies from migration 009. Nothing more to recreate here.


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FUNCTION SEARCH PATH MUTABLE — Add SET search_path = public
-- ─────────────────────────────────────────────────────────────────────────────
-- These SECURITY DEFINER functions currently inherit the caller's search_path,
-- which can be hijacked by creating malicious objects in untrusted schemas.
--
-- The DO block below queries pg_proc to handle any argument signature without
-- needing to hardcode parameter lists.

do $$
declare
  rec record;
begin
  for rec in
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname in (
        'increment_gold',
        'reset_user_gold',
        'reset_all_gold',
        'try_acquire_lock',
        'try_deduct_gold'
      )
  loop
    execute format(
      'alter function %I(%s) set search_path = public',
      rec.proname,
      rec.args
    );
    raise notice 'Set search_path = public on function %(%)', rec.proname, rec.args;
  end loop;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SECURITY DEFINER — Restrict EXECUTE on increment_gold to authenticated
-- ─────────────────────────────────────────────────────────────────────────────
-- Currently any role (including anonymous) can call this function.
-- Revoke from PUBLIC and grant only to authenticated users.

do $$
declare
  rec record;
begin
  for rec in
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'increment_gold'
  loop
    execute format(
      'revoke execute on function %I(%s) from public',
      rec.proname,
      rec.args
    );
    execute format(
      'grant execute on function %I(%s) to authenticated',
      rec.proname,
      rec.args
    );
    raise notice 'Restricted EXECUTE on function %(%) to authenticated only', rec.proname, rec.args;
  end loop;
end;
$$;
