import { curvePriceAt } from '@/lib/tokens/candles';
import type { CurveShape } from '@/lib/tokens/chart';
import type { MarketWindow, Trade } from '@/types/domain';

// Statistik pasar halaman token. Murni. Semua jumlah bigint; tidak ada angka yang ditebak:
// bila ada trade di dalam jendela 24 jam yang waktunya belum terbaca, hasilnya `unread`.

/** Suplai tetap token XofN, dalam token utuh (brief: 999.000.000, tanpa mint). */
export const FIXED_SUPPLY = 999_000_000;

const DAY_SEC = 86_400;

/**
 * Market cap dalam wei = harga (wei per token utuh) × suplai tetap. Seluruh suplai sudah di-mint
 * saat launch, jadi angka ini sama dengan valuasi terdilusi penuh.
 */
export function marketCapWei(priceWei: bigint): bigint {
  return priceWei * BigInt(FIXED_SUPPLY);
}

/**
 * Volume dan harga pembanding 24 jam dari seluruh trade curve terindeks (urut lama → baru).
 * Berjalan dari trade terbaru ke belakang dan berhenti di trade pertama yang lebih tua dari
 * jendela: harga sesudah trade itulah harga tepat 24 jam lalu.
 */
export function market24h(trades: readonly Trade[], shape: CurveShape, nowSec: number): MarketWindow {
  const since = nowSec - DAY_SEC;
  let volume = 0n;
  let count = 0;
  for (let index = trades.length - 1; index >= 0; index -= 1) {
    const trade = trades[index];
    if (!trade) continue;
    if (trade.timestamp === null) {
      return { status: 'unread', asOf: nowSec, volume24h: null, trades24h: null, price24hAgo: null, reference: 'window' };
    }
    if (trade.timestamp < since) {
      return {
        status: 'read',
        asOf: nowSec,
        volume24h: volume.toString(),
        trades24h: count,
        price24hAgo: curvePriceAt(shape, BigInt(trade.ethRaised)).toString(),
        reference: 'window',
      };
    }
    volume += BigInt(trade.ethAmount);
    count += 1;
  }
  // Semua trade ada di dalam jendela (atau belum ada trade): pembandingnya harga awal curve.
  return {
    status: 'read',
    asOf: nowSec,
    volume24h: volume.toString(),
    trades24h: count,
    price24hAgo: curvePriceAt(shape, 0n).toString(),
    reference: 'start',
  };
}

/** Perubahan harga dalam persepuluh persen (bulat ke arah nol); null bila pembanding nol. */
export function changeTenths(current: bigint, reference: bigint): bigint | null {
  if (reference <= 0n) return null;
  return ((current - reference) * 1_000n) / reference;
}

/** Wei → USD ber-18 desimal, memakai jawaban feed apa adanya (bilangan bulat ber-`decimals`). */
export function toUsd18(wei: bigint, rate: { answer: bigint; decimals: number }): bigint {
  return (wei * rate.answer) / 10n ** BigInt(rate.decimals);
}
