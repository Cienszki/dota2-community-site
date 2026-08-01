-- =============================================================================
-- Migration 016: Enforce a 1-5 range on testimonials.rating at the DB layer
-- =============================================================================
-- The admin panel's rating field is a <select> limited to 1-5, but nothing
-- stopped a malformed payload or a future write path from inserting an
-- out-of-range value (e.g. 999 or -5) directly at the database layer. Adding
-- a check constraint closes that gap regardless of which code path writes
-- the row.
--
-- Before running this migration, verify no existing row already violates
-- the constraint (ADD CONSTRAINT validates all existing rows and fails if
-- any do):
--
--   select id, rating from testimonials where rating < 1 or rating > 5;
--
-- If that returns any rows, fix or remove them first.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_rating' and conrelid = 'testimonials'::regclass
  ) then
    alter table testimonials
      add constraint chk_rating check (rating >= 1 and rating <= 5);
  end if;
end;
$$;
