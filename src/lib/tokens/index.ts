import 'server-only';

import { createPublicClient, http } from 'viem';
import { getChain } from '@/lib/chains';
import { serverEnv } from '@/lib/env';
import { publicEnv } from '@/lib/public-env';
import { createServiceClient } from '@/lib/supabase/server';
import { readEthUsd, type FeedReader, type FeedSource } from '@/lib/tokens/eth-usd';
import { readLaunchConfig, toChainClient, type ChainClient, type LaunchConfig, type ReadContext } from '@/lib/tokens/read';
import { createTokenService, type TokenService } from '@/lib/tokens/service';
import { CachedTokenStore, MemoryTokenStore, SupabaseTokenStore, type TokenIndexStore } from '@/lib/tokens/store';
import { getDeployment, homeContracts } from '@/lib/web3/addresses';
import { getPublicClient } from '@/lib/web3/public-client';
import type { EthUsdRate } from '@/types/domain';
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
  // Store Supabase dibungkus cermin memori: tanpa itu setiap polling menunggu beberapa round
  // trip database sebelum menjawab.
  const store: TokenIndexStore = supabase
    ? new CachedTokenStore(
        new SupabaseTokenStore(
          createServiceClient(supabase),
          getChain(network, homeContracts(ctx.deployment).chain.chain).chainId,
        ),
        () => Date.now(),
      )
    : new MemoryTokenStore();
  service = createTokenService(ctx, store, () => Date.now());
  return service;
}

// Halaman launch, route API, dan beberapa tab berbagi satu pembacaan selama jeda ini.
const LAUNCH_CONFIG_FRESH_MS = 2_000;
let launchConfig: { at: number; value: Promise<LaunchConfig | null> } | null = null;

/** Konfigurasi form launch dari chain; null bila tidak ada manifest atau chain tidak terbaca. */
export function getLaunchConfig(): Promise<LaunchConfig | null> {
  const ctx = getReadContext();
  if (!ctx) return Promise.resolve(null);
  if (launchConfig && Date.now() - launchConfig.at < LAUNCH_CONFIG_FRESH_MS) return launchConfig.value;
  const value = readLaunchConfig(ctx).catch(() => null);
  launchConfig = { at: Date.now(), value };
  return value;
}

// ───────────────────────── Kurs ETH/USD (tampilan USD) ─────────────────────────
// Sumbernya feed Chainlink di Robinhood Chain MAINNET, juga saat aplikasi berjalan di testnet
// atau lokal: di sana kurs ini hanya acuan berlabel (ETH uji tidak punya nilai pasar). Client-nya
// sengaja terpisah dari `getPublicClient`, yang di build testnet menunjuk RPC testnet.
const ETH_USD_SOURCE_NETWORK = 'mainnet' as const;
const ETH_USD_SOURCE_CHAIN = 'robinhood' as const;
// Feed berubah paling cepat saat harga bergeser 0,5%; dibaca ulang paling sering semenit sekali.
const ETH_USD_TTL_MS = 60_000;
// Pembacaan yang gagal dicoba lagi lebih cepat daripada yang berhasil.
const ETH_USD_RETRY_MS = 10_000;

let ethUsdReader: Promise<{ reader: FeedReader; source: FeedSource } | null> | undefined;
let ethUsd: { at: number; value: Promise<EthUsdRate | null> } | null = null;

function getEthUsdReader(): Promise<{ reader: FeedReader; source: FeedSource } | null> {
  ethUsdReader ??= (async () => {
    const info = getChain(ETH_USD_SOURCE_NETWORK, ETH_USD_SOURCE_CHAIN);
    if (!info.feeds || !info.publicRpc) return null;
    const client = createPublicClient({ transport: http(info.publicRpc, { timeout: 8_000, retryCount: 1 }) });
    // RPC itu harus benar-benar chain tempat feed berada; kalau tidak, alamat feed tidak berarti.
    if ((await client.getChainId()) !== info.chainId) return null;
    const reader: FeedReader = {
      readContract: (call) => client.readContract(call as Parameters<typeof client.readContract>[0]),
    };
    return {
      reader,
      source: { network: ETH_USD_SOURCE_NETWORK, chain: ETH_USD_SOURCE_CHAIN, feed: info.feeds.ethUsd },
    };
  })().catch(() => {
    // RPC tidak terjangkau: dicoba lagi pada permintaan berikutnya.
    ethUsdReader = undefined;
    return null;
  });
  return ethUsdReader;
}

/** Kurs ETH/USD terakhir yang terbaca; null bila feed tidak terbaca atau jawabannya basi. */
export function getEthUsd(): Promise<EthUsdRate | null> {
  const at = Date.now();
  if (ethUsd && at - ethUsd.at < ETH_USD_TTL_MS) return ethUsd.value;
  const entry = {
    at,
    value: getEthUsdReader()
      .then((ready) => (ready ? readEthUsd(ready.reader, ready.source, new Date()) : null))
      .catch(() => null),
  };
  void entry.value.then((rate) => {
    if (rate === null) entry.at = at - ETH_USD_TTL_MS + ETH_USD_RETRY_MS;
  });
  ethUsd = entry;
  return entry.value;
}
