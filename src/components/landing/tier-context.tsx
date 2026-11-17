'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Tier } from '@/types/enums';

interface TierState {
  tier: Tier;
  setTier: (tier: Tier) => void;
}

const TierContext = createContext<TierState | null>(null);

// Tier terpilih dibagi oleh tier card, DVN rig, "inside the coin", scene arsitektur,
// dan form launch (ARCHITECTURE §11.4). Tidak ada store global lain.
export function TierProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<Tier>('standard');
  const value = useMemo(() => ({ tier, setTier }), [tier]);
  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}

export function useTier(): TierState {
  const state = useContext(TierContext);
  if (!state) throw new Error('useTier harus dipakai di dalam <TierProvider>.');
  return state;
}

export const TIER_COPY: Record<Tier, { badge: string; label: string; required: number; code: string }> = {
  standard: {
    badge: 'XofN 2+1/2',
    label: 'Standard',
    required: 2,
    code: 'REQUIRED: 2 OPTIONAL THRESHOLD: 1/2',
  },
  fortress: {
    badge: 'XofN 3+1/2',
    label: 'Fortress',
    required: 3,
    code: 'REQUIRED: 3 OPTIONAL THRESHOLD: 1/2',
  },
};
