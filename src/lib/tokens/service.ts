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
import { countUntimedBlocks, untimedBlocks } from '@/lib/tokens/block-times';
import { historyPage, type HistoryQuery } from '@/lib/tokens/history';
import { matchesFilter, type StatusFilter } from '@/lib/tokens/status';
import type { TokenIndexStore } from '@/lib/tokens/store';
import { homeContracts, lc } from '@/lib/web3/addresses';
import type { TokenDetail, TokenErrorCode, TokenSummary, TradeHistory } from '@/types/domain';
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

// Waktu blok dibaca dari chain lalu DISIMPAN di index (kolom `block_time`): waktu sebuah blok
// tidak pernah berubah, dan chart candle butuh waktu seluruh riwayat, bukan hanya trade terbaru.
// Trade terbaru diisi di dalam permintaan detail, tetapi paling lama selama anggaran ini; sisanya
// tampil sebagai "reading…" dan menyusul pada polling berikutnya.
const TIP_BLOCKS = 8;
const TIP_BUDGET_MS = 250;
// Riwayat lama diisi bertahap SETELAH respons dikirim. RPC publik dibatasi rate, jadi satu
// putaran membaca sedikit blok dan putaran berikutnya menunggu jeda ini.
const BACKFILL_BLOCKS = 20;
const BACKFILL_GAP_MS = 2_000;
// Waktu blok yang gagal dibaca baru dicoba lagi setelah jeda ini, supaya RPC yang sedang
// bermasalah tidak dibebani permintaan yang sama pada setiap polling. Selama itu pengisian
// riwayat lama juga berhenti.
const BLOCK_TIME_RETRY_MS = 30_000;
const MAX_RETRY_MARKS = 5_000;

export interface BackfillResult {
  /** Blok yang waktunya terbaca dan tersimpan pada putaran ini. */
  read: number;
  failed: number;
  /** Blok yang waktunya masih kosong setelah putaran ini. */
  remaining: number;
}

interface Timed<T> {
  at: number;
  value: Promise<T>;
}

export interface TokenService {
  readonly backend: 'memory' | 'supabase';
  sync(): Promise<{ tokens: number; cursor: string }>;
  list(filter: StatusFilter): Promise<TokenSummary[]>;
  detail(address: Address): Promise<TokenDetail>;
  /** Riwayat trade curve ber-waktu untuk chart; hanya membaca index, tidak membaca state chain. */
  history(address: Address, query: HistoryQuery): Promise<TradeHistory>;
  /**
   * Mengisi waktu blok trade lama, satu putaran kecil. Dipanggil setelah respons dikirim dan dari
   * cron; tidak pernah melempar. Tanpa alamat: semua token, berbagi satu jatah blok.
   */
  backfillTimes(address?: Address, blocks?: number): Promise<BackfillResult>;
}

export function createTokenService(ctx: ReadContext, store: TokenIndexStore, now: () => number): TokenService {
  let syncing: Timed<{ tokens: number; cursor: string }> | null = null;
  let listing: Timed<TokenSummary[]> | null = null;
  const details = new Map<Address, Timed<TokenDetail>>();

  const fresh = <T>(entry: Timed<T> | null | undefined): entry is Timed<T> =>
    !!entry && now() - entry.at < FRESH_MS;

  const blockTimeRetryAt = new Map<string, number>();
  const filling = new Map<Address, Promise<BackfillResult>>();
  let backfillPausedUntil = 0;
  let lastBackfillAt = Number.NEGATIVE_INFINITY;

  /**
   * Membaca waktu blok yang belum terisi di satu curve (terbaru dulu) lalu menyimpannya.
   * Satu proses per curve; kegagalan dibiarkan sebagai "not read" dan tidak pernah dilempar.
   */
  function fillTimes(curve: Address, limit: number): Promise<BackfillResult> {
    const running = filling.get(curve);
    if (running) return running;
    const run = (async (): Promise<BackfillResult> => {
      const client = ctx.clientFor(homeContracts(ctx.deployment).chain.chain);
      const trades = await store.getTrades(curve);
      if (!client) return { read: 0, failed: 0, remaining: countUntimedBlocks(trades) };
      const at = now();
      const blocks = untimedBlocks(trades, limit, (block) => (blockTimeRetryAt.get(block) ?? 0) > at);
      if (blocks.length === 0) return { read: 0, failed: 0, remaining: countUntimedBlocks(trades) };
      const times = new Map<string, number>();
      let failed = 0;
      await Promise.all(
        blocks.map(async (block) => {
          try {
            const seconds = Number(await client.getBlockTimestamp(BigInt(block)));
            // Beberapa node mengisi 0 untuk waktu yang tidak mereka ketahui; itu bukan waktu blok.
            if (!Number.isSafeInteger(seconds) || seconds <= 0) throw new Error('waktu blok tidak sah');
            times.set(block, seconds);
            blockTimeRetryAt.delete(block);
          } catch {
            // Waktu yang tidak terbaca tidak diisi dengan perkiraan; dicoba lagi nanti.
            failed += 1;
            if (blockTimeRetryAt.size >= MAX_RETRY_MARKS) blockTimeRetryAt.clear();
            blockTimeRetryAt.set(block, at + BLOCK_TIME_RETRY_MS);
          }
        }),
      );
      if (failed > 0) backfillPausedUntil = at + BLOCK_TIME_RETRY_MS;
      await store.saveBlockTimes(curve, times);
      return { read: times.size, failed, remaining: countUntimedBlocks(await store.getTrades(curve)) };
    })()
      .catch((): BackfillResult => {
        // Index tidak terbaca atau tidak bisa ditulis: riwayat lama berhenti dulu, tidak diulang
        // pada setiap polling.
        backfillPausedUntil = now() + BLOCK_TIME_RETRY_MS;
        return { read: 0, failed: 0, remaining: 0 };
      })
      .finally(() => {
        filling.delete(curve);
      });
    filling.set(curve, run);
    return run;
  }

  async function backfillTimes(address?: Address, blocks = BACKFILL_BLOCKS): Promise<BackfillResult> {
    const total: BackfillResult = { read: 0, failed: 0, remaining: 0 };
    const at = now();
    if (at < backfillPausedUntil || at - lastBackfillAt < BACKFILL_GAP_MS) return total;
    lastBackfillAt = at;
    try {
      const metas = address ? [await store.getMeta(address)] : await store.listMeta();
      let budget = blocks;
      for (const meta of metas) {
        if (!meta) continue;
        // Jatah habis: curve berikutnya hanya dihitung sisanya, tidak dibaca.
        const result = await fillTimes(meta.curve, Math.max(budget, 0));
        budget -= result.read + result.failed;
        total.read += result.read;
        total.failed += result.failed;
        total.remaining += result.remaining;
      }
    } catch {
      // Index tidak terbaca: tidak ada yang diisi pada putaran ini.
    }
    return total;
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
    if (known) void fillTimes(known.curve, TIP_BLOCKS);
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
    // Trade yang baru terindeks: waktunya ditunggu sebentar saja, lalu respons dikirim apa adanya.
    await withinBudget(fillTimes(meta.curve, TIP_BLOCKS), TIP_BUDGET_MS);
    const nowSec = Math.floor(ctx.now().getTime() / 1_000);
    const detail = withTrades(state, meta, await store.getTrades(meta.curve), nowSec);
    await rememberStatus(address, detail.status);
    return detail;
  }

  async function runHistory(address: Address, query: HistoryQuery): Promise<TradeHistory> {
    await sync();
    const meta = await store.getMeta(address);
    if (!meta) throw new TokenServiceError('not_found', 'This address is not a token launched through XofN.');
    return historyPage(await store.getTrades(meta.curve), query, ctx.now().toISOString());
  }

  return {
    backend: store.backend,
    sync,
    backfillTimes,
    history(address, query) {
      return runHistory(address, query).catch((error: unknown) => {
        throw toServiceError(error);
      });
    },
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

/** Menunggu `work` paling lama `ms`; pekerjaannya sendiri tetap berjalan sampai selesai. */
async function withinBudget(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    work,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  clearTimeout(timer);
}

/** Kegagalan RPC dilaporkan sebagai `rpc_failed` tanpa membocorkan URL RPC. */
function toServiceError(error: unknown): TokenServiceError {
  if (error instanceof TokenServiceError) return error;
  return new TokenServiceError(
    'rpc_failed',
    'The chain could not be read right now. No token data is assumed.',
  );
}
