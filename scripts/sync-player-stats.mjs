#!/usr/bin/env node
// Daily OpenDota -> Supabase sync for registered ranking players.
//
// Runs standalone (no Next.js dependency) so it can be triggered directly by
// GitHub Actions (.github/workflows/sync-player-stats.yml) without the site
// needing to be deployed anywhere — this script talks straight to Supabase's
// and OpenDota's public APIs.
//
// Usage: node scripts/sync-player-stats.mjs
// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const OPENDOTA_BASE = 'https://api.opendota.com/api';
const MATCHES_LIMIT = 50;
const FORM_WINDOW_DAYS = 14;

// 30 players x 2 requests each (profile + matches) = 60 requests per
// window, comfortably under OpenDota's 60 req/min free-tier limit.
const PLAYERS_PER_BATCH = 30;
const BATCH_WINDOW_MS = 2 * 60 * 1000;

// Free-tier daily cap is 3000 requests; warn in the summary if we get close.
const DAILY_REQUEST_WARNING_THRESHOLD = 2400;

const FALLBACK_AVATAR = 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// player_slot 0-4 = Radiant, 128-132 = Dire (OpenDota/Valve match schema).
function isWin(match) {
  const isRadiant = match.player_slot < 128;
  return isRadiant ? match.radiant_win : !match.radiant_win;
}

async function fetchJsonWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 && attempt < retries) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`OpenDota responded ${res.status} for ${url}`);
    return res.json();
  }
  throw new Error(`OpenDota rate-limited after retries for ${url}`);
}

async function syncPlayer(steamId, fallbackName, fallbackAvatar) {
  const accountId = parseInt(steamId, 10);

  const [profile, matches] = await Promise.all([
    fetchJsonWithRetry(`${OPENDOTA_BASE}/players/${accountId}`),
    fetchJsonWithRetry(`${OPENDOTA_BASE}/players/${accountId}/matches?limit=${MATCHES_LIMIT}`),
  ]);

  const hasPublicMatches = Array.isArray(matches) && matches.length > 0;

  let winRate = null;
  let form = null;

  if (hasPublicMatches) {
    const wins = matches.filter(isWin).length;
    winRate = Math.round((wins / matches.length) * 1000) / 10; // e.g. 68.2

    const cutoffSeconds = Date.now() / 1000 - FORM_WINDOW_DAYS * 24 * 60 * 60;
    const recentMatches = matches.filter((m) => m.start_time >= cutoffSeconds);
    const recentWins = recentMatches.filter(isWin).length;
    form = recentWins - (recentMatches.length - recentWins);
  }

  return {
    name: profile.profile?.personaname || fallbackName,
    avatar: profile.profile?.avatarfull || fallbackAvatar || FALLBACK_AVATAR,
    mmr: profile.mmr_estimate?.estimate ?? null,
    rank_tier: profile.rank_tier ?? null,
    leaderboard_rank: profile.leaderboard_rank ?? null,
    win_rate: winRate,
    form,
    has_public_matches: hasPublicMatches,
  };
}

// The top-5000 scraper (a separate repo, woocash88/dota2-pl-leaderboard)
// matches its JSON entries against ranking_leaderboard by exact `name`, and
// deletes any is_official_leaderboard row whose name no longer appears in
// that JSON — unless the row has a steam_id, which it leaves alone. But once
// this script renames such a row (line ~126, `name: stats.name`, refreshed
// from the player's live OpenDota persona), the scraper's next run no longer
// recognizes it by its old name, still finds that old name in the JSON, and
// inserts a brand-new steam_id-less "ghost" row for it — the row we already
// track survives (protected by its steam_id), but a stale duplicate now sits
// next to it on /ranking.
//
// source_name (set once, by src/app/admin/actions.ts#setTop5000SteamId, at
// the moment a steam_id is first attached) is the exact name the scraper
// still expects, so it's an exact key for recognizing these ghosts — no
// fuzzy name/rank matching needed, unlike the general "is this the same
// person" problem this deliberately avoids solving.
async function cleanupRenameGhosts() {
  const { data: sourceNameRows, error: sourceErr } = await supabaseAdmin
    .from('ranking_leaderboard')
    .select('source_name')
    .not('source_name', 'is', null);

  if (sourceErr) {
    console.error('Ghost cleanup: failed to read source_name rows:', sourceErr.message);
    return { deleted: 0, failed: 0 };
  }

  const claimedNames = new Set((sourceNameRows ?? []).map((r) => r.source_name));
  if (claimedNames.size === 0) return { deleted: 0, failed: 0 };

  const { data: candidates, error: candidateErr } = await supabaseAdmin
    .from('ranking_leaderboard')
    .select('id, name')
    .eq('is_official_leaderboard', true)
    .is('steam_id', null);

  if (candidateErr) {
    console.error('Ghost cleanup: failed to read official rows:', candidateErr.message);
    return { deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;
  for (const candidate of candidates ?? []) {
    if (!claimedNames.has(candidate.name)) continue;

    const { error: deleteError } = await supabaseAdmin
      .from('ranking_leaderboard')
      .delete()
      .eq('id', candidate.id);

    if (deleteError) {
      failed++;
      console.error(`Ghost cleanup: failed to delete '${candidate.name}':`, deleteError.message);
    } else {
      deleted++;
      console.log(`Ghost cleanup: deleted duplicate '${candidate.name}' (already tracked under a renamed row).`);
    }
  }

  return { deleted, failed };
}

async function main() {
  const startedAt = Date.now();

  const ghostCleanup = await cleanupRenameGhosts();

  const { data: registeredPlayers, error } = await supabaseAdmin
    .from('ranking_leaderboard')
    .select('id, steam_id, name, source_name, avatar, leaderboard_rank')
    .not('steam_id', 'is', null);

  if (error) {
    console.error('Failed to read ranking_leaderboard:', error.message);
    process.exit(1);
  }

  const players = registeredPlayers ?? [];
  let processed = 0;
  let failed = 0;
  let requestsMade = 0;
  const failedSteamIds = [];

  for (let i = 0; i < players.length; i += PLAYERS_PER_BATCH) {
    const batch = players.slice(i, i + PLAYERS_PER_BATCH);

    for (const player of batch) {
      try {
        const stats = await syncPlayer(player.steam_id, player.name, player.avatar);
        requestsMade += 2;

        // A top-5000 player picks the nick they're listed under the moment
        // an admin (or they themselves) attaches a SteamID — source_name
        // pins it. Overwriting `name` with the live OpenDota persona after
        // that isn't just a cosmetic surprise: the scraper matches its JSON
        // rows against ours by exact name, so a rename breaks that match and
        // recreates this same player as a fresh steam_id-less ghost on the
        // scraper's next run (see cleanupRenameGhosts above, which mops up
        // ghosts that slip through before this landed). Players who never
        // came from the top-5000 list have no source_name and keep tracking
        // their live nickname as before.
        const { error: updateError } = await supabaseAdmin
          .from('ranking_leaderboard')
          .update({
            name: player.source_name || stats.name,
            avatar: stats.avatar,
            mmr: stats.mmr,
            rank_tier: stats.rank_tier,
            leaderboard_rank: player.leaderboard_rank ?? stats.leaderboard_rank,
            win_rate: stats.win_rate,
            form: stats.form,
            has_public_matches: stats.has_public_matches,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', player.id);

        if (updateError) throw updateError;
        processed++;
      } catch (err) {
        failed++;
        failedSteamIds.push(player.steam_id);
        console.error(`Failed to sync steam_id ${player.steam_id}:`, err.message || err);
      }
    }

    const isLastBatch = i + PLAYERS_PER_BATCH >= players.length;
    if (!isLastBatch) {
      console.log(`Processed batch of ${batch.length}, waiting ${BATCH_WINDOW_MS / 1000}s before next batch...`);
      await sleep(BATCH_WINDOW_MS);
    }
  }

  const summary = {
    total_players: players.length,
    processed,
    failed,
    failed_steam_ids: failedSteamIds,
    ghosts_deleted: ghostCleanup.deleted,
    ghost_cleanup_failed: ghostCleanup.failed,
    opendota_requests_made: requestsMade,
    duration_ms: Date.now() - startedAt,
  };

  if (requestsMade > DAILY_REQUEST_WARNING_THRESHOLD) {
    console.warn(`OpenDota request volume (${requestsMade}) is approaching the 3000/day free-tier limit.`);
  }

  console.log('Summary:', JSON.stringify(summary, null, 2));

  if (players.length > 0 && processed === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal error in sync-player-stats:', err);
  process.exit(1);
});
