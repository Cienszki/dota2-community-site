-- =============================================================================
-- Migration 024: enrol inhouse players into the ranking, and let them opt out
-- =============================================================================
-- CONTEXT
-- `ranking_leaderboard` currently holds two kinds of row:
--   * 22 official Dota leaderboard entries — name and leaderboard_rank, no
--     steam_id, scraped for the Polish top list
--   * 3 self-registered players — steam_id set, refreshed daily from OpenDota
--     by scripts/sync-player-stats.mjs, which syncs every row with a steam_id
--
-- Anyone who plays an inhouse, or links their accounts, should join the second
-- group: we have their Steam ID, so the existing sync picks them up on its next
-- run with no change to the job at all. Adding the row is the whole mechanism.
--
-- Two things that needs, hence this migration.
-- =============================================================================

-- 1. Where a row came from ----------------------------------------------------
--
-- `is_registered` means "this person signed up on the site themselves", and an
-- inhouse player who has never touched the website has not. Overloading it
-- would make "registered" stop meaning anything, and the admin screen needs to
-- tell the two apart to explain why someone is listed.

alter table ranking_leaderboard
  add column if not exists is_inhouse boolean not null default false;

comment on column ranking_leaderboard.is_inhouse is
  'True when this row was added automatically because the player appeared in an inhouse match or linked their accounts, rather than registering on the site. Not exclusive with is_registered — someone can be both.';

-- 2. Opting out, permanently --------------------------------------------------
--
-- Deleting the row is not enough on its own: the next inhouse they play would
-- put it straight back, and from the player's point of view they asked to be
-- removed and were ignored. So a removal has to be remembered, not just
-- performed — this table is the memory, and enrolment checks it first.
--
-- Keyed on the Steam ID rather than a person, because that is the identity that
-- always exists (§3.1). Someone with alts who wants none of them listed gets a
-- row per account, which is also what lets them keep one listed if they prefer.

create table if not exists ranking_exclusions (
  steam_id text primary key,
  -- Free text, admin-facing only. Worth recording: "asked in DMs" and "spam
  -- account" want different handling if it ever comes up again.
  reason text,
  -- Supabase admin email, from the same allowlist that guards /admin.
  excluded_by text,
  excluded_at timestamptz not null default now()
);

comment on table ranking_exclusions is
  'Steam IDs that must never appear in ranking_leaderboard. Checked before any automatic inhouse enrolment, so playing another game cannot re-add someone who asked to be removed.';

alter table ranking_exclusions enable row level security;

-- No public read policy: this is a list of people who asked not to be listed,
-- and publishing it would defeat the point. Everything that needs it runs
-- server-side through supabaseAdmin (service_role), same as migration 015.
create policy "Service role full access for ranking_exclusions"
  on ranking_exclusions for all
  to service_role
  using (true)
  with check (true);

-- The enrolment path filters a batch of candidate Steam IDs against this table
-- on every sweep, so the lookup is worth an index even at this size.
create index if not exists ranking_exclusions_steam_id_idx on ranking_exclusions (steam_id);
