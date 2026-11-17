import 'server-only';

import { getChain } from '@/lib/chains';
import { serverEnv } from '@/lib/env';
import { publicEnv } from '@/lib/public-env';
import { createServiceClient } from '@/lib/supabase/server';
import { readLaunchConfig, toChainClient, type ChainClient, type LaunchConfig, type ReadContext } from '@/lib/tokens/read';
import { createTokenService, type TokenService } from '@/lib/tokens/service';
import { MemoryTokenStore, SupabaseTokenStore, type TokenIndexStore } from '@/lib/tokens/store';
import { getDeployment, homeContracts } from '@/lib/web3/addresses';
import { getPublicClient } from '@/lib/web3/public-client';
import type { ChainKey } from '@/types/enums';

// Perakitan layanan token untuk jaringan aktif (env + manifest + RPC). Logikanya sendiri ada di
// `service.ts`, yang tidak menyentuh env sehingga bisa diuji dengan chain palsu.
export {
  createTokenService,
  parseTokenAddress,
  TokenServiceError,
  tokenHttpStatus,
  type TokenService,
} from '@/lib/tokens/service';

let context: ReadContext | null | undefined;
let service: TokenService | null | undefined;

/** Konteks baca untuk jaringan aktif; null bila belum ada manifest deployment (mode preview). */
export function getReadContext(): ReadContext | null {
  if (context !== undefined) return context;
  const network = publicEnv.network;
  const deployment = getDeployment(network);
  if (!deployment) {
    context = null;
    return context;
  }
  const clients = new Map<ChainKey, ChainClient | null>();
  context = {
    deployment,
    clientFor(chain) {
      if (!clients.has(chain)) {
        const client = getPublicClient(network, chain);
        clients.set(chain, client ? toChainClient(client) : null);
      }
      return clients.get(chain) ?? null;
    },
    now: () => new Date(),
  };
  return context;
}

/** Layanan token untuk jaringan aktif; null bila belum ada manifest deployment (mode preview). */
export function getTokenService(): TokenService | null {
  if (service !== undefined) return service;
  const ctx = getReadContext();
  if (!ctx) {
    service = null;
    return service;
  }
  const network = publicEnv.network;
  // Simulasi lokal selalu memakai index memori: riwayat Anvil hilang setiap node diulang, jadi
  // index yang persisten akan basi. Store Supabase hanya untuk jaringan publik (belum teruji).
  const supabase = network === 'local' ? null : serverEnv.supabase;
  const store: TokenIndexStore = supabase
    ? new SupabaseTokenStore(
        createServiceClient(supabase),
        getChain(network, homeContracts(ctx.deployment).chain.chain).chainId,
      )
    : new MemoryTokenStore();
  service = createTokenService(ctx, store, () => Date.now());
  return service;
}

/** Konfigurasi form launch dari chain; null bila tidak ada manifest atau chain tidak terbaca. */
export async function getLaunchConfig(): Promise<LaunchConfig | null> {
  const ctx = getReadContext();
  if (!ctx) return null;
  try {
    return await readLaunchConfig(ctx);
  } catch {
    return null;
  }
}
