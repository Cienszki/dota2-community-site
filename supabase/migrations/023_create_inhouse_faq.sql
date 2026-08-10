-- =============================================================================
-- Migration 023: FAQ entries for /inhouse
-- =============================================================================
-- Backs the FAQ accordion on /inhouse (src/components/inhouse/FaqSection.tsx),
-- editable from /admin/inhouse/faq. Supabase rather than Firestore because
-- this is plain admin-authored copy, not bot/game state — same reasoning as
-- news/tournaments/streamers, not the Firestore-backed inhouse domain.
--
-- Ordered by sort_order (ascending), which is also what the page numbers
-- (01, 02, ...) reflect. New rows default to the end of the list (max + 1,
-- computed in src/app/admin/inhouse/faq/actions.ts) — nothing here exposes
-- manual reordering beyond editing sort_order directly.
--
-- No draft/published state: everything stored in this table is public. The
-- write policy follows migration 015's rule (service_role only, via a Server
-- Action + requireWebsiteAdmin() — never an authenticated-role RLS policy).
-- =============================================================================

create table if not exists inhouse_faq (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  answer      text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists inhouse_faq_sort_order_idx on inhouse_faq (sort_order);

alter table inhouse_faq enable row level security;

drop policy if exists "Public read inhouse_faq" on inhouse_faq;
create policy "Public read inhouse_faq"
  on inhouse_faq for select
  using (true);

drop policy if exists "Service role full access for inhouse_faq" on inhouse_faq;
create policy "Service role full access for inhouse_faq"
  on inhouse_faq for all
  to service_role
  using (true)
  with check (true);

comment on table inhouse_faq is
  'FAQ question/answer pairs shown on /inhouse, managed from /admin/inhouse/faq. Ordered by sort_order.';

-- One-time seed of the 4 questions that were hardcoded in FaqSection.tsx
-- before this migration, so the section isn't empty the moment this ships.
-- Guarded so re-running this file never duplicates rows.
insert into inhouse_faq (question, answer, sort_order)
select * from (
  values
    ('Czy muszę mieć Discorda, żeby dołączyć?',
     'Nie — możesz wejść do lobby ręcznie, podając hasło widoczne na karcie meczu. Discord jest potrzebny tylko, jeśli chcesz, żeby bot zapraszał Cię automatycznie.',
     0),
    ('Ile trwa rezerwacja miejsca?',
     'Po dołączeniu do kolejki trzymamy Ci miejsce przez 5 minut. Jeśli w tym czasie nie odpalisz Doty, miejsce wraca do puli.',
     1),
    ('Co się stanie, jeśli lobby jest już pełne?',
     'Trafiasz na listę oczekujących i zostajesz zaproszony automatycznie, gdy zwolni się miejsce.',
     2),
    ('Czy mogę zostać zbanowany z inhouse?',
     'Tak — za toksyczne zachowanie, boostowanie lub opuszczanie meczów bez powodu. Jeśli uważasz, że to pomyłka, napisz do administracji na Discordzie.',
     3)
) as seed(question, answer, sort_order)
where not exists (select 1 from inhouse_faq);
