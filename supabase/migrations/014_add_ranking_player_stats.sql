-- Add columns to `ranking_leaderboard` to store OpenDota stats populated by
-- the daily /api/cron/sync-player-stats job, replacing per-request OpenDota
-- calls previously made from the /ranking page on every page load.
-- Run this in your Supabase SQL Editor.

alter table ranking_leaderboard
  add column if not exists mmr integer,
  add column if not exists rank_tier integer,
  add column if not exists win_rate numeric(5,2),
  add column if not exists form integer,
  add column if not exists has_public_matches boolean not null default true,
  add column if not exists last_synced_at timestamptz;

comment on column ranking_leaderboard.mmr is
  'OpenDota mmr_estimate.estimate, refreshed daily by the sync-player-stats cron job.';
comment on column ranking_leaderboard.rank_tier is
  'OpenDota rank_tier, refreshed daily by the sync-player-stats cron job.';
comment on column ranking_leaderboard.win_rate is
  'Win rate percentage across the last 50 matches. Null when the player''s match history is private or empty (see has_public_matches) — distinct from a genuine 0%.';
comment on column ranking_leaderboard.form is
  'Win-loss diff over the last 14 days, among the last 50 matches. Null when the player''s match history is private or empty (see has_public_matches).';
comment on column ranking_leaderboard.has_public_matches is
  'False when OpenDota''s /matches endpoint returned no data (private match history) for this player — lets the frontend show "no public data" instead of a misleading 0%/0 form.';
comment on column ranking_leaderboard.last_synced_at is
  'Timestamp of the last successful sync-player-stats run for this player.';

-- No RLS policy changes needed here: migration 011 already locks
-- ranking_leaderboard writes to the service_role (used by supabaseAdmin in
-- the sync job) while keeping SELECT public. New columns inherit those
-- existing table-level policies automatically.
