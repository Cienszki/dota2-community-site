-- =============================================================================
-- Migration 021: Mirror inhouse match records into Supabase
-- =============================================================================
-- CONTEXT
-- Firestore's inhouseMatches/{dotaMatchId} (see src/lib/inhouse/match-record.ts)
-- is and stays the source of truth: the bot and the website's own read paths
-- (the match page, medals once built) depend on it, and the shared vendored
-- core's writeMatchResult must not be forked across two databases (see
-- src/lib/inhouse/core/VENDORED.md — that's exactly the kind of drift that
-- caused the gamesPlayed double-count bug fixed on the bot side).
--
-- This table is an ADDITIVE mirror, not a replacement: written best-effort,
-- after the Firestore write, purely so match data is queryable with plain SQL
-- (analytics, ad-hoc reporting) without needing Firestore access. If this
-- write fails, ingestion still succeeds — see match-mirror.ts.
--
-- Private by design: no public SELECT policy. The website's own public pages
-- (match page, leaderboards) read Firestore, never this table, so nothing here
-- becomes a second, easier-to-forget place that could leak per-player stats
-- publicly. If a genuine public/analytics use for this table shows up later,
-- add a narrow SELECT policy then — deliberately not preempted here.
-- =============================================================================

create table if not exists inhouse_matches (
  dota_match_id bigint primary key,

  -- Null for a league match backfilled from OpenDota history that was never an
  -- inhouse game on this site (see ingestLeagueMatch) — mirrors Firestore's
  -- own nullable gameId for the same reason.
  game_id text,
  game_number integer,

  radiant_win boolean not null,
  duration_seconds integer not null,
  radiant_score integer,
  dire_score integer,
  started_at timestamptz not null,

  game_mode integer,
  lobby_type integer,
  league_id integer,

  -- The full roster, same shape as Firestore's MatchRosterEntry[] (camelCase
  -- keys kept as-is — this is an opaque mirror, not a normalized SQL model).
  -- Includes per-player stats: stored for parity with the Firestore record,
  -- same as there — §8 governs what's DISPLAYED, not what's stored, and
  -- nothing public reads this table (see header).
  roster jsonb not null default '[]'::jsonb,

  parse_state text not null default 'unparsed',
  parsed_at timestamptz,

  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inhouse_matches_game_id_idx on inhouse_matches (game_id);
create index if not exists inhouse_matches_league_id_idx on inhouse_matches (league_id);

alter table inhouse_matches enable row level security;

-- Writes only ever go through match-mirror.ts using supabaseAdmin
-- (service_role), same pattern as every other admin-owned table since
-- migration 015. service_role bypasses RLS regardless; this policy documents
-- that intent explicitly rather than relying on the bypass silently.
create policy "Service role full access for inhouse_matches"
  on inhouse_matches for all
  to service_role
  using (true)
  with check (true);

comment on table inhouse_matches is
  'Best-effort mirror of Firestore inhouseMatches/{dotaMatchId}, written from src/lib/inhouse/match-mirror.ts. Firestore remains the source of truth — this exists so match data is queryable in plain SQL. Not read by any public page.';
