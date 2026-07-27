-- Create the `tournaments` table backing the "Co jest grane?" section on the landing page.
-- Run this in your Supabase SQL editor.

create table if not exists tournaments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  tag          text not null default 'Zapisy otwarte' check (tag in ('Zapisy otwarte', 'Trwający', 'Zakończony')),
  description  text not null default '',
  href         text not null default '',
  image_url    text,
  is_visible   boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- Enable Row Level Security
alter table tournaments enable row level security;

-- Public (anon) visitors only ever see tournaments explicitly marked visible
create policy "Public read visible tournaments"
  on tournaments
  for select
  using (is_visible = true);

-- Only the admin panel (authenticated + whitelisted email) can read drafts and write
create policy "Admin Write Access for tournaments"
  on tournaments
  for all
  to authenticated
  using (
    (auth.jwt() ->> 'email') in ('voocash.s@gmail.com', 'wilq.wdz@gmail.com')
  )
  with check (
    (auth.jwt() ->> 'email') in ('voocash.s@gmail.com', 'wilq.wdz@gmail.com')
  );

-- Storage: reuse (or create) the "tournament-banners" bucket already used by Hall of Fame banners.
-- Landing-page tournament images are uploaded with a `landing_` filename prefix to avoid collisions.
-- If the bucket does not exist yet, create it in the Supabase dashboard (Storage → New bucket →
-- name: tournament-banners, Public bucket: on).
