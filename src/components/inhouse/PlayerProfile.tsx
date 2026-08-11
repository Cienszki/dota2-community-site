import Image from 'next/image';
import {
  Trophy, Flame, Star, Shield, Crown, Target, Zap, Heart, Coins, Eye, Clock, Swords,
} from 'lucide-react';
import type { InhouseProfile } from '@/lib/inhouse/profile';
import { medalTooltip, placeColour, type Medal } from '@/lib/inhouse/medals';
import MatchHistory from './ProfileMatchHistory';
import MedalIcons from './MedalIcons';

// The profile that takes the "how to join" slot once a viewer has linked.
//
// Those three steps only earn their space the first time somebody reads them;
// after that the same strip above the lobbies is better spent on what the
// person has actually done. So this is a *replacement*, not an addition — the
// page keeps its shape and nothing below moves.
//
// Two-column hero (identity + badges on the left, recent matches on the
// right), stacking to one column on mobile — the v5 redesign's layout.
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
    <section className="mt-10">
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,340px)_1fr] items-start">
        <div>
          <div className="flex items-center gap-4">
            <Avatar src={steam?.avatarFull ?? steam?.avatarMedium ?? null} name={profile.displayName} />

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="text-xl font-black text-white truncate">{profile.displayName}</h2>
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
                <span className="text-slate-200 font-semibold tabular-nums">{profile.gamesPlayed}</span>{' '}
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
      </div>
    </section>
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
 * Icons rather than artwork, because the artwork does not exist yet — `imageUrl`
 * is honoured when it is set, so filling that in later needs no change here.
 * Colour carries the podium place, which is the only ranking information a
 * medal exposes: which award, and whether it was first, second or third.
 */
function Medals({ medals }: { medals: Medal[] }) {
  if (medals.length === 0) {
    return <p className="mt-5 text-sm text-slate-600">Jeszcze żadnych odznak.</p>;
  }

  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-600">Odznaki</div>
      <ul className="grid grid-cols-[repeat(auto-fill,34px)] gap-2.5">
        {medals.map((medal) => (
          <li key={medal.id}>
            <MedalChip medal={medal} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A single badge, with a hover tooltip in place of the old native `title`.
 *
 * Pure CSS (`group`/`group-hover`) rather than hover state in JS — no
 * client component needed to show a label on hover.
 */
function MedalChip({ medal }: { medal: Medal }) {
  const colour = placeColour(medal.place);
  const tooltip = medalTooltip(medal);

  return (
    <span
      aria-label={tooltip}
      className="group relative flex h-[34px] w-[34px] items-center justify-center rounded-full border transition-colors"
      style={{ borderColor: `${colour}66`, backgroundColor: `${colour}1f` }}
    >
      {medal.imageUrl ? (
        <Image src={medal.imageUrl} alt="" width={20} height={20} unoptimized className="h-5 w-5" />
      ) : (
        <MedalIcons icon={medal.icon} className="h-4 w-4" style={{ color: colour }} />
      )}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap
                   rounded-md border border-white/15 bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white
                   opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100"
      >
        {tooltip}
      </span>
    </span>
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
