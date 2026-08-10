import Image from 'next/image';
import { Medal } from 'lucide-react';
import type { InhouseProfile } from '@/lib/inhouse/profile';
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
                  <Medal className="w-3.5 h-3.5" style={{ color: rankColour(profile.rank) }} />
                  <span className="text-slate-200 font-semibold">#{profile.rank}</span>
                  <span>w rankingu</span>
                </span>
              </>
            )}
          </p>
        </div>

        <Medals />
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
 * The medal shelf.
 *
 * Empty by construction: the per-player numbers medals will be derived from are
 * already being collected, but the categories themselves are an open product
 * decision (see docs/inhouse-status.md). The slot is here so adding them later
 * is a render change and not a layout one — and so the absence is visible
 * rather than forgotten.
 */
function Medals() {
  return (
    <div className="ml-auto hidden sm:block text-right">
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-600">Medale</div>
      <p className="mt-1 text-sm text-slate-600">Wkrótce</p>
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
