-- =============================================================================
-- Migration 026: keep the original top-5000 nickname alongside the live one
-- =============================================================================
-- CONTEXT
-- Rows scraped from the top-5000 JSON source (woocash88/dota2-pl-leaderboard)
-- carry whatever nickname that list had at scrape time. Once an admin attaches
-- a SteamID to one of these rows (see the "Ranking 5k" admin panel), the daily
-- sync-player-stats cron starts overwriting `name` with the player's live
-- OpenDota persona on every run — and Steam nicknames drift (e.g. "f" ->
-- "2018"), while the JSON source keeps reporting the old one forever, since it
-- has no idea a rename happened.
--
-- That makes it hard to double-check, after the fact, "did I actually attach
-- this SteamID to the right JSON entry?" — the JSON still says "f", but the
-- row now says "2018", with nothing connecting them.
--
-- FIX: a second column that is set once, at the moment a SteamID is first
-- attached (see setTop5000SteamId in src/app/admin/actions.ts), capturing
-- whatever `name` held right before the sync job starts touching it. Never
-- overwritten again after that.
-- =============================================================================

alter table ranking_leaderboard
  add column if not exists source_name text;

comment on column ranking_leaderboard.source_name is
  'Nickname exactly as scraped into the top-5000 JSON source, snapshotted once when an admin first attaches a steam_id (see setTop5000SteamId). Never updated again — `name` drifts with the player''s live OpenDota persona afterward, this stays put so the two can be cross-checked.';
