import type { ChainKey, ChainRole, Network } from '@/types/enums';

// Satu-satunya sumber chain ID, EID, nama, explorer, dan peran chain.
// Data mainnet/testnet terverifikasi di Phase 0 (proof/2026-11-17-phase0/01-chains-eid.md):
// cocok antara metadata LayerZero dan pembacaan on-chain chain-id + EndpointV2.eid().

export type Address = `0x${string}`;

export interface LzAddresses {
  /** EndpointV2 chain ini. Robinhood memakai alamat yang berbeda dari Base/Arbitrum. */
  endpointV2: Address;
  /** LZ Dead DVN: placeholder default; pathway yang memakainya tidak akan mengirim pesan. */
  deadDvn: Address;
}

export interface PriceFeeds {
  /**
   * Proxy feed Chainlink ETH / USD (8 desimal). Dipakai hanya untuk menampilkan nilai USD.
   * Sumber: direktori feed Chainlink untuk chain ini, dicocokkan dengan pembacaan on-chain
   * `description()` dan `decimals()` (proof/2026-11-21-token-launch-ui/notes.md).
   */
  ethUsd: Address;
}

export interface ChainInfo {
  key: ChainKey;
  role: ChainRole;
  /** Nama lengkap untuk kalimat, mis. "Robinhood Chain". */
  name: string;
  /** Nama ringkas untuk chip/label mono uppercase. */
  shortName: string;
  chainId: number;
  /** EID LayerZero. Di jaringan lokal ini EID mock dari manifest Anvil. */
  eid: number | null;
  /** Explorer resmi; null untuk jaringan lokal. */
  explorer: string | null;
  /** RPC publik tanpa kredensial, dipakai sebagai data bawaan (bukan fallback env). */
  publicRpc: string | null;
  /** Kontrak LayerZero V2 di chain ini; null untuk jaringan lokal. */
  lz: LzAddresses | null;
  /** Feed harga on-chain di chain ini; null bila tidak ada yang terverifikasi. */
  feeds: PriceFeeds | null;
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
    lz: {
      endpointV2: '0x6f475642a6e85809b1c36fa62763669b1b48dd5b',
      deadDvn: '0x6788f52439aca6bff597d3eec2dc9a44b8fee842',
    },
    feeds: { ethUsd: '0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9' },
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
    lz: {
      endpointV2: '0x1a44076050125825900e736c501f859c50fe728c',
      deadDvn: '0x6498b0632f3834d7647367334838111c8c889703',
    },
    feeds: null,
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
    lz: {
      endpointV2: '0x1a44076050125825900e736c501f859c50fe728c',
      deadDvn: '0x758c419533ad64ce9d3413bc8d3a97b026098ec1',
    },
    feeds: null,
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
    lz: {
      endpointV2: '0x3acaaf60502791d199a5a5f0b173d78229ebfe32',
      deadDvn: '0x88b27057a9e00c5f05dda29241027aff63f9e6e0',
    },
    feeds: null,
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
    lz: {
      endpointV2: '0x6edce65403992e310a62460808c4b910d972f10f',
      deadDvn: '0x78551adc2553ef1858a558f5300f7018aad2fa7e',
    },
    feeds: null,
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
    lz: {
      endpointV2: '0x6edce65403992e310a62460808c4b910d972f10f',
      deadDvn: '0xa85be08a6ce2771c730661766aacf2c8bb24c611',
    },
    feeds: null,
  },
};

// Simulasi lokal (Phase 3–4): satu node Anvil memerankan ketiga chain (ARCHITECTURE §15 butir 6).
// Chain ID-nya sama (31337); yang membedakan adalah EID mock 1/2/3 dan alamat di manifest lokal.
// EID di sini dicocokkan dengan `deployments/local.json` oleh `src/lib/web3/addresses.ts`.
// `lz` tetap null: endpoint tiruan dibaca dari manifest, bukan dari registry ini.
const LOCAL_RPC = 'http://127.0.0.1:8545';
const LOCAL: Registry = {
  robinhood: { ...MAINNET.robinhood, chainId: 31337, eid: 1, explorer: null, publicRpc: LOCAL_RPC, lz: null, feeds: null },
  base: { ...MAINNET.base, chainId: 31337, eid: 2, explorer: null, publicRpc: LOCAL_RPC, lz: null, feeds: null },
  arbitrum: { ...MAINNET.arbitrum, chainId: 31337, eid: 3, explorer: null, publicRpc: LOCAL_RPC, lz: null, feeds: null },
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

/** Chain di registry yang punya EID tertentu, atau undefined bila EID di luar daftar baca (P19). */
export function findChainByEid(network: Network, eid: number): ChainInfo | undefined {
  return getChains(network).find((chain) => chain.eid === eid);
}

export function explorerAddressUrl(chain: ChainInfo, address: string): string | null {
  return chain.explorer ? `${chain.explorer}/address/${address}` : null;
}

export function explorerTxUrl(chain: ChainInfo, hash: string): string | null {
  return chain.explorer ? `${chain.explorer}/tx/${hash}` : null;
}
