import Navbar from '@/components/Navbar';
import ClientLightPillar from '@/components/ClientLightPillar';
import SmoothScroll from '@/components/SmoothScroll';

// Shared page shell for every inhouse surface, so they sit inside the exact
// same background pillar + navbar frame as the rest of the site (see
// src/app/[slug]/page.tsx and ranking/page.tsx). Keeps the inhouse section
// visually indistinguishable from the pages that already exist.

const WIDTHS = {
  narrow: 'max-w-3xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
} as const;

export default function InhouseShell({
  children,
  width = 'wide',
}: {
  children: React.ReactNode;
  width?: keyof typeof WIDTHS;
}) {
  return (
    <main className="relative bg-[#050505] text-slate-100 overflow-x-hidden min-h-screen">
      <SmoothScroll />

      {/* BACKGROUND — identical settings to the rest of the site */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
        <ClientLightPillar
          topColor="#ff0000"
          bottomColor="#ff5500"
          intensity={0.7}
          rotationSpeed={0.2}
          glowAmount={0.002}
          pillarWidth={2.5}
          pillarHeight={0.3}
          noiseIntensity={0.5}
          pillarRotation={90}
          interactive={false}
          mixBlendMode="screen"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505]" />
      </div>

      <Navbar />

      <section className={`relative z-10 ${WIDTHS[width]} mx-auto px-6 pt-[30px] pb-20`}>
        {children}
      </section>
    </main>
  );
}
