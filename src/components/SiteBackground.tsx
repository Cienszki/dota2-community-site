import Image from 'next/image';

// Replaces the old WebGL LightPillar effect (a raymarched shader background,
// see git history) with a static image — same visual role (a dim, decorative
// backdrop behind every page's content), none of the GPU cost. Every caller
// used to copy-paste the same wrapper + gradient fade around the pillar, so
// that shape is folded into one component here instead.
//
// The image sits in a `fixed inset-0` layer rather than filling this
// component's own (page-height) container: pages that mount this are `main`
// elements sized to their content, not the viewport, so an `absolute inset-0`
// image would stretch across the full scrollable height instead of just
// covering the screen — see the same reasoning previously in LightPillar.tsx.
export default function SiteBackground() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none opacity-60 overflow-hidden">
      <div className="fixed inset-0">
        <Image
          src="/images/bg.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505]" />
    </div>
  );
}
