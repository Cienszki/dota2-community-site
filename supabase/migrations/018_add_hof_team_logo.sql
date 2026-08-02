-- Add an optional team logo column to hall_of_fame_tournaments, shown next
-- to the team name on the Hall of Fame page (separate from the tournament
-- banner image, which already has its own image_url column).
alter table hall_of_fame_tournaments
  add column if not exists team_logo_url text;

-- No RLS changes needed: this table's existing policies (migration 015)
-- already cover all columns.
