'use client';

import { useRef } from 'react';
import { useGsap } from '@/lib/client/gsap';
import { attachSpotlight } from '@/lib/client/spotlight';

/**
 * Gerak untuk halaman aplikasi yang BUKAN halaman transaksi (/check, /bridge, /proof,
 * /contracts): sorotan pointer di panel, dan panel di bawah lipatan naik saat tergulir masuk.
 * Konten di atas lipatan memakai kelas CSS `.rise`, jadi tidak pernah berkedip saat hidrasi.
 * `useGsap` tidak berjalan saat prefers-reduced-motion. Tidak dipasang di /t dan /launch.
 */
export function AppMotion() {
  const anchor = useRef<HTMLSpanElement>(null);
  useGsap(anchor, ({ gsap, ScrollTrigger, scope }) => {
    const main = scope.closest('main');
    if (!main) return;
    const detach = attachSpotlight(main, '.app-panel, .token-card');
    const below = Array.from(main.querySelectorAll<HTMLElement>('[data-reveal]')).filter(
      (element) => element.getBoundingClientRect().top > window.innerHeight,
    );
    const triggers = below.map((element) => {
      // Animasi CSS `.rise` (fill `both`) menimpa style inline, jadi dilepas dulu dari elemen
      // yang masuknya diatur ScrollTrigger.
      element.classList.remove('rise');
      gsap.set(element, { autoAlpha: 0, y: 22 });
      return ScrollTrigger.create({
        trigger: element,
        start: 'top 88%',
        once: true,
        onEnter: () => gsap.to(element, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out', clearProps: 'all' }),
      });
    });
    return () => {
      detach();
      triggers.forEach((trigger) => trigger.kill());
      // Elemen berada di luar scope context GSAP, jadi dikembalikan terlihat secara eksplisit.
      gsap.set(below, { clearProps: 'all' });
    };
  });
  return <span ref={anchor} hidden />;
}
