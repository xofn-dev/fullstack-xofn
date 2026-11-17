'use client';

import dynamic from 'next/dynamic';
import { useTier } from '@/components/landing/tier-context';

// Scene three.js dimuat lazy dan hanya di klien (CLAUDE.md §6). Selama chunk belum datang
// atau bila WebGL gagal, fallback statis di markup tetap terlihat.
const HeroCoinfall = dynamic(
  () => import('@/components/three/hero-coinfall').then((mod) => mod.HeroCoinfall),
  { ssr: false },
);

const GalaxyLayerScene = dynamic(
  () => import('@/components/three/galaxy-layer').then((mod) => mod.GalaxyLayer),
  { ssr: false },
);

export const ArchStageScene = dynamic(
  () => import('@/components/three/arch-stage').then((mod) => mod.ArchStage),
  { ssr: false },
);

export function HeroCanvas() {
  return <HeroCoinfall />;
}

// Lapisan galaxy mengikuti tier terpilih (pelat DVN di dalam koin).
export function GalaxyBackdrop() {
  const { tier } = useTier();
  return <GalaxyLayerScene tier={tier} />;
}
