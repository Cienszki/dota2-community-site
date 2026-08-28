'use client';

import { useEffect } from 'react';
import type Lenis from 'lenis';

// Smooth scrolling, driven only while there is scrolling to smooth.
//
// The loop used to be unconditional: one `requestAnimationFrame` per frame, for
// the life of every page, whether or not anything was moving. That is 60 calls
// a second on an ordinary display and 120 on a ProMotion MacBook, each one
// running Lenis's interpolation over a scroll position that had not changed —
// and it is on the main thread, so it competes with everything the page does.
//
// Now the loop starts on the events that can begin a scroll and stops once
// Lenis reports it has settled. Every uncertain case errs towards running: an
// unrecognised input still starts it via the native `scroll` listener, and the
// idle tail means momentum is never cut short.

/** How long Lenis must report "not scrolling" before the loop is allowed to stop. */
const IDLE_BEFORE_STOP_MS = 700;

export default function SmoothScroll() {
  useEffect(() => {
    let lenis: Lenis | undefined;
    let frameId: number | undefined;
    let cancelled = false;
    let idleSince: number | null = null;
    let cleanupListeners: (() => void) | undefined;

    import('lenis').then(({ default: LenisConstructor }) => {
      if (cancelled) return;

      lenis = new LenisConstructor({
        duration: 1.1,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      });

      const raf = (time: number) => {
        if (cancelled || !lenis) return;
        lenis.raf(time);

        // `isScrolling` covers the whole gesture including the eased tail, so
        // the extra idle window on top is pure margin against a frame where it
        // flickers false mid-scroll.
        if (lenis.isScrolling) {
          idleSince = null;
        } else if (idleSince === null) {
          idleSince = time;
        } else if (time - idleSince > IDLE_BEFORE_STOP_MS) {
          frameId = undefined;
          return;
        }

        frameId = requestAnimationFrame(raf);
      };

      const wake = () => {
        if (cancelled) return;
        idleSince = null;
        if (frameId === undefined) frameId = requestAnimationFrame(raf);
      };

      // Everything that can start a scroll, including the ones that bypass
      // Lenis's own input handling — a scrollbar drag, an anchor jump, a
      // `scrollTo` from elsewhere in the app.
      const events: Array<[EventTarget, string]> = [
        [window, 'wheel'],
        [window, 'touchstart'],
        [window, 'touchmove'],
        [window, 'keydown'],
        [window, 'pointerdown'],
        [window, 'scroll'],
        [window, 'resize'],
        [window, 'hashchange'],
      ];
      for (const [target, name] of events) {
        target.addEventListener(name, wake, { passive: true });
      }

      // One pass on mount so Lenis measures the document before any input.
      wake();

      cleanupListeners = () => {
        for (const [target, name] of events) target.removeEventListener(name, wake);
      };
    });

    return () => {
      cancelled = true;
      cleanupListeners?.();
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      lenis?.destroy();
    };
  }, []);

  return null;
}
