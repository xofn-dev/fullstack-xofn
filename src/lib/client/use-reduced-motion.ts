'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

// Dipakai juga oleh modul non-React (GSAP, Lenis) agar keputusan reduced motion konsisten.
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useReducedMotion(): boolean {
  // Di server dianggap false; klien mengoreksi setelah hydration tanpa mismatch markup,
  // karena nilai ini hanya dipakai di dalam effect.
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
