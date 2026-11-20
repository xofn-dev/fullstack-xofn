'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { getGsap } from '@/lib/client/gsap';
import {
  getHeroState,
  hasIntroBooted,
  markIntroBooted,
  markIntroDone,
  subscribeHeroState,
  type HeroSceneState,
} from '@/lib/client/intro';
import { scrollToTarget } from '@/lib/client/lenis';
import { prefersReducedMotion } from '@/lib/client/use-reduced-motion';

const SEEN_KEY = 'xofn:intro-seen';
/** Boot minimal sejak navigasi dimulai, supaya koin sempat terlihat berputar. */
const MIN_BOOT_MS = 1400;
/** Batas tunggu scene hero; setelah itu loader tetap membuka (scene menyusul sendiri). */
const MAX_WAIT_MS = 7000;
/** Kemiringan rig saat split. Harus sama dengan `rotateX(-62deg)` pada `.il-label`. */
const TILT = 62;
const EDGES = 10;

// Ilustrasi tier Standard (2+1/2): dua DVN wajib, dua opsional dan satu di antaranya dipakai.
const PLATES = [
  { opt: false, lit: true, label: 'REQUIRED' },
  { opt: false, lit: true, label: 'REQUIRED' },
  { opt: true, lit: true, label: 'OPTIONAL' },
  { opt: true, lit: false, label: 'OPTIONAL' },
] as const;

const SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

/**
 * Menahan scroll selama loader tanpa menyentuh `overflow` body. Mengubah overflow menggeser
 * lebar layout (scrollbar) saat ScrollTrigger landing sedang dibangun, dan pada URL ber-hash
 * itu membuat refresh ScrollTrigger gagal. Wheel/touch dihentikan di overlay (tidak sampai Lenis).
 */
function blockScroll(root: HTMLElement): () => void {
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onKey = (e: KeyboardEvent) => {
    if (SCROLL_KEYS.has(e.key) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
  };
  root.addEventListener('wheel', stop, { passive: false });
  root.addEventListener('touchmove', stop, { passive: false });
  window.addEventListener('keydown', onKey, { capture: true });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    root.removeEventListener('wheel', stop);
    root.removeEventListener('touchmove', stop);
    window.removeEventListener('keydown', onKey, { capture: true });
  };
}

const STEP_COPY: Record<'fonts' | HeroSceneState, string> = {
  fonts: 'LOADING TYPE',
  idle: 'LOADING 3D ENGINE',
  mounting: 'WARMING UP SCENE',
  ok: 'READY',
  fail: 'READY · STATIC SCENE',
};

/**
 * Intro landing "Never one of one": koin berputar selama aset dimuat → koin terbelah
 * memperlihatkan pelat DVN (dan pelat 1/1 yang ditolak) → kamera menyelam ke lubang
 * tengah dan iris membuka landing. Hanya diputar penuh sekali per sesi; navigasi klien
 * kembali ke `/` tidak menampilkannya lagi. Reduced motion: fade singkat saja.
 */
export function IntroLoader({ status }: { status: { label: string; flag: string } }) {
  // Modul `intro` direset tiap pemuatan dokumen, jadi SSR dan hydration pertama selalu sepakat.
  const [visible, setVisible] = useState(() => !hasIntroBooted());
  const rootRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLElement>(null);
  const stepRef = useRef<HTMLElement>(null);
  // Diputuskan sekali per instance: StrictMode menjalankan effect dua kali.
  const planRef = useRef<{ short: boolean } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    markIntroBooted();
    root.classList.add('is-js');

    if (!planRef.current) {
      let seen = false;
      try {
        seen = window.sessionStorage.getItem(SEEN_KEY) === '1';
        window.sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        // storage diblokir: perlakukan sebagai kunjungan pertama
      }
      planRef.current = { short: seen || window.location.hash.length > 1 };
    }
    const reduced = prefersReducedMotion();
    const short = planRef.current.short;
    const unlock = blockScroll(root);
    const { gsap } = getGsap();
    const ctx = gsap.context(() => {}, root);
    const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
    const $$ = <T extends Element = HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));

    let disposed = false;
    let leaving = false;
    let raf = 0;
    let fadeTimer = 0;
    let timeline: gsap.core.Timeline | null = null;

    const finish = () => {
      if (disposed) return;
      markIntroDone();
      unlock();
      setVisible(false);
    };

    /* ---- progres jujur: font siap, chunk hero termuat, frame pertama scene ---- */
    let fontsReady = false;
    void document.fonts.ready.then(() => {
      fontsReady = true;
    });
    let hero = getHeroState();
    const unsubscribe = subscribeHeroState((state) => {
      hero = state;
    });
    const started = performance.now();
    let shown = 0;
    const target = () =>
      (fontsReady ? 0.3 : 0) + (hero !== 'idle' ? 0.35 : 0) + (hero === 'ok' || hero === 'fail' ? 0.35 : 0);

    const reveal = () => {
      // URL ber-hash: layout landing baru selesai tumbuh (galaxy, section sticky) setelah load,
      // jadi lompat ke anchor tepat sebelum iris membuka, saat posisi akhirnya sudah benar.
      const id = decodeURIComponent(window.location.hash.slice(1));
      const anchor = id ? document.getElementById(id) : null;
      if (anchor && !root.classList.contains('is-revealing')) scrollToTarget(anchor, 0);
      root.classList.add('is-revealing');
      return Math.hypot(window.innerWidth, window.innerHeight) / 2 + 140;
    };

    const shortExit = () => {
      timeline?.kill();
      const radius = reveal();
      ctx.add(() => {
        timeline = gsap
          .timeline({ onComplete: finish })
          .to($$('.il-meta,.il-status,.il-skip,.il-tagline'), { opacity: 0, duration: 0.25 }, 0)
          .to($('.il-stage'), { scale: 1.4, opacity: 0, duration: 0.55, ease: 'power2.in' }, 0)
          .to($('.il-rim'), { opacity: 1, duration: 0.15 }, 0.1)
          .to(root, { '--il-r': `${radius}px`, duration: 0.75, ease: 'power2.inOut' }, 0.12)
          .call(markIntroDone, [], 0.2)
          .to($('.il-rim'), { opacity: 0, duration: 0.25 }, 0.7);
      });
    };

    const fullExit = () => {
      const stage = $('.il-stage');
      const spin = $('.il-spin');
      const rig = $('.il-rig');
      const cam = $('.il-cam');
      if (!stage || !spin || !rig || !cam) return shortExit();
      const coin = stage.offsetWidth;
      const gap = coin * 0.24;
      const thick = coin * 0.055;

      // Ambil sudut putar CSS saat ini, lalu GSAP melanjutkannya sampai koin menghadap depan.
      let angle = 0;
      try {
        const m = new DOMMatrixReadOnly(getComputedStyle(spin).transform);
        angle = (Math.atan2(-m.m13, m.m11) * 180) / Math.PI;
      } catch {
        angle = 0;
      }
      if (angle < 0) angle += 360;
      const settle = angle > 220 ? 720 : 360;
      rig.style.transform = getComputedStyle(rig).transform;
      rig.style.animation = 'none';
      spin.style.animation = 'none';

      const plates = $$('.il-plate');
      const discs = $$('.il-disc');
      const reject = $('.il-reject');
      const words = $$('.il-tagline span');
      const radius = Math.hypot(window.innerWidth, window.innerHeight) / 2 + 140;

      ctx.add(() => {
        gsap.set(spin, { rotationY: angle });
        gsap.set($('.il-face.front'), { z: thick, rotationY: 0 });
        // Setelah miring, muka belakang menghadap ke bawah: tetap digambar supaya belahan bawah terlihat.
        gsap.set($('.il-face.back'), { z: -thick, rotationY: 180, backfaceVisibility: 'visible' });
        gsap.set(plates, { z: 0 });

        const tl = gsap.timeline({ onComplete: finish });
        timeline = tl;
        tl.to(spin, { rotationY: settle, duration: 0.8, ease: 'power3.out' }, 0)
          .to($$('.il-ring,.il-status'), { opacity: 0, scale: 1.08, duration: 0.4, ease: 'power2.out' }, 0)
          .to(rig, { rotationX: TILT, y: -coin * 0.08, duration: 0.95, ease: 'power3.inOut' }, 0.3)
          .to($$('.il-edge'), { opacity: 0, duration: 0.3 }, 0.6)
          .to($('.il-face.front'), { z: gap * 2.7, duration: 0.95, ease: 'expo.out' }, 0.72)
          .to($('.il-face.back'), { z: -gap * 2.7, duration: 0.95, ease: 'expo.out' }, 0.72)
          .to(discs, { opacity: 1, duration: 0.4, stagger: 0.05 }, 0.76)
          .call(() => root.classList.add('is-split'), [], 0.95);
        plates.forEach((plate, i) => {
          tl.to(plate, { z: (1.5 - i) * gap, duration: 0.95, ease: 'expo.out' }, 0.76 + i * 0.05);
        });
        PLATES.forEach((p, i) => {
          if (p.lit) tl.call(() => plates[i]?.classList.add('is-on'), [], 1.05 + i * 0.16);
        });
        if (reject) {
          tl.fromTo(
            reject,
            { x: -coin * 1.75, opacity: 0 },
            { x: -coin * 1.12, opacity: 1, duration: 0.45, ease: 'power3.out' },
            1.1,
          )
            .call(() => reject.classList.add('is-blocked'), [], 1.58)
            .to(reject, { x: '+=9', duration: 0.045, repeat: 5, yoyo: true, ease: 'none' }, 1.58)
            .to(reject, { y: coin * 1.5, rotation: -26, opacity: 0, duration: 0.6, ease: 'power2.in' }, 1.95);
        }
        tl.fromTo(
          words,
          { yPercent: 60, opacity: 0, filter: 'blur(10px)' },
          { yPercent: 0, filter: 'blur(0px)', opacity: 1, duration: 0.7, stagger: 0.09, ease: 'power3.out' },
          1.4,
        )
          /* ---- dive: kamera menembus lubang tengah tumpukan pelat, iris membuka landing ---- */
          .addLabel('dive', 2.45)
          .call(() => void reveal(), [], 'dive')
          .to($$('.il-tagline,.il-meta,.il-skip'), { opacity: 0, duration: 0.3 }, 'dive')
          .to(cam, { z: 860, duration: 1.05, ease: 'power2.in' }, 'dive')
          .to(stage, { opacity: 0, duration: 0.3 }, 'dive+=0.8')
          .to($('.il-rim'), { opacity: 1, duration: 0.2 }, 'dive+=0.4')
          .to(root, { '--il-r': `${radius}px`, duration: 0.95, ease: 'power2.inOut' }, 'dive+=0.4')
          .call(markIntroDone, [], 'dive+=0.45')
          .to($('.il-rim'), { opacity: 0, duration: 0.25 }, 'dive+=1.15');
      });
    };

    const leave = (skipped: boolean) => {
      if (leaving && !skipped) return;
      const wasLeaving = leaving;
      leaving = true;
      cancelAnimationFrame(raf);
      if (pctRef.current) pctRef.current.textContent = '100';
      root.style.setProperty('--il-p', '1');
      if (reduced) {
        if (wasLeaving) return;
        reveal();
        markIntroDone();
        root.classList.add('is-fading');
        fadeTimer = window.setTimeout(finish, 320);
        return;
      }
      if (skipped || short) shortExit();
      else fullExit();
    };

    const tick = () => {
      const elapsed = performance.now() - started;
      shown += (target() - shown) * 0.1;
      if (pctRef.current) pctRef.current.textContent = String(Math.round(shown * 100));
      if (stepRef.current) stepRef.current.textContent = STEP_COPY[fontsReady ? hero : 'fonts'];
      root.style.setProperty('--il-p', shown.toFixed(3));
      const ready = fontsReady && (hero === 'ok' || hero === 'fail');
      const boot = performance.now() >= MIN_BOOT_MS || short || reduced;
      if ((ready && boot) || elapsed > MAX_WAIT_MS) {
        leave(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Skip: tombol, klik di mana saja, atau Escape. Melompat langsung ke iris singkat.
    const skip = () => {
      if (!root.classList.contains('is-revealing')) leave(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    root.addEventListener('click', skip);
    window.addEventListener('keydown', onKey);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(fadeTimer);
      unsubscribe();
      root.removeEventListener('click', skip);
      window.removeEventListener('keydown', onKey);
      timeline?.kill();
      ctx.revert();
      unlock();
    };
  }, []);

  if (!visible) return null;

  return (
    <div ref={rootRef} className="intro-loader" data-intro-loader="">
      {/* Tanpa JS: loader tidak pernah tampil, dan fallback hero langsung terlihat. */}
      <noscript>
        <style>{'[data-intro-loader]{display:none!important}.hero-visual{animation:none!important;--hero-reveal:1}'}</style>
      </noscript>
      <span className="sr-only" role="status">
        Loading XofN
      </span>
      <div className="il-bg" aria-hidden="true">
        <div className="il-stars" />
        <div className="il-grid" />
      </div>
      <div className="il-rim" aria-hidden="true" />
      <div className="il-meta" aria-hidden="true">
        <span>XOFN / {status.label}</span>
        <b>● {status.flag}</b>
      </div>
      <div className="il-stage" aria-hidden="true">
        <svg className="il-ring" viewBox="0 0 100 100">
          <circle className="track" cx="50" cy="50" r="48" pathLength={100} />
          <circle className="spin" cx="50" cy="50" r="48" pathLength={100} />
          <circle className="fill" cx="50" cy="50" r="48" pathLength={100} />
        </svg>
        <div className="il-reject">
          <b>1/1</b>
          <small>1-OF-1 · BLOCKED</small>
        </div>
        <div className="il-cam">
          <div className="il-rig">
            {PLATES.map((plate, i) => (
              <div key={i} className={plate.opt ? 'il-layer il-plate opt' : 'il-layer il-plate'}>
                <i className="il-disc" />
                <span className="il-label">
                  <em>DVN · </em>
                  {plate.label}
                </span>
              </div>
            ))}
            <div className="il-spin">
              {Array.from({ length: EDGES }, (_, i) => (
                <i key={i} className="il-layer il-edge" style={{ '--i': i } as CSSProperties} />
              ))}
              <div className="il-layer il-face back">
                <Image src="/logo.jpeg" alt="" width={192} height={192} priority />
              </div>
              <div className="il-layer il-face front">
                <Image src="/logo.jpeg" alt="" width={192} height={192} priority />
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="il-tagline" aria-hidden="true">
        <span>NEVER</span>
        <span className="outline">ONE OF</span>
        <span className="mint">ONE.</span>
      </p>
      <div className="il-status" aria-hidden="true">
        <span>
          LOADING <strong ref={pctRef}>0</strong>%
        </span>
        <small ref={stepRef}>{STEP_COPY.fonts}</small>
      </div>
      <button type="button" className="il-skip">
        Skip intro
      </button>
    </div>
  );
}
