-- =============================================================================
-- Migration 025: Move the static content pages out of `news`
-- =============================================================================
-- The three DB-backed static pages (rekrutacja, o-nas, polityka-prywatnosci)
-- have been living in the `news` table as rows with category = 'ContentPage'
-- and the slug stuffed into `title`. They are not news: they have no date, no
-- image, no status, they never appear in a feed, and every query over news has
-- to remember to filter them back out (`/newsy`, the admin list — twice, once
-- in SQL and once again in JS). That last part is the tell; a row that every
-- reader must exclude is in the wrong table.
--
-- Note for anyone reading the history: migration 006 created a `content_pages`
-- table and migration 019 dropped it as orphaned — it was never wired to
-- anything, so the rows stayed in `news`. This migration recreates it AND
-- moves the code onto it in the same change (ContentPageView + the three
-- admin server actions), so it is the wiring 006 was missing, not a repeat of
-- it. If you find this table unused again, the code regressed.
--
-- Deliberately minimal: no title column. Headings, descriptions and OG titles
-- live in src/lib/content-pages.ts next to the route folders they belong to,
-- because adding a page means adding a route either way — a DB row cannot
-- create one. This table holds only the part an admin edits without a deploy.
--
-- Write policy follows migration 015's rule: service_role only, via a Server
-- Action behind checkAdminAuth() — never an authenticated-role RLS policy.
-- =============================================================================

create table if not exists content_pages (
  slug        text primary key,
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table content_pages enable row level security;

drop policy if exists "Public read content_pages" on content_pages;
create policy "Public read content_pages"
  on content_pages for select
  using (true);

drop policy if exists "Service role full access for content_pages" on content_pages;
create policy "Service role full access for content_pages"
  on content_pages for all
  to service_role
  using (true)
  with check (true);

comment on table content_pages is
  'Admin-editable HTML for the static pages (rekrutacja, o-nas, polityka-prywatnosci), managed from the Strony section of /admin. Slugs must match a route folder under src/app and an entry in src/lib/content-pages.ts. Moved here from news.category = ''ContentPage'' by migration 025.';

-- ── Move the existing rows across ────────────────────────────────────────────
-- `title` held the slug. Re-runnable: the insert leaves already-migrated rows
-- alone rather than overwriting edits made after the first run.
insert into content_pages (slug, content, created_at, updated_at)
select title, coalesce(content, ''), coalesce(created_at, now()), now()
from news
where category = 'ContentPage'
  and title is not null
on conflict (slug) do nothing;

-- Only delete what demonstrably arrived. If the insert above skipped or failed
-- on a row, that row stays in `news` rather than being destroyed here.
delete from news
where category = 'ContentPage'
  and title in (select slug from content_pages);
