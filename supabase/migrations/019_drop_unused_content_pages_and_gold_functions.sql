-- =============================================================================
-- Migration 019: Drop orphaned content_pages table and gold-clicker functions
-- =============================================================================
-- content_pages (migration 006) is entirely unused — ContentPage rows
-- (Rekrutacja/O nas/Polityka prywatności) are actually stored in the `news`
-- table under category = 'ContentPage' instead (see migration 000's
-- comment on that table). Nothing in the codebase queries content_pages.
--
-- increment_gold / reset_user_gold / reset_all_gold / try_acquire_lock /
-- try_deduct_gold (touched by migration 011's search_path fix) belong to a
-- removed feature — grepping the app source turns up zero references to
-- any of them. Dropped dynamically (rather than hardcoding signatures we'd
-- have to guess) so this doesn't depend on knowing their exact argument
-- types.
-- =============================================================================

drop table if exists content_pages;

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
    execute format('drop function if exists %I(%s)', rec.proname, rec.args);
    raise notice 'Dropped unused function: %(%)', rec.proname, rec.args;
  end loop;
end;
$$;
