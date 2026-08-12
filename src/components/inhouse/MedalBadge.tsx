import MedalArt from './MedalArt';
import { placeColour, type Medal } from '@/lib/inhouse/medals';

// A medal badge that reveals its full artwork and name on hover — the small
// circle everywhere (Top gracze, the leaderboards' Najwięcej gier column) is a
// glance, not the whole story, so the rest lives in a hover card instead of a
// browser tooltip that truncates and can't show the art.
//
// CSS-only (`group`/`group-hover`), not JS state: hover-to-reveal has no
// reason to round-trip through React for something this simple.

export default function MedalBadge({ medal, size }: { medal: Medal; size: number }) {
  const colour = placeColour(medal.place);

  return (
    <span className="group/medal relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex cursor-pointer items-center justify-center rounded-full border"
        style={{
          width: size,
          height: size,
          borderColor: `${colour}66`,
          backgroundColor: `${colour}1f`,
        }}
      >
        <MedalArt id={medal.id} icon={medal.icon} size={size} colour={colour} />
      </span>

      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 flex -translate-x-1/2 flex-col items-center gap-2 whitespace-nowrap
                   rounded-xl border border-white/15 bg-[#0f0f10] px-[18px] py-3.5 opacity-0 shadow-2xl transition-opacity
                   duration-150 group-hover/medal:opacity-100"
      >
        <span
          className="h-24 w-24 shrink-0 overflow-hidden rounded-full border"
          style={{ borderColor: `${colour}66`, backgroundColor: `${colour}1f` }}
        >
          <MedalArt id={medal.id} icon={medal.icon} size={96} colour={colour} />
        </span>
        <span className="text-sm font-black text-white">{medal.label}</span>
        {medal.description && (
          <span className="max-w-[220px] whitespace-normal text-center text-xs text-slate-400">
            {medal.description}
          </span>
        )}
      </span>
    </span>
  );
}
