import MedalBadge from './MedalBadge';
import MedalArt from './MedalArt';
import { placeColour, type Medal } from '@/lib/inhouse/medals';

// A row of medals with a cap, and a "+4" chip standing in for whatever did not
// fit.
//
// The chip exists because a silently truncated row lies: someone with eleven
// medals and someone with exactly the four on show looked identical, and the
// person with eleven is precisely the person the row is meant to flatter.
//
// It hovers like a real badge rather than being dead weight — same card, the
// leftovers listed by name. Anywhere a medal is drawn on this site it answers
// what it is on hover, and an overflow chip that stayed silent would be the one
// hole in that.

export default function MedalStrip({
  medals,
  max,
  size,
  className = '',
}: {
  medals: Medal[];
  /** How many badges to draw before collapsing the rest into the chip. */
  max: number;
  size: number;
  className?: string;
}) {
  if (medals.length === 0) return null;

  // With exactly one over the cap, the chip would say "+1" in the space the
  // medal itself would have taken — so just draw the medal.
  const showAll = medals.length <= max + 1;
  const shown = showAll ? medals : medals.slice(0, max);
  const hidden = showAll ? [] : medals.slice(max);

  return (
    <span className={`flex flex-wrap items-center gap-[7px] ${className}`}>
      {shown.map((medal) => (
        <MedalBadge key={medal.id} medal={medal} size={size} />
      ))}
      {hidden.length > 0 && <OverflowChip medals={hidden} size={size} />}
    </span>
  );
}

function OverflowChip({ medals, size }: { medals: Medal[]; size: number }) {
  return (
    <span className="group/medal relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex cursor-pointer items-center justify-center rounded-full border border-white/15
                   bg-white/[0.06] font-black text-slate-300 transition-colors group-hover/medal:text-white"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      >
        +{medals.length}
      </span>

      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 flex w-max max-w-[260px] -translate-x-1/2
                   flex-col gap-2 rounded-xl border border-white/15 bg-[#0f0f10] px-[18px] py-3.5 opacity-0
                   shadow-2xl transition-opacity duration-150 group-hover/medal:opacity-100"
      >
        {medals.map((medal) => {
          const colour = placeColour(medal.place);
          return (
            <span key={medal.id} className="flex items-center gap-2.5">
              <span
                className="h-7 w-7 shrink-0 overflow-hidden rounded-full border"
                style={{ borderColor: `${colour}66`, backgroundColor: `${colour}1f` }}
              >
                <MedalArt id={medal.id} icon={medal.icon} size={28} colour={colour} />
              </span>
              <span className="text-xs font-bold text-white">{medal.label}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
