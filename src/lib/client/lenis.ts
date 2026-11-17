'use client';

import Lenis from 'lenis';
import { getGsap } from '@/lib/client/gsap';
import { prefersReducedMotion } from '@/lib/client/use-reduced-motion';

// Satu-satunya pintu Lenis (CLAUDE.md §6). Hanya ada satu instance per halaman.
let instance: Lenis | null = null;
let lockCount = 0;

const ANCHOR_OFFSET = -96;

/** Menyalakan smooth scroll. Mengembalikan fungsi pembersih. No-op saat reduced motion. */
export function startSmoothScroll(): () => void {
  if (instance || prefersReducedMotion()) return () => {};
  const { gsap, ScrollTrigger } = getGsap();
  const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
  instance = lenis;
  document.documentElement.classList.add('smooth-on');

  lenis.on('scroll', ScrollTrigger.update);
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  if (lockCount > 0) lenis.stop();

  return () => {
    gsap.ticker.remove(tick);
    lenis.destroy();
    document.documentElement.classList.remove('smooth-on');
    if (instance === lenis) instance = null;
  };
}

/** Scroll ke elemen, selector id, atau posisi piksel. Tanpa Lenis memakai scroll bawaan. */
export function scrollToTarget(target: HTMLElement | number, duration = 1.5): void {
  const isTop = target === 0;
  if (instance) {
    instance.scrollTo(target, { offset: isTop ? 0 : ANCHOR_OFFSET, duration });
    return;
  }
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
  if (typeof target === 'number') {
    window.scrollTo({ top: target, behavior });
    return;
  }
  const top = target.getBoundingClientRect().top + window.scrollY + ANCHOR_OFFSET;
  window.scrollTo({ top, behavior });
}

/**
 * Mengunci scroll halaman saat modal/drawer terbuka. Dihitung per pemanggil,
 * supaya modal yang dibuka dari dalam drawer tidak membuka kunci terlalu cepat.
 */
export function lockScroll(): () => void {
  lockCount += 1;
  if (lockCount === 1) {
    document.body.style.overflow = 'hidden';
    instance?.stop();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = '';
      instance?.start();
    }
  };
}
