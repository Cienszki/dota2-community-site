import Link from 'next/link';
import { ArrowLeft, Search, Gavel, ShieldAlert } from 'lucide-react';
import { isInhouseConfigured, getDb } from '@/lib/firebase-admin';
import { getInhouseStore } from '@/lib/inhouse/store';
import { resolveDisplayName } from '@/lib/inhouse/display';
import type { InhouseGame, ModerationRecord } from '@/lib/inhouse/core/types';
import ModeratePlayerRow, { type RosterPlayer } from './ModeratePlayerRow';
import RevokeButton from './RevokeButton';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ game?: string }>;

async function findGame(query: string): Promise<InhouseGame | null> {
  const store = getInhouseStore();
  const q = query.trim();
  if (/^\d+$/.test(q) && q.length < 12) {
    const snap = await getDb().collection('inhouseGames').where('gameNumber', '==', Number(q)).limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() as InhouseGame);
  }
  return store.getGame(q);
}

export default async function ModerationPage({ searchParams }: { searchParams: SearchParams }) {
  const { game: gameQuery } = await searchParams;

  if (!isInhouseConfigured()) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <p className="text-slate-400">Firestore nie jest skonfigurowany.</p>
      </div>
    );
  }

  const store = getInhouseStore();

  let roster: RosterPlayer[] = [];
  let game: InhouseGame | null = null;
  let notFoundQuery = false;

  if (gameQuery) {
    game = await findGame(gameQuery);
    if (!game) {
      notFoundQuery = true;
    } else {
      const [memberships, defaults] = await Promise.all([
        store.listMemberships(game.id, false),
        store.getAdminDefaults(),
      ]);
      const ladder = defaults.banLadderDays.length ? defaults.banLadderDays : [7, 30, 0];
      roster = await Promise.all(
        memberships.map(async (m) => {
          const prior = await store.countPriorBans({ discordId: m.discordId, steamId32: m.steamId32 });
          const suggestedDays = ladder[Math.min(prior, ladder.length - 1)] ?? 0;
          return {
            steamId32: m.steamId32,
            discordId: m.discordId,
            name: resolveDisplayName({ displayName: m.displayName, playerName: m.playerName, steamId32: m.steamId32 }),
            suggestedDays,
          };
        }),
      );
    }
  }

  // Active bans (not revoked). Filtered/sorted in code to avoid a composite index.
  const banSnap = await getDb().collection('inhouseModeration').where('kind', '==', 'ban').get();
  const activeBans = banSnap.docs
    .map((d) => d.data() as ModerationRecord)
    .filter((r) => !r.revokedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/admin/inhouse" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Inhouse
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/25 flex items-center justify-center">
          <Gavel className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Moderacja</h1>
          <p className="text-slate-500 text-sm">Bany zaczynają się od meczu — otwórz grę i wybierz gracza ze składu.</p>
        </div>
      </div>

      {/* game lookup */}
      <form className="flex items-stretch gap-2 mb-8" action="/admin/inhouse/moderation" method="get">
        <input
          name="game"
          defaultValue={gameQuery ?? ''}
          placeholder="Numer gry (np. 412) lub ID"
          className="flex-1 max-w-xs bg-[#181a20] border border-white/10 rounded-lg px-3 py-2 text-slate-200 outline-none focus:ring-2 focus:ring-red-600"
        />
        <button type="submit" className="inline-flex items-center gap-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-sm">
          <Search className="w-4 h-4" /> Otwórz
        </button>
      </form>

      {notFoundQuery && <p className="text-amber-300 text-sm mb-6">Nie znaleziono gry „{gameQuery}”.</p>}

      {game && (
        <section className="mb-10">
          <h2 className="text-lg font-bold text-slate-200 mb-3">
            Skład gry #{game.gameNumber} — {game.initiatorName}
          </h2>
          {roster.length === 0 ? (
            <p className="text-slate-500 text-sm">Brak zapisanych graczy w tej grze.</p>
          ) : (
            <div className="space-y-3">
              {roster.map((p) => (
                <ModeratePlayerRow key={p.steamId32} gameId={game!.id} player={p} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* active bans */}
      <section>
        <h2 className="text-lg font-bold text-slate-200 mb-3 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-500" /> Aktywne bany ({activeBans.length})
        </h2>
        {activeBans.length === 0 ? (
          <p className="text-slate-500 text-sm">Brak aktywnych banów.</p>
        ) : (
          <div className="space-y-2">
            {activeBans.map((b) => (
              <div key={b.id} className="bg-slate-900/40 border border-slate-700 rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-white">{b.subjectName ?? b.subjectSteamId32 ?? b.subjectDiscordId}</div>
                  <div className="text-sm text-slate-400 mt-0.5">{b.reason}</div>
                  <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-3">
                    <span>Steam: {b.subjectSteamId32 ?? '—'}</span>
                    <span>Discord: {b.subjectDiscordId ?? '—'}</span>
                    <span>Wygasa: {b.expiresAt ? new Date(b.expiresAt).toLocaleDateString('pl-PL') : 'nigdy'}</span>
                    {b.identityGap !== 'none' && (
                      <span className="text-amber-400">
                        {b.identityGap === 'no_discord' ? 'brak Discorda' : 'brak Steama'}
                      </span>
                    )}
                  </div>
                </div>
                <RevokeButton moderationId={b.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
