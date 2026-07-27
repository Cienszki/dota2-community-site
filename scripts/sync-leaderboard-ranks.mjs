#!/usr/bin/env node
// Twice-daily Polish Top 5000 leaderboard sync.
//
// Pulls polish_top.json from the woocash88/dota2-pl-leaderboard repo (which
// scrapes and commits it itself on its own GitHub Actions schedule, roughly
// every 12h at 00:00/12:00 UTC) and upserts leaderboard_rank into Supabase's
// ranking_leaderboard table. Runs standalone (no Next.js dependency) so it
// can be triggered by GitHub Actions without the site needing to be
// deployed anywhere — same pattern as scripts/sync-player-stats.mjs.
//
// Usage: node scripts/sync-leaderboard-ranks.mjs
// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/woocash88/dota2-pl-leaderboard/refs/heads/main/polish_top.json';

async function main() {
  const startedAt = Date.now();

  const response = await fetch(GITHUB_RAW_URL);
  if (!response.ok) {
    console.error(`GitHub responded with ${response.status}.`);
    process.exit(1);
  }

  const players = await response.json();
  if (!Array.isArray(players) || players.length === 0) {
    console.error('Empty or invalid player list.');
    process.exit(1);
  }

  const fetchedNames = new Set();
  let upserted = 0;
  let inserted = 0;
  let failed = 0;

  for (const player of players) {
    const name = player.name?.trim();
    const rank = player.rank;

    if (!name || typeof rank !== 'number') continue;

    fetchedNames.add(name);

    try {
      const { data: existing } = await supabaseAdmin
        .from('ranking_leaderboard')
        .select('id')
        .eq('name', name)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabaseAdmin
          .from('ranking_leaderboard')
          .update({
            leaderboard_rank: rank,
            is_official_leaderboard: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;
        upserted++;
      } else {
        const { error: insertError } = await supabaseAdmin
          .from('ranking_leaderboard')
          .insert({
            name,
            leaderboard_rank: rank,
            is_official_leaderboard: true,
            steam_id: null,
          });

        if (insertError) throw insertError;
        inserted++;
      }
    } catch (err) {
      failed++;
      console.error(`Failed to upsert "${name}":`, err.message || err);
    }
  }

  // Cleanup: official entries whose name is no longer in the fetched list
  // lose their rank (dropped out of the top 5000) rather than being deleted.
  const { data: staleEntries } = await supabaseAdmin
    .from('ranking_leaderboard')
    .select('id, name')
    .eq('is_official_leaderboard', true);

  let cleaned = 0;
  if (staleEntries) {
    for (const entry of staleEntries) {
      if (!fetchedNames.has(entry.name)) {
        const { error } = await supabaseAdmin
          .from('ranking_leaderboard')
          .update({
            leaderboard_rank: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', entry.id);
        if (!error) cleaned++;
      }
    }
  }

  console.log(
    'Summary:',
    JSON.stringify(
      {
        total_in_json: players.length,
        upserted,
        inserted,
        failed,
        cleaned,
        duration_ms: Date.now() - startedAt,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('Fatal error in sync-leaderboard-ranks:', err);
  process.exit(1);
});
