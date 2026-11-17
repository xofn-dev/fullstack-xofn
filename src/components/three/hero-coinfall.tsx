'use client';

import { useEffect, useRef, useState } from 'react';

import { mountHero, type HeroController } from '@/lib/three/hero-scene';
import { isCanvasSpent } from '@/lib/three/stage';

/**
 * Canvas WebGL hero "Coinfall". Ditaruh sebagai anak langsung `<section class="hero">`;
 * scene mencari `.hero`, `.hero-visual`, `.hero-copy`, dan `.hero-float.f1..f4` sendiri.
 * Bila WebGL gagal, kelas `webgl-on` tidak dipasang dan fallback CSS tetap tampil.
 */
export function HeroCoinfall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Canvas yang konteksnya sudah dilepas tidak bisa dipakai lagi (Fast Refresh): ganti node-nya.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let controller: HeroController | null = null;
    // Ditunda satu frame: StrictMode menjalankan effect dua kali, dan mount pertama
    // akan melepas konteks WebGL canvas yang sama sebelum mount kedua sempat memakainya.
    const raf = requestAnimationFrame(() => {
      if (isCanvasSpent(canvas)) {
        setGeneration((g) => g + 1);
        return;
      }
      controller = mountHero({ canvas });
    });
    return () => {
      cancelAnimationFrame(raf);
      controller?.dispose();
    };
  }, [generation]);

  return <canvas key={generation} ref={canvasRef} id="heroCoinCanvas" className="coin-canvas" aria-hidden="true" />;
}
