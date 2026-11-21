import type { SupabaseClient } from '@supabase/supabase-js';
import type { Address } from '@/lib/chains';
import type { IndexedTrade, TokenMeta } from '@/lib/tokens/read';
import type { Trade } from '@/types/domain';
import type { DisplayStatus } from '@/types/enums';

// Index token XofN. Index hanya menyimpan data yang TIDAK berubah (metadata launch, trade curve)
// dan kursor blok. Status lifecycle dan `verify()` selalu dibaca dari chain saat diminta;
// kolom status di DB hanyalah cache untuk daftar dan deteksi Changed (ARCHITECTURE §3, §9).

export interface TokenIndexStore {
  readonly backend: 'memory' | 'supabase';
  listMeta(): Promise<TokenMeta[]>;
  getMeta(address: Address): Promise<TokenMeta | null>;
  upsertMeta(metas: TokenMeta[]): Promise<void>;
  getTrades(curve: Address): Promise<Trade[]>;
  appendTrades(trades: IndexedTrade[]): Promise<void>;
  /**
   * Mengisi waktu blok (detik Unix) trade yang SUDAH tersimpan di curve ini. Hanya trade yang
   * waktunya masih kosong yang diisi: waktu sebuah blok tidak pernah berubah.
   */
  saveBlockTimes(curve: Address, times: ReadonlyMap<string, number>): Promise<void>;
  /** Blok terakhir yang sudah diindeks; null bila belum pernah. */
  getCursor(): Promise<bigint | null>;
  setCursor(block: bigint): Promise<void>;
  /** Cache status terakhir yang dibaca dari chain (bukan sumber kebenaran). */
  saveStatus(address: Address, status: DisplayStatus): Promise<void>;
  /** Mengosongkan index, mis. saat node Anvil diulang dari nol. */
  reset(): Promise<void>;
}

export class MemoryTokenStore implements TokenIndexStore {
  readonly backend = 'memory' as const;
  private metas = new Map<Address, TokenMeta>();
  private order: Address[] = [];
  private trades = new Map<Address, Trade[]>();
  private cursor: bigint | null = null;

  async listMeta(): Promise<TokenMeta[]> {
    return this.order.map((address) => this.metas.get(address)).filter((meta): meta is TokenMeta => !!meta);
  }

  async getMeta(address: Address): Promise<TokenMeta | null> {
    return this.metas.get(address) ?? null;
  }

  async upsertMeta(metas: TokenMeta[]): Promise<void> {
    for (const meta of metas) {
      if (!this.metas.has(meta.address)) this.order.push(meta.address);
      this.metas.set(meta.address, meta);
    }
  }

  async getTrades(curve: Address): Promise<Trade[]> {
    return this.trades.get(curve) ?? [];
  }

  async appendTrades(trades: IndexedTrade[]): Promise<void> {
    for (const { curve, ...trade } of trades) {
      const list = this.trades.get(curve) ?? [];
      // Log yang sama tidak dicatat dua kali bila rentang blok terindeks ulang.
      if (list.some((item) => item.txHash === trade.txHash && item.logIndex === trade.logIndex)) continue;
      list.push(trade);
      this.trades.set(curve, list);
    }
  }

  async saveBlockTimes(curve: Address, times: ReadonlyMap<string, number>): Promise<void> {
    const list = this.trades.get(curve);
    if (!list || times.size === 0) return;
    // Array dan objek baru: pembaca yang masih memegang daftar lama tidak melihatnya berubah.
    this.trades.set(curve, withBlockTimes(list, times));
  }

  async getCursor(): Promise<bigint | null> {
    return this.cursor;
  }

  async setCursor(block: bigint): Promise<void> {
    this.cursor = block;
  }

  async saveStatus(): Promise<void> {
    // Cache memori tidak menyimpan status: setiap permintaan membaca chain.
  }

  async reset(): Promise<void> {
    this.metas.clear();
    this.order = [];
    this.trades.clear();
    this.cursor = null;
  }
}

interface TokenRow {
  address: string;
  home_chain_id: number;
  name: string;
  ticker: string;
  tier: string;
  status: string;
  expansion_eids: number[];
  creator: string;
  curve: string;
  virtual_eth: string;
  virtual_tokens: string;
  sale_supply: string;
  graduation_threshold: string;
  created_seq: number;
}

interface TradeRow {
  token: string;
  curve: string;
  tx_hash: string;
  log_index: number;
  side: string;
  trader: string;
  amount_token: string;
  amount_eth: string;
  eth_raised: string;
  /** Kolom `bigint`: PostgREST bisa mengirimnya sebagai angka JSON. */
  block_number: string | number;
  block_time: string | null;
}

/** Baris per permintaan saat membaca trade; sama dengan batas bawaan PostgREST. */
const TRADE_PAGE = 1_000;

/** `timestamptz` dari database → detik Unix; null bila kosong atau tidak terbaca sebagai waktu. */
export function blockTimeToUnix(value: string | null): number | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1_000) : null;
}

export function unixToBlockTime(seconds: number): string {
  return new Date(seconds * 1_000).toISOString();
}

/** Salinan daftar trade dengan waktu blok terisi; trade yang sudah punya waktu tidak disentuh. */
function withBlockTimes(list: readonly Trade[], times: ReadonlyMap<string, number>): Trade[] {
  return list.map((trade) => {
    if (trade.timestamp !== null) return trade;
    const timestamp = times.get(trade.blockNumber);
    return timestamp === undefined ? trade : { ...trade, timestamp };
  });
}

const CURSOR_CONTRACT = 'xofn-index';

/**
 * Index di Supabase (tabel migrasi `0002_xofn_tokens.sql`). BELUM PERNAH dijalankan terhadap
 * Postgres nyata (Docker tidak tersedia di lingkungan dev); dipakai hanya untuk jaringan publik,
 * jadi tidak aktif di mode simulation.
 */
export class SupabaseTokenStore implements TokenIndexStore {
  readonly backend = 'supabase' as const;

  constructor(
    private readonly client: SupabaseClient,
    private readonly homeChainId: number,
  ) {}

  private static toMeta(row: TokenRow): TokenMeta {
    return {
      address: row.address as Address,
      name: row.name,
      symbol: row.ticker,
      tier: row.tier === 'fortress' ? 'fortress' : 'standard',
      creator: row.creator as Address,
      curve: row.curve as Address,
      eids: row.expansion_eids,
      virtualEth: row.virtual_eth,
      virtualTokens: row.virtual_tokens,
      saleSupply: row.sale_supply,
      graduationThreshold: row.graduation_threshold,
    };
  }

  async listMeta(): Promise<TokenMeta[]> {
    const { data, error } = await this.client
      .from('tokens')
      .select('*')
      .eq('home_chain_id', this.homeChainId)
      .order('created_seq', { ascending: true });
    if (error) throw new Error(`Supabase tokens: ${error.message}`);
    return (data as TokenRow[]).map(SupabaseTokenStore.toMeta);
  }

  async getMeta(address: Address): Promise<TokenMeta | null> {
    const { data, error } = await this.client.from('tokens').select('*').eq('address', address).maybeSingle();
    if (error) throw new Error(`Supabase tokens: ${error.message}`);
    return data ? SupabaseTokenStore.toMeta(data as TokenRow) : null;
  }

  async upsertMeta(metas: TokenMeta[]): Promise<void> {
    if (metas.length === 0) return;
    const rows = metas.map((meta) => ({
      address: meta.address,
      home_chain_id: this.homeChainId,
      name: meta.name,
      ticker: meta.symbol,
      tier: meta.tier,
      expansion_eids: meta.eids,
      creator: meta.creator,
      curve: meta.curve,
      virtual_eth: meta.virtualEth,
      virtual_tokens: meta.virtualTokens,
      sale_supply: meta.saleSupply,
      graduation_threshold: meta.graduationThreshold,
    }));
    const { error } = await this.client.from('tokens').upsert(rows, { onConflict: 'address' });
    if (error) throw new Error(`Supabase tokens: ${error.message}`);
  }

  async getTrades(curve: Address): Promise<Trade[]> {
    const rows: TradeRow[] = [];
    // Dibaca per halaman: tanpa `range`, PostgREST memotong di 1000 baris dan (karena urutannya
    // lama → baru) justru trade TERBARU yang hilang.
    for (let from = 0; ; from += TRADE_PAGE) {
      const { data, error } = await this.client
        .from('curve_trades')
        .select('*')
        .eq('curve', curve)
        .order('block_number', { ascending: true })
        .order('log_index', { ascending: true })
        .range(from, from + TRADE_PAGE - 1);
      if (error) throw new Error(`Supabase curve_trades: ${error.message}`);
      const page = data as TradeRow[];
      rows.push(...page);
      if (page.length < TRADE_PAGE) break;
    }
    return rows.map((row) => ({
      side: row.side === 'sell' ? 'sell' : 'buy',
      trader: row.trader as Address,
      ethAmount: row.amount_eth,
      tokenAmount: row.amount_token,
      ethRaised: row.eth_raised,
      blockNumber: String(row.block_number),
      txHash: row.tx_hash as `0x${string}`,
      logIndex: row.log_index,
      timestamp: blockTimeToUnix(row.block_time),
    }));
  }

  async appendTrades(trades: IndexedTrade[]): Promise<void> {
    if (trades.length === 0) return;
    const metas = await this.listMeta();
    const tokenOf = new Map(metas.map((meta) => [meta.curve, meta.address]));
    const rows = trades.map((trade) => ({
      token: tokenOf.get(trade.curve) ?? null,
      curve: trade.curve,
      tx_hash: trade.txHash,
      log_index: trade.logIndex,
      side: trade.side,
      trader: trade.trader,
      amount_token: trade.tokenAmount,
      amount_eth: trade.ethAmount,
      eth_raised: trade.ethRaised,
      block_number: trade.blockNumber,
    }));
    const { error } = await this.client
      .from('curve_trades')
      .upsert(rows, { onConflict: 'tx_hash,log_index', ignoreDuplicates: true });
    if (error) throw new Error(`Supabase curve_trades: ${error.message}`);
  }

  async saveBlockTimes(curve: Address, times: ReadonlyMap<string, number>): Promise<void> {
    // Hanya kolom `block_time` yang disentuh, dan hanya baris yang masih kosong: kolom lain tidak
    // pernah ditulis ulang dari sini. Filternya memakai index (curve, block_number, log_index).
    const results = await Promise.all(
      [...times].map(([block, seconds]) =>
        this.client
          .from('curve_trades')
          .update({ block_time: unixToBlockTime(seconds) })
          .eq('curve', curve)
          .eq('block_number', block)
          .is('block_time', null),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error(`Supabase curve_trades: ${failed.error.message}`);
  }

  async getCursor(): Promise<bigint | null> {
    const { data, error } = await this.client
      .from('chain_cursors')
      .select('last_block')
      .eq('chain_id', this.homeChainId)
      .eq('contract', CURSOR_CONTRACT)
      .maybeSingle();
    if (error) throw new Error(`Supabase chain_cursors: ${error.message}`);
    return data ? BigInt((data as { last_block: string }).last_block) : null;
  }

  async setCursor(block: bigint): Promise<void> {
    const { error } = await this.client
      .from('chain_cursors')
      .upsert(
        { chain_id: this.homeChainId, contract: CURSOR_CONTRACT, last_block: block.toString() },
        { onConflict: 'chain_id,contract' },
      );
    if (error) throw new Error(`Supabase chain_cursors: ${error.message}`);
  }

  async saveStatus(address: Address, status: DisplayStatus): Promise<void> {
    // `unread` bukan status token: cache lama dibiarkan apa adanya.
    if (status === 'unread') return;
    const { error } = await this.client.from('tokens').update({ status }).eq('address', address);
    if (error) throw new Error(`Supabase tokens: ${error.message}`);
  }

  async reset(): Promise<void> {
    // Index di database tidak pernah dihapus otomatis; reset hanya relevan untuk Anvil.
  }
}

const tradeKey = (trade: Pick<Trade, 'txHash' | 'logIndex'>) => `${trade.txHash}:${trade.logIndex}`;

function byBlockThenLog(a: Trade, b: Trade): number {
  const blockDiff = BigInt(a.blockNumber) - BigInt(b.blockNumber);
  if (blockDiff !== 0n) return blockDiff < 0n ? -1 : 1;
  return a.logIndex - b.logIndex;
}

interface CurveTrades {
  /** Sudah digabung dengan isi store di belakangnya. */
  loaded: boolean;
  list: Trade[];
  keys: Set<string>;
}

// Kursor ditulis ke store paling sering sekali per jeda ini. Kursor yang tertinggal hanya
// membuat proses berikutnya membaca ulang rentang log yang lebih panjang; tidak ada yang hilang.
const CURSOR_PERSIST_MS = 30_000;

/**
 * Cermin memori di depan store yang lambat (Supabase: satu round trip jaringan per panggilan).
 * Isi index hanya bertambah (metadata launch, trade) dan chain tetap sumber kebenarannya, jadi
 * aman dibaca dari memori proses: metadata dan kursor dimuat sekali, trade per curve dimuat saat
 * pertama diminta, dan penulisan hanya diteruskan bila memang ada data baru. Tanpa ini satu
 * polling halaman token menghabiskan sekitar enam round trip store sebelum menjawab.
 */
export class CachedTokenStore implements TokenIndexStore {
  private metas: Map<Address, TokenMeta> | null = null;
  private order: Address[] = [];
  private loadingMetas: Promise<void> | null = null;
  private trades = new Map<Address, CurveTrades>();
  private loadingTrades = new Map<Address, Promise<void>>();
  private cursor: bigint | null | undefined = undefined;
  private cursorPersistedAt = 0;

  constructor(
    private readonly inner: TokenIndexStore,
    private readonly now: () => number,
  ) {}

  get backend(): 'memory' | 'supabase' {
    return this.inner.backend;
  }

  private async loadMetas(): Promise<Map<Address, TokenMeta>> {
    if (this.metas) return this.metas;
    this.loadingMetas ??= this.inner
      .listMeta()
      .then((metas) => {
        this.metas = new Map(metas.map((meta) => [meta.address, meta]));
        this.order = metas.map((meta) => meta.address);
      })
      .finally(() => {
        this.loadingMetas = null;
      });
    await this.loadingMetas;
    return this.metas ?? new Map();
  }

  async listMeta(): Promise<TokenMeta[]> {
    const metas = await this.loadMetas();
    return this.order.map((address) => metas.get(address)).filter((meta): meta is TokenMeta => !!meta);
  }

  async getMeta(address: Address): Promise<TokenMeta | null> {
    return (await this.loadMetas()).get(address) ?? null;
  }

  async upsertMeta(metas: TokenMeta[]): Promise<void> {
    if (metas.length === 0) return;
    const known = await this.loadMetas();
    await this.inner.upsertMeta(metas);
    for (const meta of metas) {
      if (!known.has(meta.address)) this.order.push(meta.address);
      known.set(meta.address, meta);
    }
  }

  private entry(curve: Address): CurveTrades {
    let entry = this.trades.get(curve);
    if (!entry) {
      entry = { loaded: false, list: [], keys: new Set() };
      this.trades.set(curve, entry);
    }
    return entry;
  }

  async getTrades(curve: Address): Promise<Trade[]> {
    const entry = this.entry(curve);
    if (!entry.loaded) {
      let loading = this.loadingTrades.get(curve);
      if (!loading) {
        loading = this.inner
          .getTrades(curve)
          .then((stored) => {
            // Trade yang diindeks proses ini sebelum curve-nya dimuat ikut digabung.
            for (const trade of stored) {
              if (entry.keys.has(tradeKey(trade))) continue;
              entry.keys.add(tradeKey(trade));
              entry.list.push(trade);
            }
            entry.list.sort(byBlockThenLog);
            entry.loaded = true;
          })
          .finally(() => {
            this.loadingTrades.delete(curve);
          });
        this.loadingTrades.set(curve, loading);
      }
      await loading;
    }
    return entry.list;
  }

  async appendTrades(trades: IndexedTrade[]): Promise<void> {
    // Sync membaca ulang beberapa blok terakhir setiap kali; yang sudah dikenal tidak ditulis lagi.
    const fresh = trades.filter((trade) => !this.entry(trade.curve).keys.has(tradeKey(trade)));
    if (fresh.length === 0) return;
    await this.inner.appendTrades(fresh);
    for (const { curve, ...trade } of fresh) {
      const entry = this.entry(curve);
      entry.keys.add(tradeKey(trade));
      // Array baru: pembaca yang masih memegang daftar lama tidak melihatnya berubah di tengah jalan.
      entry.list = [...entry.list, trade].sort(byBlockThenLog);
    }
    // Trade baru sudah tersimpan, jadi kursor ikut disimpan pada `setCursor` berikutnya.
    this.cursorPersistedAt = 0;
  }

  async saveBlockTimes(curve: Address, times: ReadonlyMap<string, number>): Promise<void> {
    if (times.size === 0) return;
    // Store di belakang lebih dulu: bila tulisnya gagal, cermin tetap apa adanya dan waktu blok
    // itu dibaca ulang nanti, bukan dianggap sudah tersimpan.
    await this.inner.saveBlockTimes(curve, times);
    const entry = this.entry(curve);
    entry.list = withBlockTimes(entry.list, times);
  }

  async getCursor(): Promise<bigint | null> {
    if (this.cursor === undefined) this.cursor = await this.inner.getCursor();
    return this.cursor;
  }

  async setCursor(block: bigint): Promise<void> {
    this.cursor = block;
    const at = this.now();
    if (at - this.cursorPersistedAt < CURSOR_PERSIST_MS) return;
    this.cursorPersistedAt = at;
    await this.inner.setCursor(block);
  }

  saveStatus(address: Address, status: DisplayStatus): Promise<void> {
    return this.inner.saveStatus(address, status);
  }

  async reset(): Promise<void> {
    await this.inner.reset();
    this.metas = new Map();
    this.order = [];
    this.trades.clear();
    this.cursor = null;
    this.cursorPersistedAt = 0;
  }
}
