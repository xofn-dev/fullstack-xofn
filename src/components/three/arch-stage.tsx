'use client';

import { useEffect, useRef, useState } from 'react';

import { mountArch, type ArchController } from '@/lib/three/arch-scene';
import { isCanvasSpent } from '@/lib/three/stage';
import type { ArchMode, ArchStation, Tier } from '@/types/enums';

export interface ArchStageProps {
  active: ArchStation;
  mode: ArchMode;
  tier: Tier;
  /**
   * `true` setelah scene WebGL hidup, `false` bila gagal atau sudah dilepas.
   * Pemanggil memakai ini untuk memasang `webgl-on` di `#archStage` dan `has-3d`
   * di `#architectureShell` lewat props (scene tidak menyentuh className node React).
   */
  onReady?: (ok: boolean) => void;
}

/**
 * Canvas WebGL "coin run" arsitektur. Ditaruh di dalam `#archStage`, bersebelahan dengan
 * `#archHotspots` yang memuat enam pod `[data-arch]`.
 */
export function ArchStage({ active, mode, tier, onReady }: ArchStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<ArchController | null>(null);
  // Props terbaru untuk dibaca saat mount tertunda, tanpa menjadikannya dependency mount.
  const latest = useRef({ active, mode, tier, onReady });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    latest.current = { active, mode, tier, onReady };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let controller: ArchController | null = null;
    // Ditunda satu frame: lihat catatan StrictMode di hero-coinfall.tsx.
    const raf = requestAnimationFrame(() => {
      if (isCanvasSpent(canvas)) {
        setGeneration((g) => g + 1);
        return;
      }
      const props = latest.current;
      controller = mountArch({ canvas, active: props.active, mode: props.mode, tier: props.tier });
      controllerRef.current = controller;
      props.onReady?.(controller !== null);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (!controller) return;
      controller.dispose();
      controllerRef.current = null;
      latest.current.onReady?.(false);
    };
  }, [generation]);

  useEffect(() => {
    controllerRef.current?.setActive(active);
  }, [active]);

  useEffect(() => {
    controllerRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    controllerRef.current?.setTier(tier);
  }, [tier]);

  // Setiap render ulang bisa menimpa className pod (kelas `on-screen` ditulis scene per frame):
  // minta satu frame supaya langsung dipulihkan, juga saat reduced motion.
  useEffect(() => {
    controllerRef.current?.invalidate();
  });

  return (
    <canvas
      key={generation}
      ref={canvasRef}
      id="archCoinCanvas"
      className="coin-canvas"
      role="img"
      aria-label="3D model: one coin travelling through the six stages of the XofN pipeline"
    />
  );
}
