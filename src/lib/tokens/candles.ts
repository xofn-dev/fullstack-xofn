import type { CurveShape } from '@/lib/tokens/chart';
import type { TradePoint } from '@/types/domain';
import type { TradeSide } from '@/types/enums';

// Candle dari trade curve. Murni dan tanpa DOM. Semua harga dan volume tetap bigint; pengubahan
// ke `number` hanya terjadi di komponen chart, untuk posisi plot.
//
// Harga tidak dibaca dari trade: curve tidak memungut fee, jadi harga sebelum dan sesudah tiap
// trade diturunkan TEPAT dari `ethRaised` di event-nya. Tidak ada candle yang dikarang: bucket
// tanpa trade tidak menghasilkan candle, dan trade tanpa waktu blok tidak ikut.

const WAD = 10n ** 18n;

export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '7d', 'all'] as const;
export type TimeframeId = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_LABEL: Record<TimeframeId, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1D',
  '7d': '7D',
  all: 'All',
};

const MINUTE = 60;
const HOUR = 3_600;
const DAY = 86_400;
const BUCKETS = [MINUTE, 5 * MINUTE, 15 * MINUTE, HOUR, 4 * HOUR, DAY] as const;
const FIXED_BUCKET: Partial<Record<TimeframeId, number>> = {
  '1m': MINUTE,
  '5m': 5 * MINUTE,
  '15m': 15 * MINUTE,
  '1h': HOUR,
  '4h': 4 * HOUR,
  '1d': DAY,
};
const BUCKET_LABEL: Record<number, string> = {
  [MINUTE]: '1m',
  [5 * MINUTE]: '5m',
  [15 * MINUTE]: '15m',
  [HOUR]: '1h',
  [4 * HOUR]: '4h',
  [DAY]: '1D',
};

/** Label ukuran candle, mis. 300 → "5m". */
export function bucketLabel(bucketSec: number): string {
  return BUCKET_LABEL[bucketSec] ?? `${bucketSec}s`;
}

// Rentang "All" memilih ukuran candle terkecil yang masih menghasilkan paling banyak sekian candle.
const ALL_MAX_CANDLES = 240;

export interface PricedTrade {
  /** Waktu blok, detik Unix. */
  time: number;
  /** Harga curve (wei per token) tepat sebelum dan tepat sesudah trade ini. */
  priceBefore: bigint;
  priceAfter: bigint;
  /** ETH yang berpindah, wei. */
  eth: bigint;
  side: TradeSide;
}

export interface Candle {
  /** Awal bucket, detik Unix (lantai UTC). */
  time: number;
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  /** Volume ETH di bucket ini, wei. */
  volume: bigint;
  buyVolume: bigint;
  trades: number;
}

/**
 * Harga curve pada `raised` ETH terkumpul. Mengikuti kontrak: tepat di ambang graduation token
 * terjual dipaksa `saleSupply` (`XofNCurve._soldAt`).
 */
export function curvePriceAt(shape: CurveShape, raised: bigint): bigint {
  const reserveEth = shape.virtualEth + raised;
  if (reserveEth <= 0n) return 0n;
  let sold = shape.saleSupply;
  if (raised < shape.graduationThreshold) {
    const remaining = (shape.virtualEth * shape.virtualTokens + reserveEth - 1n) / reserveEth;
    const computed = shape.virtualTokens - remaining;
    if (computed < sold) sold = computed;
  }
  const left = shape.virtualTokens - sold;
  return left <= 0n ? 0n : (reserveEth * WAD) / left;
}

/**
 * Deret trade ber-waktu yang BERSAMBUNG dan berakhir di trade ber-waktu terakhir. Trade lama yang
 * waktunya belum terisi (di depan) dan trade yang baru terindeks (di belakang) dibuang; celah di
 * tengah memutus deret, supaya tidak ada candle yang kehilangan sebagian trade-nya.
 */
export function timedRun(points: readonly TradePoint[]): TradePoint[] {
  let end = points.length - 1;
  while (end >= 0 && points[end]?.time === null) end -= 1;
  let start = end;
  while (start > 0 && points[start - 1]?.time !== null) start -= 1;
  return end < 0 ? [] : points.slice(start, end + 1);
}

/** Trade ber-waktu → harga sebelum/sesudah. Trade tanpa waktu dilewati. */
export function priceTrades(points: readonly TradePoint[], shape: CurveShape): PricedTrade[] {
  const priced: PricedTrade[] = [];
  for (const point of points) {
    if (point.time === null) continue;
    const eth = BigInt(point.eth);
    const raisedAfter = BigInt(point.raised);
    const raisedBefore = point.side === 'buy' ? raisedAfter - eth : raisedAfter + eth;
    priced.push({
      time: point.time,
      priceBefore: curvePriceAt(shape, raisedBefore < 0n ? 0n : raisedBefore),
      priceAfter: curvePriceAt(shape, raisedAfter),
      eth,
      side: point.side,
    });
  }
  return priced;
}

/**
 * Candle per bucket waktu. Open = harga sebelum trade pertama di bucket; close = harga sesudah
 * trade terakhir; high/low = ekstrem dari keduanya (harga curve monoton di dalam satu trade).
 */
export function bucketCandles(trades: readonly PricedTrade[], bucketSec: number): Candle[] {
  const candles: Candle[] = [];
  let current: Candle | null = null;
  for (const trade of trades) {
    const time = Math.floor(trade.time / bucketSec) * bucketSec;
    if (!current || current.time !== time) {
      current = {
        time,
        open: trade.priceBefore,
        high: trade.priceBefore,
        low: trade.priceBefore,
        close: trade.priceBefore,
        volume: 0n,
        buyVolume: 0n,
        trades: 0,
      };
      candles.push(current);
    }
    if (trade.priceAfter > current.high) current.high = trade.priceAfter;
    if (trade.priceAfter < current.low) current.low = trade.priceAfter;
    current.close = trade.priceAfter;
    current.volume += trade.eth;
    if (trade.side === 'buy') current.buyVolume += trade.eth;
    current.trades += 1;
  }
  return candles;
}

export interface TimeframeView {
  bucketSec: number;
  /** Batas awal data yang dipakai (detik Unix); null = seluruh riwayat. */
  from: number | null;
}

/**
 * 1m–1D adalah UKURAN candle di atas seluruh riwayat. 7D dan All adalah RENTANG: 7D memakai
 * candle 1 jam, All memilih ukuran candle dari panjang riwayatnya.
 */
export function resolveTimeframe(id: TimeframeId, first: number | null, last: number | null): TimeframeView {
  const fixed = FIXED_BUCKET[id];
  if (fixed !== undefined) return { bucketSec: fixed, from: null };
  if (id === '7d') return { bucketSec: HOUR, from: last === null ? null : last - 7 * DAY };
  const span = first === null || last === null ? 0 : Math.max(0, last - first);
  const bucketSec = BUCKETS.find((bucket) => span / bucket <= ALL_MAX_CANDLES) ?? DAY;
  return { bucketSec, from: null };
}

/** Candle untuk satu timeframe dari trade berharga. */
export function candlesFor(trades: readonly PricedTrade[], id: TimeframeId): { candles: Candle[]; view: TimeframeView } {
  const view = resolveTimeframe(id, trades[0]?.time ?? null, trades.at(-1)?.time ?? null);
  const from = view.from;
  const visible = from === null ? trades : trades.filter((trade) => trade.time >= from);
  return { candles: bucketCandles(visible, view.bucketSec), view };
}

const sameCandle = (a: Candle, b: Candle) =>
  a.time === b.time &&
  a.open === b.open &&
  a.high === b.high &&
  a.low === b.low &&
  a.close === b.close &&
  a.volume === b.volume;

export type CandleDiff = { kind: 'none' } | { kind: 'tail'; bars: Candle[] } | { kind: 'reset' };

/**
 * Perbedaan dua deret candle untuk chart: `tail` bila hanya candle terakhir berubah dan/atau ada
 * candle baru di belakangnya (cukup `series.update`); selain itu `reset` (`series.setData`).
 */
export function diffCandles(prev: readonly Candle[], next: readonly Candle[]): CandleDiff {
  if (prev.length === 0) return next.length === 0 ? { kind: 'none' } : { kind: 'reset' };
  if (next.length < prev.length) return { kind: 'reset' };
  for (let index = 0; index < prev.length - 1; index += 1) {
    const before = prev[index];
    const after = next[index];
    if (!before || !after || !sameCandle(before, after)) return { kind: 'reset' };
  }
  const lastPrev = prev[prev.length - 1];
  const sameSlot = next[prev.length - 1];
  if (!lastPrev || !sameSlot || lastPrev.time !== sameSlot.time) return { kind: 'reset' };
  if (next.length === prev.length && sameCandle(lastPrev, sameSlot)) return { kind: 'none' };
  return { kind: 'tail', bars: next.slice(prev.length - 1) };
}
