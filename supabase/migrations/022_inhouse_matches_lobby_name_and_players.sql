-- =============================================================================
-- Migration 022: lobby name and a queryable player list on the match mirror
-- =============================================================================
-- Two fields added to Firestore's MatchRecord, mirrored here for parity.
--
-- lobby_name is denormalized off the game document on purpose: it identifies a
-- match wherever one is shown, and the game it came from can be purged (see
-- scripts/inhouse-purge-games.mjs) while the match record must survive.
--
-- player_steam_ids is the flattening of roster[].steamId32. Firestore cannot
-- query a field inside an array of objects, so "which matches was this player
-- in" needs the projection to exist as its own array. It is duplicated here
-- rather than derived with a jsonb query so the two databases keep the same
-- shape — this table is an opaque mirror, not a normalized model.
-- =============================================================================

alter table inhouse_matches add column if not exists lobby_name text;
alter table inhouse_matches add column if not exists player_steam_ids text[] not null default '{}';

-- The lookup the profile's match history performs.
create index if not exists inhouse_matches_player_steam_ids_idx
  on inhouse_matches using gin (player_steam_ids);

comment on column inhouse_matches.lobby_name is
  'In-game lobby name, copied off the game document at ingestion. Null for a backfilled league match that was never a lobby here.';
comment on column inhouse_matches.player_steam_ids is
  'Flattened roster[].steamId32, excluding anonymous slots. Exists so a player''s matches are queryable without unnesting roster.';
