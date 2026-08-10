import Image from 'next/image';
import {
  Medal as MedalIcon,
  Trophy, Flame, Star, Shield, Crown, Target, Zap, Heart, Coins, Eye, Clock, Swords,
} from 'lucide-react';
import type { InhouseProfile } from '@/lib/inhouse/profile';
import { medalTooltip, placeColour, type Medal } from '@/lib/inhouse/medals';
import MatchHistory from './ProfileMatchHistory';

// The profile that takes the "how to join" slot once a viewer has linked.
//
// Those three steps only earn their space the first time somebody reads them;
// after that the same strip above the lobbies is better spent on what the
// person has actually done. So this is a *replacement*, not an addition — the
// page keeps its shape and nothing below moves.
//
// Deliberately borderless. The rest of the page separates sections with
// whitespace and a single hairline rule, and boxing this would make it the
// loudest thing above the lobby cards, which is not what it is for.

export default function PlayerProfile({ profile }: { profile: InhouseProfile }) {
  const { steam } = profile;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <Avatar src={steam?.avatarFull ?? steam?.avatarMedium ?? null} name={profile.displayName} />

        <div className="min-w-0">
          <h2 className="text-2xl font-black text-white truncate">{profile.displayName}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-slate-400">
            <span className="text-slate-200 font-semibold tabular-nums">
              {profile.gamesPlayed}
            </span>
            {gamesWord(profile.gamesPlayed)}
            {profile.rank !== null && (
              <>
                <span className="text-slate-700">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <MedalIcon className="w-3.5 h-3.5" style={{ color: rankColour(profile.rank) }} />
                  <span className="text-slate-200 font-semibold">#{profile.rank}</span>
                  <span>w rankingu</span>
                </span>
              </>
            )}
          </p>
        </div>

        <Medals medals={profile.medals} />
      </div>

      <MatchHistory matches={profile.matches} />
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
 * Icon components the awarding task may name.
 *
 * Closed set: a medal record is written by a task, and letting it reference an
 * arbitrary component would mean a typo renders nothing at all. Unknown keys
 * fall back to a trophy rather than vanishing.
 */
const ICONS: Record<string, typeof Trophy> = {
  trophy: Trophy, flame: Flame, star: Star, shield: Shield,
  crown: Crown, target: Target, zap: Zap, heart: Heart,
  coins: Coins, eye: Eye, clock: Clock, swords: Swords,
};

/**
 * The medal shelf.
 *
 * Icons rather than artwork, because the artwork does not exist yet — `imageUrl`
 * is honoured when it is set, so filling that in later needs no change here.
 * Colour carries the podium place, which is the only ranking information a
 * medal exposes: which award, and whether it was first, second or third.
 */
function Medals({ medals }: { medals: Medal[] }) {
  if (medals.length === 0) {
    return (
      <div className="ml-auto hidden text-right sm:block">
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-600">Medale</div>
        <p className="mt-1 text-sm text-slate-600">Jeszcze żadnych</p>
      </div>
    );
  }

  return (
    <div className="ml-auto">
      <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-600 sm:text-right">
        Medale
      </div>
      <ul className="flex flex-wrap gap-1.5 sm:justify-end">
        {medals.map((medal) => (
          <li key={medal.id}>
            <MedalChip medal={medal} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MedalChip({ medal }: { medal: Medal }) {
  const colour = placeColour(medal.place);
  const Icon = ICONS[medal.icon] ?? Trophy;
  const tooltip = medalTooltip(medal);

  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
      style={{ borderColor: `${colour}66`, backgroundColor: `${colour}1f` }}
    >
      {medal.imageUrl ? (
        <Image src={medal.imageUrl} alt="" width={20} height={20} unoptimized className="h-5 w-5" />
      ) : (
        <Icon className="h-4 w-4" style={{ color: colour }} />
      )}
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
