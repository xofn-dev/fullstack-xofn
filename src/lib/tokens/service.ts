import { isAddress } from 'viem';
import type { Address } from '@/lib/chains';
import {
  readChainState,
  readSummary,
  readTokenAt,
  readTokenCount,
  readTokenMeta,
  readTrades,
  sparkFromTrades,
  withTrades,
  type IndexedTrade,
  type ReadContext,
  type TokenChainState,
  type TokenMeta,
} from '@/lib/tokens/read';
import { matchesFilter, type StatusFilter } from '@/lib/tokens/status';
import type { TokenIndexStore } from '@/lib/tokens/store';
import { homeContracts, lc } from '@/lib/web3/addresses';
import type { TokenDetail, TokenErrorCode, TokenSummary, Trade } from '@/types/domain';
import type { DisplayStatus } from '@/types/enums';

// Layanan token untuk route API dan RSC. Sumber kebenaran adalah chain; index hanya menyimpan
// metadata dan trade agar daftar dan chart tidak membaca ulang seluruh riwayat setiap kali.

export class TokenServiceError extends Error {
  constructor(
    readonly code: TokenErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TokenServiceError';
  }
}

export function tokenHttpStatus(code: TokenErrorCode): number {
  switch (code) {
    case 'invalid_address':
      return 400;
    case 'unauthorized':
      return 401;
    case 'not_found':
      return 404;
    case 'rpc_failed':
      return 502;
    case 'network_unavailable':
    case 'not_configured':
      return 503;
  }
}

/** Validasi alamat di batas input: `viem.isAddress` lalu lowercase. */
export function parseTokenAddress(value: string): Address {
  if (!isAddress(value)) throw new TokenServiceError('invalid_address', 'Not a valid EVM address.');
  return lc(value);
}

// Pembacaan chain dibagi antar permintaan selama jeda singkat ini, supaya polling beberapa tab
// tidak melipatgandakan panggilan RPC.
const FRESH_MS = 2_000;

// Setiap sync membaca ulang beberapa blok terakhir. Sync hangat meminta log "sampai blok
// terbaru" bersamaan dengan nomor blok, dan node di belakang load balancer bisa menjawab keduanya
// dari tinggi yang berbeda; tanpa tumpang-tindih ini trade di selisihnya hilang selamanya.
// Trade yang terbaca dua kali dibuang oleh store (kunci txHash + logIndex).
const OVERLAP_BLOCKS = 64n;

// Waktu blok hanya dibaca untuk trade terbaru (yang ditampilkan halaman token), lalu diingat:
// waktu sebuah blok tidak pernah berubah.
const TIMED_TRADES = 30;
const MAX_BLOCK_TIMES = 5_000;
// Waktu blok yang gagal dibaca baru dicoba lagi setelah jeda ini, supaya RPC yang sedang
// bermasalah tidak dibebani permintaan yang sama pada setiap polling.
const BLOCK_TIME_RETRY_MS = 30_000;

interface Timed<T> {
  at: number;
  value: Promise<T>;
}

export interface TokenService {
  readonly backend: 'memory' | 'supabase';
  sync(): Promise<{ tokens: number; cursor: string }>;
  list(filter: StatusFilter): Promise<TokenSummary[]>;
  detail(address: Address): Promise<TokenDetail>;
}

export function createTokenService(ctx: ReadContext, store: TokenIndexStore, now: () => number): TokenService {
  let syncing: Timed<{ tokens: number; cursor: string }> | null = null;
  let listing: Timed<TokenSummary[]> | null = null;
  const details = new Map<Address, Timed<TokenDetail>>();

  const fresh = <T>(entry: Timed<T> | null | undefined): entry is Timed<T> =>
    !!entry && now() - entry.at < FRESH_MS;

  const blockTimes = new Map<string, number>();
  const blockTimeRetryAt = new Map<string, number>();

  /** Membaca waktu blok yang belum dikenal untuk trade terbaru. Kegagalan dibiarkan: "not read". */
  async function warmBlockTimes(trades: Trade[]): Promise<void> {
    const client = ctx.clientFor(homeContracts(ctx.deployment).chain.chain);
    if (!client) return;
    const blocks = new Set(trades.slice(-TIMED_TRADES).map((trade) => trade.blockNumber));
    const at = now();
    const missing = [...blocks].filter(
      (block) => !blockTimes.has(block) && (blockTimeRetryAt.get(block) ?? 0) <= at,
    );
    if (missing.length === 0) return;
    if (blockTimes.size + missing.length > MAX_BLOCK_TIMES) blockTimes.clear();
    await Promise.all(
      missing.map(async (block) => {
        try {
          blockTimes.set(block, Number(await client.getBlockTimestamp(BigInt(block))));
          blockTimeRetryAt.delete(block);
        } catch {
          // Waktu yang tidak terbaca tidak diisi dengan perkiraan; dicoba lagi nanti.
          blockTimeRetryAt.set(block, at + BLOCK_TIME_RETRY_MS);
        }
      }),
    );
  }

  /** Trade dengan waktu bloknya; yang belum terbaca tetap null. */
  async function withBlockTimes(trades: Trade[]): Promise<Trade[]> {
    await warmBlockTimes(trades);
    return trades.map((trade) => {
      const timestamp = blockTimes.get(trade.blockNumber);
      return timestamp === undefined ? trade : { ...trade, timestamp };
    });
  }

  // Status terakhir yang sudah ditulis ke store: polling tidak menulis ulang nilai yang sama.
  const savedStatus = new Map<Address, DisplayStatus>();
  async function rememberStatus(address: Address, status: DisplayStatus): Promise<void> {
    if (savedStatus.get(address) === status) return;
    await store.saveStatus(address, status);
    savedStatus.set(address, status);
  }

  async function runSync(): Promise<{ tokens: number; cursor: string }> {
    const home = homeContracts(ctx.deployment);
    const client = ctx.clientFor(home.chain.chain);
    if (!client) throw new TokenServiceError('network_unavailable', 'No RPC is configured for the home chain.');

    const [stored, cursor] = await Promise.all([store.listMeta(), store.getCursor()]);
    let known = stored;
    // Index hangat: semua yang dibutuhkan sync dibaca dalam SATU putaran RPC. Log diminta sampai
    // blok terbaru tanpa menunggu nomor bloknya; tumpang-tindih di atas menutup selisihnya.
    const warm = cursor !== null && known.length > 0;
    const overlapFrom = cursor === null ? home.chain.deployBlock : cursor + 1n - OVERLAP_BLOCKS;
    const from = overlapFrom > home.chain.deployBlock ? overlapFrom : home.chain.deployBlock;
    const [latest, count, firstOnChain, early] = await Promise.all([
      client.getBlockNumber(),
      readTokenCount(ctx),
      // Node Anvil yang diulang dari nol punya riwayat baru: index lama tidak berlaku lagi.
      known.length > 0 ? readTokenAt(ctx, 0).catch(() => null) : null,
      warm
        ? readTrades(ctx, known.map((meta) => meta.curve), from).catch((): IndexedTrade[] | null => null)
        : null,
    ]);
    const stale =
      (cursor !== null && cursor > latest) ||
      known.length > count ||
      (firstOnChain !== null && firstOnChain !== known[0]?.address);
    if (stale) {
      await store.reset();
      known = [];
      details.clear();
      savedStatus.clear();
      blockTimes.clear();
      blockTimeRetryAt.clear();
    }

    const indexes = Array.from({ length: Math.max(count - known.length, 0) }, (_, offset) => known.length + offset);
    const addresses = await Promise.all(indexes.map((index) => readTokenAt(ctx, index)));
    const added = (await Promise.all(addresses.map((address) => readTokenMeta(ctx, address)))).filter(
      (meta): meta is TokenMeta => meta !== null,
    );
    await store.upsertMeta(added);

    const curveOf = (meta: TokenMeta) => meta.curve;
    if (!stale && early !== null) {
      await store.appendTrades(early);
      // Token baru di-launch setelah sync terakhir, jadi trade-nya ada di rentang yang sama.
      if (added.length > 0) await store.appendTrades(await readTrades(ctx, added.map(curveOf), from, latest));
    } else {
      const scanFrom = stale || cursor === null ? home.chain.deployBlock : from;
      await store.appendTrades(await readTrades(ctx, [...known, ...added].map(curveOf), scanFrom, latest));
    }
    if (stale || cursor !== latest) await store.setCursor(latest);
    return { tokens: known.length + added.length, cursor: latest.toString() };
  }

  function sync(): Promise<{ tokens: number; cursor: string }> {
    if (fresh(syncing)) return syncing.value;
    const value = runSync().catch((error: unknown) => {
      syncing = null;
      throw toServiceError(error);
    });
    syncing = { at: now(), value };
    return value;
  }

  // Daftar dan detail membaca state chain BERSAMAAN dengan sync, bukan sesudahnya: token yang
  // sudah dikenal tidak perlu menunggu index untuk tahu harga dan statusnya. Hanya trade (dari
  // index) yang digabung setelah sync selesai.
  async function runList(): Promise<TokenSummary[]> {
    const eager = new Map(
      (await store.listMeta()).map((meta) => [meta.address, readSummary(ctx, meta, []).catch(() => null)]),
    );
    await sync();
    const metas = await store.listMeta();
    const summaries = await Promise.all(
      metas.map(async (meta) => {
        const trades = await store.getTrades(meta.curve);
        const early = await eager.get(meta.address);
        // Token baru, atau pembacaan awal gagal: dibaca (ulang) sekarang.
        if (!early) return readSummary(ctx, meta, trades);
        return { ...early, spark: sparkFromTrades(meta, trades) };
      }),
    );
    await Promise.all(summaries.map((summary) => rememberStatus(summary.address, summary.status)));
    // Terbaru lebih dulu.
    return summaries.reverse();
  }

  async function runDetail(address: Address): Promise<TokenDetail> {
    const known = await store.getMeta(address);
    let stateError: unknown = null;
    const eager: Promise<TokenChainState | null> | null = known
      ? readChainState(ctx, known).catch((error: unknown) => {
          stateError = error;
          return null;
        })
      : null;
    // Waktu blok trade yang sudah terindeks dibaca bersamaan dengan sync, bukan sesudahnya.
    if (known) void store.getTrades(known.curve).then(warmBlockTimes, () => undefined);
    const shared = fresh(syncing);
    await sync();
    // Dibaca ulang setelah sync: token bisa baru saja terindeks, atau index baru saja dikosongkan.
    let meta = await store.getMeta(address);
    if (!meta && shared) {
      // Sync tadi milik permintaan lain dan bisa dimulai sebelum token ini di-launch (pengguna
      // diarahkan ke sini tepat setelah receipt launch). Dibaca sekali lagi sebelum menyerah.
      syncing = null;
      await sync();
      meta = await store.getMeta(address);
    }
    if (!meta) throw new TokenServiceError('not_found', 'This address is not a token launched through XofN.');
    const early = await eager;
    if (eager && !early) throw stateError;
    const state = early ?? (await readChainState(ctx, meta));
    const detail = withTrades(state, meta, await withBlockTimes(await store.getTrades(meta.curve)));
    await rememberStatus(address, detail.status);
    return detail;
  }

  return {
    backend: store.backend,
    sync,
    async list(filter) {
      if (!fresh(listing)) {
        const value = runList().catch((error: unknown) => {
          listing = null;
          throw toServiceError(error);
        });
        listing = { at: now(), value };
      }
      const all = await listing.value;
      return all.filter((token) => matchesFilter(token.status, filter));
    },
    detail(address) {
      const cached = details.get(address);
      if (fresh(cached)) return cached.value;
      const value = runDetail(address).catch((error: unknown) => {
        details.delete(address);
        throw toServiceError(error);
      });
      details.set(address, { at: now(), value });
      return value;
    },
  };
}

/** Kegagalan RPC dilaporkan sebagai `rpc_failed` tanpa membocorkan URL RPC. */
function toServiceError(error: unknown): TokenServiceError {
  if (error instanceof TokenServiceError) return error;
  return new TokenServiceError(
    'rpc_failed',
    'The chain could not be read right now. No token data is assumed.',
  );
}
