import 'server-only';

import { isAddress } from 'viem';
import { getChain, getChains, isChainKey } from '@/lib/chains';
import { serverEnv } from '@/lib/env';
import { listOtherDeployments } from '@/lib/lz/oft-api';
import { publicEnv } from '@/lib/public-env';
import { createCheckStore, createServiceClient } from '@/lib/supabase/server';
import type { Address, CheckOutcome, CheckResult } from '@/types/domain';
import type { ChainKey } from '@/types/enums';
import { MemoryCheckCache, SupabaseCheckCache, type CheckCache } from '@/lib/check/cache';
import { createRateLimiter } from '@/lib/check/rate-limit';
import { checkChain } from '@/lib/check/local-lz';
import { CheckReadError, readOft } from '@/lib/check/read';
import { createViemReader } from '@/lib/check/viem-reader';
import { readXofnVerify } from '@/lib/check/xofn-verify';

// Orkestrasi XofN Check (server-only): validasi → cache → baca chain → simpan → hasil.
// Dipakai oleh halaman /check/[chain]/[address] (RSC), route API, dan gambar OG.

let cache: CheckCache | null = null;

function getCache(): CheckCache {
  if (cache) return cache;
  const network = publicEnv.network;
  if (serverEnv.supabase) {
    const store = createCheckStore(createServiceClient(serverEnv.supabase));
    cache = new SupabaseCheckCache(
      store,
      (chain) => getChain(network, chain).chainId,
      (chain) => getChain(network, chain).eid ?? 0,
    );
  } else {
    // Supabase tidak dikonfigurasi: cache memori per proses, dilaporkan di hasil (cache.backend).
    cache = new MemoryCheckCache();
  }
  return cache;
}

// Re-check paksa dibatasi supaya tombolnya tidak bisa dipakai membanjiri RPC.
const recheckLimiter = createRateLimiter({ limit: 6, windowMs: 60_000 });

// Permintaan bersamaan untuk token yang sama berbagi satu pembacaan chain.
const inFlight = new Map<string, Promise<CheckOutcome>>();

export interface CheckRequest {
  chain: string;
  address: string;
  /** true = lewati cache (tombol Re-check). */
  fresh?: boolean;
  /** Pengenal klien untuk pembatas laju (mis. IP). */
  clientId?: string;
}

/** Validasi bentuk input; alamat dikembalikan dalam huruf kecil. */
export function parseCheckInput(
  chain: string,
  address: string,
): { ok: true; chain: ChainKey; address: Address } | { ok: false; outcome: CheckOutcome } {
  if (!isChainKey(chain)) {
    return {
      ok: false,
      outcome: { ok: false, code: 'invalid_chain', message: 'Unknown chain. Use robinhood, base or arbitrum.' },
    };
  }
  if (!isAddress(address, { strict: false })) {
    return {
      ok: false,
      outcome: {
        ok: false,
        code: 'invalid_address',
        message: 'Enter a valid EVM address (0x + 40 hex characters).',
      },
    };
  }
  return { ok: true, chain, address: address.toLowerCase() as Address };
}

export async function runCheck(request: CheckRequest): Promise<CheckOutcome> {
  const parsed = parseCheckInput(request.chain, request.address);
  if (!parsed.ok) return parsed.outcome;
  const { chain: chainKey, address } = parsed;
  const network = publicEnv.network;
  // Jaringan lokal memakai endpoint tiruan dari manifest Anvil (src/lib/check/local-lz.ts).
  const chain = checkChain(network, chainKey);
  const rpcUrl = serverEnv.checkRpc[chainKey] ?? getChain(network, chainKey).publicRpc;
  if (!rpcUrl || !chain) {
    return {
      ok: false,
      code: 'network_unavailable',
      message: 'Live check unavailable — no RPC connection is configured for this network. No result will be fabricated.',
    };
  }

  const store = getCache();
  const key = { network, chain: chainKey, address };
  const id = `${network}:${chainKey}:${address}`;

  if (request.fresh) {
    if (!recheckLimiter.take(`${request.clientId ?? 'anonymous'}:${id}`)) {
      return { ok: false, code: 'rate_limited', message: 'Too many re-checks. Try again in a minute.' };
    }
  } else {
    try {
      const cached = await store.get(key);
      if (cached) return { ok: true, result: cached, cache: { hit: true, backend: store.backend } };
    } catch {
      // Cache yang tidak terbaca tidak boleh menghentikan Check; lanjut membaca chain.
    }
  }

  const running = inFlight.get(id);
  if (running) return running;

  const task = (async (): Promise<CheckOutcome> => {
    try {
      const readNames = getChains(network).map((item) => item.key);
      const local = network === 'local';
      const [result, otherDeployments, verify] = await Promise.all([
        // Anvil tidak punya Multicall3, dan alamat lokal tidak dikenal OFT API.
        readOft(createViemReader(rpcUrl, { multicall: !local }), { network, chain, address }),
        local ? Promise.resolve(null) : listOtherDeployments(address, readNames),
        readXofnVerify(network, chainKey, address),
      ]);
      const complete: CheckResult = { ...result, otherDeployments, verify };
      try {
        await store.set(complete);
      } catch {
        // Gagal menyimpan cache tidak mengubah hasil pembacaan.
      }
      return { ok: true, result: complete, cache: { hit: false, backend: store.backend } };
    } catch (error) {
      if (error instanceof CheckReadError) return { ok: false, code: error.code, message: error.message };
      return {
        ok: false,
        code: 'rpc_failed',
        message: 'The check could not be completed. No result will be fabricated.',
      };
    }
  })();

  inFlight.set(id, task);
  try {
    return await task;
  } finally {
    inFlight.delete(id);
  }
}

const STATUS_BY_CODE = {
  invalid_chain: 400,
  invalid_address: 400,
  not_contract: 404,
  not_oft: 404,
  rate_limited: 429,
  rpc_failed: 502,
  network_unavailable: 503,
} as const;

export function httpStatusFor(outcome: CheckOutcome): number {
  return outcome.ok ? 200 : STATUS_BY_CODE[outcome.code];
}
