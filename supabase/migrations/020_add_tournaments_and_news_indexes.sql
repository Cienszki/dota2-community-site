-- =============================================================================
-- Migration 020: Indexes for tournaments and news lookups
-- =============================================================================
-- Unlike ranking_leaderboard (whose /ranking query does select('*') with no
-- filter/order at the SQL level — sorting happens in JS after fetching
-- everything, so an index there would go unused), these two tables genuinely
-- filter and sort at the database level:
--
--   - Landing page: .from('tournaments').eq('is_visible', true)
--       .order('sort_order').order('created_at', { ascending: false })
--   - Content pages: .from('news').eq('category', 'ContentPage').eq('title', slug)
--
-- Both tables are small today, so this has no measurable effect yet — added
-- now while it's cheap, before either table grows.
-- =============================================================================

create index if not exists idx_tournaments_visibility_sort
  on tournaments (is_visible, sort_order, created_at desc);

create index if not exists idx_news_category_title
  on news (category, title);
