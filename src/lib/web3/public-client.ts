import { createPublicClient, http, type PublicClient } from 'viem';
import { getChain } from '@/lib/chains';
import { publicEnv } from '@/lib/public-env';
import type { ChainKey, Network } from '@/types/enums';

// Public client untuk pembacaan aplikasi (ARCHITECTURE §10.1). Dipakai server dan klien.
// RPC: env publik per chain bila diisi, selain itu `publicRpc` yang tercatat sebagai DATA di
// registry chain. Tidak ada fallback string di sini.

export function rpcUrlFor(network: Network, chain: ChainKey): string | null {
  return publicEnv.rpc[chain] ?? getChain(network, chain).publicRpc;
}

const clients = new Map<string, PublicClient>();

/**
 * Client per URL RPC. Di jaringan lokal ketiga "chain" memakai satu node Anvil, jadi berbagi
 * client. Tanpa Multicall3 (tidak ada di Anvil); permintaan paralel digabung lewat batch JSON-RPC.
 */
export function getPublicClient(network: Network, chain: ChainKey): PublicClient | null {
  const url = rpcUrlFor(network, chain);
  if (url === null) return null;
  const cached = clients.get(url);
  if (cached) return cached;
  const client = createPublicClient({
    transport: http(url, { batch: { wait: 8 }, timeout: 12_000, retryCount: 1 }),
  });
  clients.set(url, client);
  return client;
}
