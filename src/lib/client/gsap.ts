'use client';

import { useEffect, type DependencyList, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '@/lib/client/use-reduced-motion';

// Satu-satunya pintu GSAP + ScrollTrigger (CLAUDE.md §6). Plugin didaftarkan sekali saja.
let registered = false;

export function getGsap(): { gsap: typeof gsap; ScrollTrigger: typeof ScrollTrigger } {
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
  return { gsap, ScrollTrigger };
}

export type GsapSetup = (tools: {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
  scope: HTMLElement;
}) => void | (() => void);

/**
 * Menjalankan animasi di dalam gsap.context() dan me-revert semuanya saat unmount,
 * sehingga navigasi App Router tidak meninggalkan tween atau ScrollTrigger yatim.
 * Tidak berjalan sama sekali saat prefers-reduced-motion.
 */
export function useGsap(
  scope: RefObject<HTMLElement | null>,
  setup: GsapSetup,
  deps: DependencyList = [],
): void {
  useEffect(() => {
    const element = scope.current;
    if (!element || prefersReducedMotion()) return;
    const tools = getGsap();
    let cleanup: void | (() => void);
    const context = tools.gsap.context(() => {
      cleanup = setup({ ...tools, scope: element });
    }, element);
    return () => {
      if (cleanup) cleanup();
      context.revert();
    };
    // Dependency dikelola pemanggil, sama seperti useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
