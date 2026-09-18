-- =============================================================================
-- Migration 027: multiple Forma windows instead of one fixed 14-day value
-- =============================================================================
-- CONTEXT
-- /ranking's "Forma" column showed a single win-loss balance over a hardcoded
-- 14-day window. Replacing that with a selector (1/3/7/14/30 days) that
-- switches instantly client-side means every window has to already be sitting
-- in the row when the page loads — there's no per-click recomputation.
--
-- The sync-player-stats cron now fetches up to 150 recent matches per player
-- (raised from 50 — see MATCHES_LIMIT in scripts/sync-player-stats.mjs) and
-- derives all five windows from that same fetch, one extra field each, no
-- extra OpenDota requests. win_rate is unaffected: still computed over the
-- last 50 matches only, per the site owner's request.
-- =============================================================================

alter table ranking_leaderboard
  drop column if exists form,
  add column if not exists form_1 integer,
  add column if not exists form_3 integer,
  add column if not exists form_7 integer,
  add column if not exists form_14 integer,
  add column if not exists form_30 integer;

comment on column ranking_leaderboard.form_1 is
  'Win-loss diff over the last 1 day, among the last 150 matches. Null when the player''s match history is private or empty (see has_public_matches).';
comment on column ranking_leaderboard.form_3 is
  'Win-loss diff over the last 3 days, among the last 150 matches. Null when the player''s match history is private or empty (see has_public_matches).';
comment on column ranking_leaderboard.form_7 is
  'Win-loss diff over the last 7 days, among the last 150 matches. Null when the player''s match history is private or empty (see has_public_matches).';
comment on column ranking_leaderboard.form_14 is
  'Win-loss diff over the last 14 days, among the last 150 matches. Null when the player''s match history is private or empty (see has_public_matches).';
comment on column ranking_leaderboard.form_30 is
  'Win-loss diff over the last 30 days, among the last 150 matches — a very active player can exceed 150 matches within 30 days, in which case this undercounts. Null when the player''s match history is private or empty (see has_public_matches).';
