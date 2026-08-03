import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Trophy, MapPin, Clock, Sparkles, Radio, Eye, Award } from 'lucide-react';
import InhouseShell from '@/components/inhouse/InhouseShell';
import JoinButton from '@/components/inhouse/JoinButton';
import Countdown from '@/components/inhouse/Countdown';
import { isInhouseConfigured } from '@/lib/firebase-admin';
import { getInhouseStore, InhouseStore } from '@/lib/inhouse/store';
import { getInhouseViewer } from '@/lib/inhouse/session';
import { modeName, regionName, delayLabel, formatDuration, resolveDisplayName } from '@/lib/inhouse/display';
import type { InhouseGame, Membership } from '@/lib/inhouse/core/types';
import PublishButton from './PublishButton';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!isInhouseConfigured()) return { title: 'Gra inhouse' };
  try {
    const game = await getInhouseStore().getGame(id);
    if (!game) return { title: 'Gra inhouse' };
    const visible = InhouseStore.isPubliclyVisible(game);
    return {
      title: `Gra #${game.gameNumber} — ${game.initiatorName}`,
      description: `Inhouse 5v5 #${game.gameNumber} zorganizowana przez ${game.initiatorName}.`,
      // Private (still-filling, unpublished) games must not be indexed.
      robots: visible ? { index: true, follow: true } : { index: false, follow: false },
      alternates: { canonical: `/inhouse/${id}` },
    };
  } catch {
    return { title: 'Gra inhouse' };
  }
}

export default async function GamePage({ params }: { params: Params }) {
  const { id } = await params;

  if (!isInhouseConfigured()) {
    return (
      <InhouseShell width="default">
        <Unavailable />
      </InhouseShell>
    );
  }

  const store = getInhouseStore();
  const game = await store.getGame(id);
  if (!game) notFound();

  const [memberships, viewer] = await Promise.all([
    store.listMemberships(id, false),
    getInhouseViewer(),
  ]);

  const isParticipant =
    (!!viewer.discordId && game.initiatorDiscordId === viewer.discordId) ||
    (!!viewer.steamId32 && memberships.some((m) => m.steamId32 === viewer.steamId32));

  // §0.1 / §6.4: publicly visible ⟺ published || finished. Otherwise 404 to
  // everyone but a participant — 404, not 403, so a 403 can't confirm it exists.
  if (!InhouseStore.isPubliclyVisible(game) && !isParticipant) {
    notFound();
  }

  const isHost = !!viewer.discordId && game.initiatorDiscordId === viewer.discordId;

  return (
    <InhouseShell width="default">
      <Header game={game} />

      {game.state === 'finished' ? (
        <FinishedView game={game} memberships={memberships} />
      ) : game.state === 'in_progress' ? (
        <InProgressView game={game} memberships={memberships} />
      ) : (
        <RecruitingView game={game} isHost={isHost} />
      )}
    </InhouseShell>
  );
}

/* ─── Header ─────────────────────────────────────────────────────────────── */

function Header({ game }: { game: InhouseGame }) {
  return (
    <div className="mb-8 border-b border-white/10 pb-6">
      <div className="flex items-center gap-2 text-slate-500 text-sm font-mono">
        #{game.gameNumber}
        {game.newcomerFriendly && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded px-1.5 py-0.5">
            <Sparkles className="w-3 h-3" /> dla nowych
          </span>
        )}
      </div>
      <h1 className="text-4xl font-black tracking-tight uppercase mt-1">{game.initiatorName}</h1>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-400 mt-3">
        <span className="inline-flex items-center gap-1.5">
          <Trophy className="w-4 h-4" /> {modeName(game.settings.gameMode)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="w-4 h-4" /> {regionName(game.settings.serverRegion)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Eye className="w-4 h-4" /> DotaTV {delayLabel(game.settings.dotaTvDelay)}
        </span>
      </div>
    </div>
  );
}

/* ─── State 1 — Recruiting ───────────────────────────────────────────────── */

function RecruitingView({ game, isHost }: { game: InhouseGame; isHost: boolean }) {
  const slots = game.slotSnapshot;
  const committed = slots?.committed ?? 0;
  const slotsOpen = slots?.slotsOpen ?? Math.max(0, 10 - committed);
  const reserved = slots?.reserved ?? [];

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-[#E7000B] transition-[width] duration-500"
              style={{ width: `${Math.min(100, (committed / 10) * 100)}%` }}
            />
          </div>
          <span className="text-lg font-black text-white tabular-nums">{committed}/10</span>
        </div>
        <p className="text-lg">
          {slotsOpen > 0 ? (
            <span className="text-emerald-300 font-bold">
              {slotsOpen} {slotsOpen === 1 ? 'wolne miejsce' : 'wolnych miejsc'}
            </span>
          ) : (
            <span className="text-slate-300 font-semibold">Lobby pełne — dołącz do kolejki</span>
          )}
        </p>

        {reserved.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">Zarezerwowane</h3>
            <div className="flex flex-wrap gap-2">
              {reserved.map((r) => (
                <span
                  key={r.discordId}
                  className="inline-flex items-center gap-2 text-sm text-slate-300 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5"
                >
                  {r.playerName ?? 'Gracz'}
                  <Countdown expiresAt={r.expiresAt} className="text-slate-500 text-xs" />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {game.state === 'open' && <JoinButton gameId={game.id} full={slotsOpen <= 0} />}
        {isHost && !game.published && (
          <div className="bg-zinc-900/40 border border-white/10 rounded-xl p-4">
            <p className="text-sm text-slate-300 mb-3">
              Ta gra jest jeszcze prywatna. Otwórz ją dla całego serwera — lobby stanie się też
              widoczne w przeglądarce Doty.
            </p>
            <PublishButton gameId={game.id} />
          </div>
        )}
        {game.published && (
          <p className="inline-flex items-center gap-2 text-sm text-emerald-300">
            <Radio className="w-4 h-4" /> Gra jest publiczna.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── State 2 — In progress ──────────────────────────────────────────────── */

function InProgressView({ game, memberships }: { game: InhouseGame; memberships: Membership[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-amber-300 font-bold mb-6">
        <Radio className="w-5 h-5 animate-pulse" /> Mecz w toku
      </div>
      <p className="text-slate-400 text-sm mb-6">
        Oglądaj w kliencie Dota 2 — transmisja z opóźnieniem {delayLabel(game.settings.dotaTvDelay)}.
      </p>
      <Teams memberships={memberships} />
    </div>
  );
}

/* ─── State 3 — Finished ─────────────────────────────────────────────────── */

function FinishedView({ game, memberships }: { game: InhouseGame; memberships: Membership[] }) {
  const r = game.result;
  return (
    <div>
      {r ? (
        <div className="flex flex-wrap items-center gap-5 mb-8">
          <span
            className={`text-2xl font-black uppercase ${r.radiantWin ? 'text-emerald-300' : 'text-red-300'}`}
          >
            {r.radiantWin ? 'Radiant' : 'Dire'} wygrywa
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <Clock className="w-4 h-4" /> {formatDuration(r.durationSeconds)}
          </span>
        </div>
      ) : (
        <p className="text-slate-400 mb-8">Gra rozegrana — wynik jest przetwarzany.</p>
      )}

      <Teams memberships={memberships} radiantWin={r?.radiantWin} />

      {r && r.awards.length > 0 && (
        <div className="mt-10">
          <h3 className="text-sm uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
            <Award className="w-4 h-4" /> Wyróżnienia
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {r.awards.map((a) => (
              <div
                key={a.id + a.steamId32}
                className="bg-zinc-900/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-slate-300"
              >
                {a.text}
              </div>
            ))}
          </div>
        </div>
      )}
      {r && !r.parsed && (
        <p className="mt-6 text-xs text-slate-500">
          Wyróżnienia pojawią się po przetworzeniu powtórki przez OpenDotę.
        </p>
      )}
    </div>
  );
}

/* ─── Shared ─────────────────────────────────────────────────────────────── */

function Teams({ memberships, radiantWin }: { memberships: Membership[]; radiantWin?: boolean }) {
  const radiant = memberships.filter((m) => m.side === 'radiant');
  const dire = memberships.filter((m) => m.side === 'dire');
  const unassigned = memberships.filter((m) => m.side === 'unassigned' && m.leftAt === null);

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <TeamColumn title="Radiant" players={radiant} win={radiantWin === true} accent="emerald" />
      <TeamColumn title="Dire" players={dire} win={radiantWin === false} accent="red" />
      {unassigned.length > 0 && (
        <div className="sm:col-span-2">
          <TeamColumn title="Bez drużyny" players={unassigned} win={false} accent="slate" />
        </div>
      )}
    </div>
  );
}

function TeamColumn({
  title,
  players,
  win,
  accent,
}: {
  title: string;
  players: Membership[];
  win: boolean;
  accent: 'emerald' | 'red' | 'slate';
}) {
  const ring =
    accent === 'emerald'
      ? 'border-emerald-500/25'
      : accent === 'red'
        ? 'border-red-500/25'
        : 'border-white/10';
  return (
    <div className={`bg-zinc-900/40 border ${ring} rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-bold text-white">{title}</h4>
        {win && (
          <span className="text-[10px] uppercase tracking-wide text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded px-1.5 py-0.5">
            wygrana
          </span>
        )}
      </div>
      {players.length === 0 ? (
        <p className="text-slate-600 text-sm">—</p>
      ) : (
        <ul className="space-y-1.5">
          {players.map((m) => (
            <li key={m.steamId32} className="text-sm text-slate-300 flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${m.leftAt === null ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              {resolveDisplayName({
                displayName: m.displayName,
                playerName: m.playerName,
                steamId32: m.steamId32,
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Unavailable() {
  return (
    <div className="bg-zinc-900/40 border border-white/10 rounded-2xl p-10 text-center">
      <h1 className="text-2xl font-bold text-white mb-2">Chwilowo niedostępne</h1>
      <p className="text-slate-400 text-sm">Integracja z botem lobby jest w trakcie konfiguracji.</p>
    </div>
  );
}
