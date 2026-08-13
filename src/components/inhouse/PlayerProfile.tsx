import Image from 'next/image';
import {
  Trophy, Flame, Star, Shield, Crown, Target, Zap, Heart, Coins, Eye, Clock, Swords,
} from 'lucide-react';
import type { InhouseProfile } from '@/lib/inhouse/profile';
import type { Medal } from '@/lib/inhouse/medals';
import MatchHistory from './ProfileMatchHistory';
import MedalStrip from './MedalStrip';

// The profile that takes the "how to join" slot once a viewer has linked.
//
// Those three steps only earn their space the first time somebody reads them;
// after that the same strip above the lobbies is better spent on what the
// person has actually done. So this is a *replacement*, not an addition — the
// page keeps its shape and nothing below moves.
//
// Renders as two siblings rather than a wrapping <section>: identity + badges,
// then the match history. The page owns the grid they sit in, because the third
// column beside them (the Puls gauge) has to line up with both, and it is not
// this component's business. Mobile stacking is the grid's job too.
//
// The win rate here is a deliberate narrowing of §8.1's "participation, never
// performance", asked for by the designer and consistent with the K/D/A on the
// match rows below it. The line that still holds is *comparison*: this is your
// own number on your own profile, it appears on no leaderboard, and it is not
// shown for anybody else. Adding it to Top gracze would cross the rule that
// §8.1 actually exists to protect.

export default function PlayerProfile({ profile }: { profile: InhouseProfile }) {
  const { steam } = profile;

  return (
    <>
      <div>
        <div className="flex items-center gap-4">
          <Avatar src={steam?.avatarFull ?? steam?.avatarMedium ?? null} name={profile.displayName} />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 className="truncate text-xl font-black text-white">{profile.displayName}</h2>
              {profile.rank !== null && (
                <span
                  className="shrink-0 text-sm font-black"
                  style={{ color: rankColour(profile.rank) }}
                >
                  #{profile.rank} w rankingu
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-400">
              <span className="font-semibold tabular-nums text-slate-200">{profile.gamesPlayed}</span>{' '}
              {gamesWord(profile.gamesPlayed)}
              {profile.winRate !== null && (
                <>
                  {' · '}
                  <span className="font-semibold tabular-nums text-emerald-300">
                    {profile.winRate}%
                  </span>{' '}
                  winrate
                </>
              )}
            </p>
          </div>
        </div>

        <Medals medals={profile.medals} />
      </div>

      <MatchHistory matches={profile.matches} />
    </>
  );
}

/**
 * Steam avatar.
 *
 * Unoptimised: these are already 184px squares served from Steam's own CDN, so
 * routing them through the image optimizer buys nothing and costs a
 * transformation. Falls back to an initial rather than a broken image, since a
 * private profile or a failed fetch is normal.
 */
function Avatar({ src, name }: { src: string | null; name: string }) {
  if (!src) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-2xl font-black text-slate-500">
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={64}
      height={64}
      unoptimized
      className="h-16 w-16 shrink-0 rounded-full border border-white/10 object-cover"
    />
  );
}

/**
 * The badge shelf, under the name rather than beside it (v5).
 *
 * Every badge here is a full `MedalBadge`, the same one the leaderboards and
 * Top gracze use. It used to be a local `MedalChip` whose hover was a one-line
 * text tooltip — which meant the artwork, which is the whole point of a medal,
 * was only ever visible somewhere else. No cap: this is the owner's own shelf,
 * and the one place every badge earns its space.
 */
function Medals({ medals }: { medals: Medal[] }) {
  if (medals.length === 0) {
    return <p className="mt-5 text-sm text-slate-600">Jeszcze żadnych odznak.</p>;
  }

  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-600">Odznaki</div>
      <MedalStrip medals={medals} max={medals.length} size={34} className="gap-2.5" />
    </div>
  );
}

/** Polish plural: 1 gra, 2–4 gry, 5+ gier — with the teens exception. */
function gamesWord(n: number): string {
  if (n === 1) return 'gra';
  const last = n % 10;
  const teen = n % 100 >= 12 && n % 100 <= 14;
  return !teen && last >= 2 && last <= 4 ? 'gry' : 'gier';
}

function rankColour(rank: number): string {
  return ['#fbbf24', '#cbd5e1', '#d97706'][rank - 1] ?? '#64748b';
}
