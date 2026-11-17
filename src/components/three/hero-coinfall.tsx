'use client';

import { useEffect, useRef, useState } from 'react';

import { reportHeroState } from '@/lib/client/intro';
import { mountHero, type HeroController } from '@/lib/three/hero-scene';
import { isCanvasSpent } from '@/lib/three/stage';

/**
 * Canvas WebGL hero "Coinfall". Ditaruh sebagai anak langsung `<section class="hero">`;
 * scene mencari `.hero`, `.hero-visual`, `.hero-copy`, dan `.hero-float.f1..f4` sendiri.
 * Selama scene belum siap, kolom visual sengaja kosong (tidak ada kilasan fallback).
 * Bila WebGL gagal, kelas `webgl-off` dipasang supaya fallback CSS statis tampil.
 */
export function HeroCoinfall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Canvas yang konteksnya sudah dilepas tidak bisa dipakai lagi (Fast Refresh): ganti node-nya.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const hero = canvas.closest<HTMLElement>('.hero');
    let controller: HeroController | null = null;
    let readyRaf = 0;
    reportHeroState('mounting');
    // Ditunda satu frame: StrictMode menjalankan effect dua kali, dan mount pertama
    // akan melepas konteks WebGL canvas yang sama sebelum mount kedua sempat memakainya.
    const raf = requestAnimationFrame(() => {
      if (isCanvasSpent(canvas)) {
        setGeneration((g) => g + 1);
        return;
      }
      controller = mountHero({ canvas });
      if (!controller) {
        hero?.classList.add('webgl-off');
        reportHeroState('fail');
        return;
      }
      // Dua frame: frame pertama scene sudah dirender (shader terkompilasi) sebelum loader membuka.
      readyRaf = requestAnimationFrame(() => {
        readyRaf = requestAnimationFrame(() => reportHeroState('ok'));
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(readyRaf);
      controller?.dispose();
      hero?.classList.remove('webgl-off');
      reportHeroState('idle');
    };
  }, [generation]);

  return <canvas key={generation} ref={canvasRef} id="heroCoinCanvas" className="coin-canvas" aria-hidden="true" />;
}
