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
  block_number: string;
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
    const { data, error } = await this.client
      .from('curve_trades')
      .select('*')
      .eq('curve', curve)
      .order('block_number', { ascending: true })
      .order('log_index', { ascending: true });
    if (error) throw new Error(`Supabase curve_trades: ${error.message}`);
    return (data as TradeRow[]).map((row) => ({
      side: row.side === 'sell' ? 'sell' : 'buy',
      trader: row.trader as Address,
      ethAmount: row.amount_eth,
      tokenAmount: row.amount_token,
      ethRaised: row.eth_raised,
      blockNumber: row.block_number,
      txHash: row.tx_hash as `0x${string}`,
      logIndex: row.log_index,
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
