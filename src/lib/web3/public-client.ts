import { createPublicClient, defineChain, http, type ChainContract, type PublicClient } from 'viem';
import { getChain } from '@/lib/chains';
import { MULTICALL3_ADDRESS } from '@/lib/lz/abi';
import { publicEnv } from '@/lib/public-env';
import type { ChainKey, Network } from '@/types/enums';

// Public client untuk pembacaan aplikasi (ARCHITECTURE §10.1). Dipakai server dan klien.
// RPC: env publik per chain bila diisi, selain itu `publicRpc` yang tercatat sebagai DATA di
// registry chain. Tidak ada fallback string di sini.

export function rpcUrlFor(network: Network, chain: ChainKey): string | null {
  return publicEnv.rpc[chain] ?? getChain(network, chain).publicRpc;
}

/**
 * Multicall3 untuk definisi chain viem. Ada di ketiga chain publik dan testnet-nya
 * (`MULTICALL3_ADDRESS`); TIDAK ada di Anvil lokal, jadi di sana `undefined`.
 */
export function multicallContracts(network: Network): { multicall3: ChainContract } | undefined {
  return network === 'local' ? undefined : { multicall3: { address: MULTICALL3_ADDRESS } };
}

const clients = new Map<string, PublicClient>();

/**
 * Client per URL RPC. Di jaringan lokal ketiga "chain" memakai satu node Anvil, jadi berbagi
 * client dan permintaan paralel hanya digabung lewat batch JSON-RPC. Di jaringan publik
 * pembacaan kontrak yang berjalan bersamaan digabung menjadi SATU `eth_call` lewat Multicall3:
 * RPC publik dibatasi rate, dan satu halaman token membaca belasan nilai sekaligus.
 */
export function getPublicClient(network: Network, chain: ChainKey): PublicClient | null {
  const url = rpcUrlFor(network, chain);
  if (url === null) return null;
  const cached = clients.get(url);
  if (cached) return cached;
  const contracts = multicallContracts(network);
  const info = getChain(network, chain);
  const client = createPublicClient({
    chain: contracts
      ? defineChain({
          id: info.chainId,
          name: info.name,
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: { default: { http: [url] } },
          contracts,
        })
      : undefined,
    batch: contracts ? { multicall: { wait: 8 } } : undefined,
    transport: http(url, { batch: { wait: 8 }, timeout: 12_000, retryCount: 1 }),
  });
  clients.set(url, client);
  return client;
}
