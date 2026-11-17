// Enum domain XofN. Nilai string dipakai apa adanya di URL, DB, dan atribut data-*.

export const CHAIN_KEYS = ['robinhood', 'base', 'arbitrum'] as const;
export type ChainKey = (typeof CHAIN_KEYS)[number];

export type ChainRole = 'home' | 'expansion';

export const NETWORKS = ['local', 'testnet', 'mainnet'] as const;
export type Network = (typeof NETWORKS)[number];

export const APP_MODES = ['preview', 'simulation', 'live'] as const;
export type AppMode = (typeof APP_MODES)[number];

export const TIERS = ['standard', 'fortress'] as const;
export type Tier = (typeof TIERS)[number];

// "expanding" adalah usulan dokumen (PRD P25), bukan status dari deploy guide.
export const TOKEN_STATUSES = ['bonding', 'graduated', 'expanding', 'locked', 'changed'] as const;
export type TokenStatus = (typeof TOKEN_STATUSES)[number];

// Stasiun scene arsitektur diberi nama menurut PERAN, bukan nama chain,
// supaya pergantian home chain (D15) tidak menyentuh kode 3D.
// Padanan key di HTML V8: base→home, arb→expA, robin→expB.
export const ARCH_STATIONS = ['home', 'core', 'dvn', 'expA', 'expB', 'registry'] as const;
export type ArchStation = (typeof ARCH_STATIONS)[number];

export const ARCH_MODES = ['run', 'overview', 'xray'] as const;
export type ArchMode = (typeof ARCH_MODES)[number];
