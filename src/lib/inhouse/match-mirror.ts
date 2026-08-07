import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { MatchRecord } from './match-record';

// Best-effort mirror of a Firestore match record into Supabase (migration 021).
//
// Firestore stays the source of truth — everything that actually reads match
// data (the match page, the shared ledger/counter writes, medals once built)
// goes through it. This exists purely so match data is queryable with plain
// SQL. Deliberately non-blocking: a Supabase hiccup must never fail ingestion,
// which is why every call site in ingest.ts fires this after its Firestore
// write has already succeeded and never awaits it into a failure path.

export async function mirrorMatchRecord(record: MatchRecord): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('inhouse_matches').upsert(
      {
        dota_match_id: record.dotaMatchId,
        game_id: record.gameId,
        game_number: record.gameNumber,
        radiant_win: record.radiantWin,
        duration_seconds: record.durationSeconds,
        radiant_score: record.radiantScore,
        dire_score: record.direScore,
        started_at: record.startedAt,
        game_mode: record.gameMode,
        lobby_type: record.lobbyType,
        league_id: record.leagueId,
        roster: record.roster,
        parse_state: record.parseState,
        parsed_at: record.parsedAt,
        ingested_at: record.ingestedAt,
        updated_at: record.updatedAt,
      },
      { onConflict: 'dota_match_id' },
    );
    if (error) console.error('inhouse match mirror upsert failed', record.dotaMatchId, error);
  } catch (err) {
    console.error('inhouse match mirror failed', record.dotaMatchId, err);
  }
}
