'use client';

import { useEffect } from 'react';
import type Lenis from 'lenis';

export default function SmoothScroll() {
  useEffect(() => {
    let lenis: Lenis | undefined;
    let frameId: number | undefined;
    let cancelled = false;

    // Dynamic import so `lenis` ships as its own chunk instead of being
    // bundled into every route's initial JS — it's only ever used here.
    import('lenis').then(({ default: LenisConstructor }) => {
      if (cancelled) return;

      lenis = new LenisConstructor({
        duration: 1.1,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      });

      const raf = (time: number) => {
        lenis?.raf(time);
        frameId = requestAnimationFrame(raf);
      };
      frameId = requestAnimationFrame(raf);
    });

    return () => {
      cancelled = true;
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      lenis?.destroy();
    };
  }, []);

  return null;
}
