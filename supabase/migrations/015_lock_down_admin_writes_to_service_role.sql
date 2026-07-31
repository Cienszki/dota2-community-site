-- =============================================================================
-- Migration 015: Lock down all admin-editable tables/buckets to service_role
-- =============================================================================
-- CONTEXT
-- Every admin-panel write — testimonials, tournaments ("Co jest grane?"),
-- hall_of_fame_tournaments, basher_issues, news (articles + ContentPage rows
-- + the SystemSettings row), streamers — and every admin file upload
-- (basher-magazines, tournament-banners, news-images) now goes through a
-- Next.js Server Action in src/app/admin/actions.ts using the service_role
-- client (supabaseAdmin), gated by checkAdminAuth(). This is the same
-- pattern the news-images bucket already used before this migration. The
-- browser client (anon key + user session) is NEVER used for writes
-- anymore — only for public reads.
--
-- This migration removes the `authenticated` + email-whitelist RLS write
-- policies that used to let the admin panel write directly from the browser
-- session. They are no longer used, and — more importantly — they are no
-- longer WANTED: leaving them in place would mean an authenticated session
-- (even a leaked or otherwise misused one) could still write directly to
-- these tables/buckets, bypassing every server-side check in actions.ts.
-- With these policies gone, RLS grants NO write access to anyone except
-- service_role, whose key lives only in server-side environment variables
-- and is never shipped to the browser.
--
-- Do NOT read the removal of these policies as a gap to "restore" in some
-- future security pass — it is the intended, final state. If a new
-- admin-editable feature is added later, it must follow the same pattern
-- (Server Action + supabaseAdmin + checkAdminAuth), not a new RLS write
-- policy for the authenticated role.
--
-- Public SELECT policies are left untouched everywhere in this migration —
-- published content must stay publicly readable. Note that on several of
-- these tables the SELECT policy is intentionally unfiltered
-- (`using (true)`), with the draft/published distinction enforced in
-- application code instead of RLS. That predates this migration and is out
-- of scope here; it's called out per-table below only so it's clear why
-- dropping the admin write policy doesn't also remove the admin panel's
-- ability to see draft rows (it never depended on RLS for that in those
-- cases — see each table's note).
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. testimonials
--    Writes now via saveTestimonial / deleteTestimonial (actions.ts).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Admin write testimonials" on testimonials;
-- "Public read testimonials" (select, using (true)) is unchanged.


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. hall_of_fame_tournaments
--    Writes now via saveHofTournament / deleteHofTournament /
--    publishHofTournament (actions.ts) — previously /api/admin/hof, a route
--    handler that was already using supabaseAdmin + an admin check; moved
--    into actions.ts for structural consistency, not because it was insecure.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Admin Write Access for hall_of_fame_tournaments" on hall_of_fame_tournaments;
-- "Public Read" (select, using (true)) is unchanged. The admin panel's
-- draft+published list already reads through this same unrestricted policy
-- (application code filters by status, not RLS), so dropping the write-only
-- policy above causes no read-side regression.


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. basher_issues
--    Writes now via saveBasherIssue / deleteBasherIssue / publishBasherIssue
--    (actions.ts), including the duplicate issue_number check that used to
--    run as a separate client-side query.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Admin Write Access for basher_issues" on basher_issues;
-- "Public Read" (select, using (true)) is unchanged — same reasoning as
-- hall_of_fame_tournaments above.


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. news
--    Covers regular articles, ContentPage rows (Rekrutacja/O nas/Polityka
--    prywatności), and the single SystemSettings row (global site settings).
--    Writes now via saveNews / deleteNews / publishNews / saveGlobalSettings /
--    upsertContentPage / deleteContentPage / uploadNewsImage (actions.ts).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Admin write news" on news;
-- "Public read news" (select, using (true)) is unchanged — same reasoning as
-- hall_of_fame_tournaments above. The news-images bucket already has zero
-- client-writable policies (see section 8) — this table's policy is the
-- part that was still open.


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. tournaments ("Co jest grane?" on the landing page)
--    Writes now via saveTournament / deleteTournament /
--    setTournamentVisibility (actions.ts).
--
--    Unlike the tables above, this table's public SELECT policy is genuinely
--    restrictive (`is_visible = true`), and the OLD admin policy was a
--    single `for all` policy that ALSO covered the admin panel's ability to
--    read hidden/draft tournaments via the browser client — that read did
--    depend on this policy. It has been moved server-side too
--    (getAllTournamentsAdmin, using supabaseAdmin), specifically so this
--    table's authenticated policy could be dropped entirely rather than
--    narrowed to a SELECT-only carve-out.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Admin Write Access for tournaments" on tournaments;
-- "Public read visible tournaments" (select, using (is_visible = true)) is
-- unchanged.


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. streamers
--    Writes already went through server actions (addStreamer / updateStreamer
--    / deleteStreamer / updateStreamerPositions, all using supabaseAdmin)
--    before this migration — the authenticated write policy below was
--    already dead weight. Dropped here for completeness, so this migration
--    is a full snapshot of intended RLS state.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Admin Write Access for streamers" on streamers;
-- "Public Read" (select, using (true)) is unchanged.


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Storage buckets: basher-magazines, tournament-banners
--    Both previously had `authenticated` + email-whitelist INSERT/UPDATE/
--    DELETE policies created directly in the Supabase dashboard (never
--    captured in a migration file, so their exact policy names aren't known
--    at authoring time). The block below finds and drops any non-SELECT
--    policy on storage.objects that scopes itself to these two buckets,
--    regardless of its name, instead of guessing exact names.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (
        qual ilike '%basher-magazines%' or with_check ilike '%basher-magazines%'
        or qual ilike '%tournament-banners%' or with_check ilike '%tournament-banners%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
    raise notice 'Dropped storage write policy: %', pol.policyname;
  end loop;
end;
$$;

-- basher-magazines keeps whatever public SELECT policy it already has
-- (needed for the Basher flipbook viewer to load pages) — the loop above
-- only targets INSERT/UPDATE/DELETE/ALL policies, so any existing SELECT
-- policy for this bucket is left untouched.
--
-- tournament-banners does not need a SELECT policy at all: it's configured
-- as a public bucket (Storage → bucket settings → Public bucket: on), so
-- objects are fetchable by direct URL regardless of RLS. Reconfirm this
-- bucket setting in the dashboard if this assumption ever needs revisiting.


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Already-correct — no action needed, listed so this migration is a full
--    snapshot of the intended final RLS/storage-policy state:
-- ─────────────────────────────────────────────────────────────────────────────
-- news-images (storage bucket): zero client-writable policies. All uploads
--   go through uploadNewsImage (actions.ts) via service_role. This was the
--   reference pattern this entire migration brings everything else in line
--   with.
--
-- ranking_leaderboard: "Public read access for ranking_leaderboard" (select,
--   using (true)) + "Service role full access for ranking_leaderboard"
--   (for all, to service_role only, fixed in migration 011) — already the
--   target state, no authenticated/whitelist write policy exists here.
