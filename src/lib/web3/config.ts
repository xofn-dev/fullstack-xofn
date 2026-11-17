import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import type { AppKitNetwork } from '@reown/appkit/networks';
import { cookieStorage, createConfig, createStorage, http, type Config } from '@wagmi/core';
import { defineChain, type Chain, type Transport } from 'viem';
import { getChains, getHomeChain, type ChainInfo } from '@/lib/chains';
import { publicEnv } from '@/lib/public-env';
import { devAccountConnector } from '@/lib/web3/dev-account';
import { rpcUrlFor } from '@/lib/web3/public-client';
import type { Network } from '@/types/enums';

// Konfigurasi wagmi/AppKit (ARCHITECTURE §10.1). Modul ini tidak memakai hook, jadi tanpa
// 'use client'. Chain, chain ID, dan nama hanya berasal dari registry chain.

const NATIVE = { name: 'Ether', symbol: 'ETH', decimals: 18 } as const;

function toViemChain(network: Network, info: ChainInfo, rpcUrl: string): Chain {
  return defineChain({
    id: info.chainId,
    // Di Anvil satu node memerankan ketiga chain, jadi namanya dibuat jelas sebagai simulasi.
    name: network === 'local' ? `${info.name} · local Anvil` : info.name,
    nativeCurrency: NATIVE,
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: info.explorer ? { default: { name: 'Explorer', url: info.explorer } } : undefined,
  });
}

/** Chain aktif untuk wallet. Di jaringan lokal ketiganya ber-ID 31337, jadi hanya home yang dipakai. */
export function walletChains(network: Network): Chain[] {
  const infos = network === 'local' ? [getHomeChain(network)] : getChains(network);
  const chains: Chain[] = [];
  for (const info of infos) {
    const rpcUrl = rpcUrlFor(network, info.key);
    if (rpcUrl === null || chains.some((chain) => chain.id === info.chainId)) continue;
    chains.push(toViemChain(network, info, rpcUrl));
  }
  return chains;
}

export interface Web3Setup {
  config: Config;
  /** Diisi hanya bila project ID WalletConnect ada; dipakai `createAppKit` di provider. */
  appKit: { adapter: WagmiAdapter; networks: [AppKitNetwork, ...AppKitNetwork[]]; projectId: string } | null;
  /** Konektor "Anvil dev account" tersedia (hanya jaringan lokal). */
  hasDevAccount: boolean;
}

function build(): Web3Setup | null {
  const network = publicEnv.network;
  const chains = walletChains(network);
  const [first, ...rest] = chains;
  if (!first) return null;
  const projectId = publicEnv.walletConnectProjectId;
  const hasDevAccount = network === 'local';
  const connectors = hasDevAccount ? [devAccountConnector()] : [];
  const transports: Record<number, Transport> = {};
  for (const chain of chains) transports[chain.id] = http(chain.rpcUrls.default.http[0]);

  if (projectId !== null) {
    const networks: [AppKitNetwork, ...AppKitNetwork[]] = [first, ...rest];
    const adapter = new WagmiAdapter({
      networks,
      projectId,
      ssr: true,
      storage: createStorage({ storage: cookieStorage }),
      connectors,
      transports,
    });
    return { config: adapter.wagmiConfig, appKit: { adapter, networks, projectId }, hasDevAccount };
  }
  // Tanpa project ID AppKit tidak dibuat (ARCHITECTURE §10.2). Di jaringan lokal wallet tetap
  // tersedia lewat akun dev Anvil; di jaringan lain wallet nonaktif.
  if (!hasDevAccount) return null;
  const config = createConfig({
    chains: [first, ...rest],
    connectors,
    transports,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
  });
  return { config, appKit: null, hasDevAccount };
}

export const web3: Web3Setup | null = build();

/** AppKit aktif = ada project ID WalletConnect. */
export const isAppKitConfigured = web3?.appKit != null;

/** Ada cara menyambungkan wallet: AppKit, atau akun dev Anvil di jaringan lokal. */
export const isWeb3Configured = web3 !== null;
