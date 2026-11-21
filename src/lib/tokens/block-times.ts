import type { Trade } from '@/types/domain';

// Pemilihan blok yang waktunya belum terbaca. Murni: tidak ada jaringan, mudah diuji.

/**
 * Nomor blok trade yang belum punya waktu, TERBARU lebih dulu dan tanpa ganda, paling banyak
 * `limit`. Trade terbaru yang dilihat pengguna, jadi waktunya dibaca lebih dulu; riwayat lama
 * menyusul bertahap. `skip` menyingkirkan blok yang baru saja gagal dibaca.
 */
export function untimedBlocks(trades: readonly Trade[], limit: number, skip: (block: string) => boolean): string[] {
  const blocks: string[] = [];
  const seen = new Set<string>();
  for (let index = trades.length - 1; index >= 0 && blocks.length < limit; index -= 1) {
    const trade = trades[index];
    if (!trade || trade.timestamp !== null || seen.has(trade.blockNumber)) continue;
    seen.add(trade.blockNumber);
    if (!skip(trade.blockNumber)) blocks.push(trade.blockNumber);
  }
  return blocks;
}

/** Jumlah blok berbeda yang waktunya belum terbaca. */
export function countUntimedBlocks(trades: readonly Trade[]): number {
  const blocks = new Set<string>();
  for (const trade of trades) if (trade.timestamp === null) blocks.add(trade.blockNumber);
  return blocks.size;
}
