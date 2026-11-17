import tiersConfig from '../../../config/tiers.json';
import { TIERS, type Tier } from '@/types/enums';

// Definisi tier hanya berasal dari `config/tiers.json` (CLAUDE.md §6). File itu memuat badge dan
// JUMLAH DVN; nama operatornya masih menunggu PRD P1, jadi UI hanya menampilkan jumlah (D17).

export interface TierInfo {
  tier: Tier;
  /** ID tier on-chain (`TierLib.TIER_STANDARD` = 1, `TIER_FORTRESS` = 2). */
  id: 1 | 2;
  label: string;
  /** Teks badge, mis. "XofN 2+1/2". */
  badge: string;
  requiredCount: number;
  optionalCount: number;
  optionalThreshold: number;
}

const TIER_IDS: Record<Tier, 1 | 2> = { standard: 1, fortress: 2 };
const TIER_LABELS: Record<Tier, string> = { standard: 'Standard', fortress: 'Fortress' };

function load(tier: Tier): TierInfo {
  const entry = tiersConfig[tier];
  return {
    tier,
    id: TIER_IDS[tier],
    label: TIER_LABELS[tier],
    badge: entry.badge,
    requiredCount: entry.required.length,
    optionalCount: entry.optional.length,
    optionalThreshold: entry.optionalThreshold,
  };
}

const TIER_INFO: Record<Tier, TierInfo> = { standard: load('standard'), fortress: load('fortress') };

export function getTierInfo(tier: Tier): TierInfo {
  return TIER_INFO[tier];
}

export function tierId(tier: Tier): 1 | 2 {
  return TIER_IDS[tier];
}

/** Tier dari ID on-chain; null untuk nilai di luar 1/2 (kontrak menolak 1-of-1 dan nilai lain). */
export function tierFromId(id: number): Tier | null {
  return TIERS.find((tier) => TIER_IDS[tier] === id) ?? null;
}

/** Ringkasan jumlah DVN tanpa nama operator (D17), mis. "2 required DVNs · 1 of 2 optional". */
export function tierDvnSummary(tier: Tier): string {
  const info = TIER_INFO[tier];
  return `${info.requiredCount} required DVNs · ${info.optionalThreshold} of ${info.optionalCount} optional`;
}
