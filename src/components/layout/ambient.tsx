'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { scrollToTarget, startSmoothScroll } from '@/lib/client/lenis';
import { prefersReducedMotion } from '@/lib/client/use-reduced-motion';

// Urutan chapter mengikuti section landing; indeksnya tampil di SideIndex.
const CHAPTERS = [
  'top',
  'vision',
  'architecture',
  'explore',
  'check',
  'security',
  'graduation',
  'launch',
  'bridge',
  'proof',
  'contracts',
] as const;

/**
 * Elemen ambient seluruh halaman: garis progres baca, indeks chapter (desktop),
 * cursor aura (pointer fine), tombol kembali ke atas, dan smooth scroll + anchor.
 */
export function Ambient() {
  const progressRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);
  const [chapter, setChapter] = useState('00');
  const [showTop, setShowTop] = useState(false);

  // Smooth scroll (Lenis) + tautan anchor dengan offset nav.
  useEffect(() => {
    const stop = startSmoothScroll();
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = new URL(anchor.href, window.location.href);
      // Hanya anchor di halaman yang sama; tautan ke route lain dibiarkan ke browser/Next.
      if (url.pathname !== window.location.pathname || url.hash.length < 2) return;
      const id = decodeURIComponent(url.hash.slice(1));
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      scrollToTarget(id === 'top' ? 0 : target);
      window.history.replaceState(null, '', url.hash);
    };
    // Fase capture: preventDefault harus terjadi sebelum handler <Link> Next berjalan,
    // supaya Next tidak ikut menavigasi/menggulir ke hash yang sama.
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      stop();
    };
  }, []);

  // Progres baca + tombol kembali ke atas.
  useEffect(() => {
    let busy = false;
    const update = () => {
      busy = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${ratio})`;
      setShowTop(window.scrollY > 600);
    };
    const onScroll = () => {
      if (busy) return;
      busy = true;
      requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Penanda chapter berdasarkan section yang sedang dibaca.
  useEffect(() => {
    const targets = CHAPTERS.map((id) => document.getElementById(id)).filter(
      (node): node is HTMLElement => node !== null,
    );
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = CHAPTERS.indexOf(entry.target.id as (typeof CHAPTERS)[number]);
          if (index >= 0) setChapter(String(index).padStart(2, '0'));
        }
      },
      { rootMargin: '-25% 0px -60% 0px' },
    );
    targets.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  // Cursor aura: hanya pointer fine dan bukan reduced motion.
  useEffect(() => {
    const aura = auraRef.current;
    if (!aura || prefersReducedMotion() || !window.matchMedia('(pointer:fine)').matches) return;
    let cursorX = window.innerWidth / 2;
    let cursorY = window.innerHeight / 2;
    let auraX = cursorX;
    let auraY = cursorY;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cursorX = event.clientX;
      cursorY = event.clientY;
      aura.style.opacity = '.9';
    };
    const tick = () => {
      auraX += (cursorX - auraX) * 0.1;
      auraY += (cursorY - auraY) * 0.1;
      aura.style.left = `${auraX}px`;
      aura.style.top = `${auraY}px`;
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div className="cursor-aura" ref={auraRef} aria-hidden="true" />
      <div className="scroll-progress" ref={progressRef} aria-hidden="true" />
      <div className="v3-side-index" aria-hidden="true">
        <span>XOFN / FIELD NOTES</span>
        <i />
        <strong>{chapter}</strong>
        <span>IN MOTION</span>
      </div>
      <button
        className={cn('scrollTop', showTop && 'show')}
        type="button"
        aria-label="Back to top"
        onClick={() => scrollToTarget(0, 1.6)}
      >
        ↑
      </button>
    </>
  );
}
