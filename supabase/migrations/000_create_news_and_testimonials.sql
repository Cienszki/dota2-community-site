-- =============================================================================
-- Migration 000: Create `news` and `testimonials` — retroactively documented
-- =============================================================================
-- Both tables were originally created by hand in the Supabase dashboard and
-- were never captured in a migration file. That means a fresh
-- staging/production Supabase project can't be rebuilt from this migrations
-- folder alone — 009_secure_rls_policies.sql already assumes both tables
-- exist (it enables RLS and adds policies on them) and would fail on a
-- brand-new database without this file running first.
--
-- Numbered 000 (not appended at the end) so it sorts and runs before
-- everything else, including 009. Uses `if not exists` throughout so it's a
-- safe no-op against the current live database, where both tables already
-- exist with this same shape.
--
-- This migration only creates the bare tables — RLS enabling and policies
-- are left to the migrations that already own them (009, then narrowed by
-- 015), and the rating range constraint is left to 016, so there's a single
-- source of truth for each rather than duplicating policy/constraint
-- definitions across files.
-- =============================================================================

create table if not exists news (
  id         bigint generated always as identity primary key,
  title      text not null,
  content    text not null,
  category   text not null,
  status     text not null default 'draft',
  image_url  text,
  created_at timestamptz not null default now()
);

comment on table news is
  'Despite the name, also holds ContentPage rows (Rekrutacja/O nas/Polityka '
  'prywatności — category = ''ContentPage'', title = slug) and a single '
  'SystemSettings row (category = ''SystemSettings'', title = ''global_settings'') '
  'holding site-wide settings as JSON in `content`. Not a data-modeling choice '
  'worth replicating — just documenting what''s actually there.';

create table if not exists testimonials (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  avatar_url text,
  headline   text not null,
  text       text not null,
  rating     integer not null,
  created_at timestamptz not null default now()
);
