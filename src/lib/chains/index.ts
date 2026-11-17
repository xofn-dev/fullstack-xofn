import type { ChainKey, ChainRole, Network } from '@/types/enums';

// Satu-satunya sumber chain ID, EID, nama, explorer, dan peran chain.
// Data mainnet/testnet terverifikasi di Phase 0 (proof/2026-11-17-phase0/01-chains-eid.md):
// cocok antara metadata LayerZero dan pembacaan on-chain chain-id + EndpointV2.eid().

export interface ChainInfo {
  key: ChainKey;
  role: ChainRole;
  /** Nama lengkap untuk kalimat, mis. "Robinhood Chain". */
  name: string;
  /** Nama ringkas untuk chip/label mono uppercase. */
  shortName: string;
  chainId: number;
  /** EID LayerZero. null = belum ditetapkan (EID mock lokal baru ada di Phase 3). */
  eid: number | null;
  /** Explorer resmi; null untuk jaringan lokal. */
  explorer: string | null;
  /** RPC publik tanpa kredensial, dipakai sebagai data bawaan (bukan fallback env). */
  publicRpc: string | null;
}

type Registry = Record<ChainKey, ChainInfo>;

const MAINNET: Registry = {
  robinhood: {
    key: 'robinhood',
    role: 'home',
    name: 'Robinhood Chain',
    shortName: 'ROBINHOOD',
    chainId: 4663,
    eid: 30416,
    explorer: 'https://robinhoodchain.blockscout.com',
    publicRpc: 'https://rpc.mainnet.chain.robinhood.com',
  },
  base: {
    key: 'base',
    role: 'expansion',
    name: 'Base',
    shortName: 'BASE',
    chainId: 8453,
    eid: 30184,
    explorer: 'https://basescan.org',
    publicRpc: 'https://mainnet.base.org',
  },
  arbitrum: {
    key: 'arbitrum',
    role: 'expansion',
    name: 'Arbitrum',
    shortName: 'ARBITRUM',
    chainId: 42161,
    eid: 30110,
    explorer: 'https://arbiscan.io',
    publicRpc: 'https://arb1.arbitrum.io/rpc',
  },
};

const TESTNET: Registry = {
  robinhood: {
    key: 'robinhood',
    role: 'home',
    name: 'Robinhood Chain Testnet',
    shortName: 'ROBINHOOD TESTNET',
    chainId: 46630,
    eid: 40451,
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    publicRpc: 'https://rpc.testnet.chain.robinhood.com',
  },
  base: {
    key: 'base',
    role: 'expansion',
    name: 'Base Sepolia',
    shortName: 'BASE SEPOLIA',
    chainId: 84532,
    eid: 40245,
    explorer: 'https://sepolia.basescan.org',
    publicRpc: 'https://sepolia.base.org',
  },
  arbitrum: {
    key: 'arbitrum',
    role: 'expansion',
    name: 'Arbitrum Sepolia',
    shortName: 'ARBITRUM SEPOLIA',
    chainId: 421614,
    eid: 40231,
    explorer: 'https://sepolia.arbiscan.io',
    publicRpc: 'https://sepolia-rollup.arbitrum.io/rpc',
  },
};

// Simulasi lokal (Phase 3–4): peran dan nama sama, tetapi chain ID Anvil dan EID mock
// baru ditetapkan saat kontrak dan manifest lokal dibuat. EID sengaja null, tidak ditebak.
const LOCAL: Registry = {
  robinhood: { ...MAINNET.robinhood, chainId: 31337, eid: null, explorer: null, publicRpc: null },
  base: { ...MAINNET.base, chainId: 31337, eid: null, explorer: null, publicRpc: null },
  arbitrum: { ...MAINNET.arbitrum, chainId: 31337, eid: null, explorer: null, publicRpc: null },
};

const REGISTRIES: Record<Network, Registry> = {
  mainnet: MAINNET,
  testnet: TESTNET,
  local: LOCAL,
};

export function getChains(network: Network): ChainInfo[] {
  const registry = REGISTRIES[network];
  return [registry.robinhood, registry.base, registry.arbitrum];
}

export function getChain(network: Network, key: ChainKey): ChainInfo {
  return REGISTRIES[network][key];
}

export function getHomeChain(network: Network): ChainInfo {
  const home = getChains(network).find((chain) => chain.role === 'home');
  // Registry selalu punya tepat satu home; error ini hanya muncul bila registry diubah keliru.
  if (!home) throw new Error(`Registry chain "${network}" tidak punya home chain.`);
  return home;
}

export function getExpansionChains(network: Network): ChainInfo[] {
  return getChains(network).filter((chain) => chain.role === 'expansion');
}

export function isChainKey(value: string): value is ChainKey {
  return value === 'robinhood' || value === 'base' || value === 'arbitrum';
}
