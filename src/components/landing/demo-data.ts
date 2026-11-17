import type { Tier, TokenStatus } from '@/types/enums';

// Data demo landing. Semuanya FIKTIF dan selalu ditampilkan dengan label (PRD §4.3, §6.1).
// Tidak ada alamat, harga, atau hasil verifikasi nyata di file ini.

export type DemoTone = 'mint' | 'violet' | 'orange' | 'blue';

export interface DemoToken {
  id: number;
  name: string;
  ticker: string;
  status: Extract<TokenStatus, 'bonding' | 'graduated' | 'locked'>;
  progress: number;
  tier: Tier;
  glyph: string;
  tone: DemoTone;
  seed: number;
}

export const DEMO_TOKENS: DemoToken[] = [
  { id: 0, name: 'Sample / Aegis', ticker: 'DEMO-A', status: 'bonding', progress: 68, tier: 'standard', glyph: '◇', tone: 'mint', seed: 5 },
  { id: 1, name: 'Sample / Vector', ticker: 'DEMO-V', status: 'bonding', progress: 42, tier: 'fortress', glyph: '✳', tone: 'violet', seed: 11 },
  // Status baru dari deploy guide (D16): lulus lokal, menunggu ekspansi, belum terkunci.
  { id: 3, name: 'Sample / Meridian', ticker: 'DEMO-M', status: 'graduated', progress: 100, tier: 'standard', glyph: '◈', tone: 'blue', seed: 3 },
  { id: 2, name: 'Sample / Lattice', ticker: 'DEMO-L', status: 'locked', progress: 100, tier: 'standard', glyph: '⬡', tone: 'orange', seed: 9 },
];

export const TONE_VAR: Record<DemoTone, string> = {
  mint: 'var(--color-mint)',
  violet: 'var(--color-violet)',
  orange: 'var(--color-orange)',
  blue: 'var(--color-blue)',
};

export const STATUS_COPY: Record<DemoToken['status'], { badge: string; className: string; drawer: string }> = {
  bonding: { badge: 'BONDING*', className: 'orange', drawer: 'Bonding / demo' },
  graduated: { badge: 'GRADUATED*', className: 'blue', drawer: 'Graduated · awaiting expansion / demo' },
  locked: { badge: 'LOCKED*', className: '', drawer: 'Locked / demo' },
};

export type CheckSampleKey = 'standard' | 'fortress' | 'risky';

export interface CheckSample {
  label: string;
  tier: string;
  status: string;
  required: string;
  optional: string;
  requiredNames: string;
  optionalNames: string;
  owner: string;
  path: string;
  risk: boolean;
}

// D17: selama operator wajib pengganti belum diputuskan (PRD P1), sampel hanya menyebut
// operator yang sudah pasti dan menulis sisanya sebagai "to be confirmed".
export const CHECK_SAMPLES: Record<CheckSampleKey, CheckSample> = {
  standard: {
    label: 'Standard / locked example',
    tier: 'XofN 2+1/2',
    status: '✓ LOCKED*',
    required: '2 operators',
    optional: '1 of 2',
    requiredNames: 'LayerZero Labs · 1 to be confirmed',
    optionalNames: 'Deutsche Telekom · FCAT',
    owner: 'OWNER 0x000…000 · DELEGATE 0x000…000',
    path: 'CONFIG MATCHES*',
    risk: false,
  },
  fortress: {
    label: 'Fortress / locked example',
    tier: 'XofN 3+1/2',
    status: '✓ LOCKED*',
    required: '3 operators',
    optional: '1 of 2',
    requiredNames: 'LayerZero Labs · 2 to be confirmed',
    optionalNames: 'Deutsche Telekom · FCAT',
    owner: 'OWNER 0x000…000 · DELEGATE 0x000…000',
    path: 'CONFIG MATCHES*',
    risk: false,
  },
  risky: {
    label: '1-of-1 / flagged example',
    tier: '1-of-1',
    status: '⚠ FLAGGED*',
    required: '1 operator',
    optional: '0 of 0',
    requiredNames: 'Single verifier / demo',
    optionalNames: 'None',
    owner: 'OWNER/DELEGATE UNKNOWN · DEMO',
    path: '1-OF-1 FLAGGED*',
    risk: true,
  },
};
