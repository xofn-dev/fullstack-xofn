'use client';

import { useEffect, useRef } from 'react';

import { mountCosmosFallback } from '@/lib/three/cosmos-fallback';
import { GALAXY_OFF_QUERY, mountGalaxy, type GalaxyController } from '@/lib/three/galaxy-scene';
import type { Tier } from '@/types/enums';

export interface GalaxyLayerProps {
  tier: Tier;
}

/**
 * Lapisan langit di belakang halaman: heat glow CSS, langit 2D fallback, dan (bila diizinkan)
 * canvas WebGL galaxy yang dibuat scene sendiri di awal `<body>` lalu dihapus saat dispose.
 */
export function GalaxyLayer({ tier }: GalaxyLayerProps) {
  const heatRef = useRef<HTMLDivElement>(null);
  const cosmosRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GalaxyController | null>(null);
  const tierRef = useRef(tier);

  useEffect(() => {
    tierRef.current = tier;
    controllerRef.current?.setTier(tier);
  }, [tier]);

  useEffect(() => {
    const cosmos = cosmosRef.current ? mountCosmosFallback(cosmosRef.current) : null;
    const narrow = window.matchMedia(GALAXY_OFF_QUERY);
    let galaxy: GalaxyController | null = null;
    let failed = false;
    // D5: galaxy WebGL hanya hidup di atas 860px; melewati breakpoint memasang / melepasnya.
    const sync = () => {
      if (narrow.matches) {
        if (!galaxy) return;
        galaxy.dispose();
        galaxy = controllerRef.current = null;
        cosmos?.resume();
      } else if (!galaxy && !failed) {
        galaxy = controllerRef.current = mountGalaxy({ heat: heatRef.current, tier: tierRef.current });
        failed = galaxy === null;
      }
    };
    // Ditunda satu frame supaya effect ganda StrictMode tidak membuat lalu membuang konteks WebGL.
    const raf = requestAnimationFrame(sync);
    narrow.addEventListener('change', sync);
    return () => {
      cancelAnimationFrame(raf);
      narrow.removeEventListener('change', sync);
      galaxy?.dispose();
      controllerRef.current = null;
      cosmos?.dispose();
    };
  }, []);

  return (
    <>
      <div id="heat" ref={heatRef} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <canvas id="cosmosCanvas" ref={cosmosRef} aria-hidden="true" />
    </>
  );
}
