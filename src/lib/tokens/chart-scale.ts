import { formatCompactUnits, formatCompactUsd, formatUnitsFixed, formatUsd } from '@/lib/format';
import { marketCapWei, toUsd18 } from '@/lib/tokens/market';

// Satuan sumbu chart harga: harga per token atau market cap, dalam ETH atau USD. Murni.
// Candle selalu disimpan sebagai harga curve dalam wei per token; pengubahan ke satuan tampilan
// terjadi di sini, dengan bigint, tepat sebelum digambar dan diformat.

export type ChartScale = 'price' | 'mcap';

export interface ChartUnit {
  scale: ChartScale;
  /**
   * Kurs ETH/USD yang dipakai untuk SEMUA candle, atau null untuk ETH. Ini kurs saat dibaca, bukan
   * kurs pada waktu tiap trade; chart menyatakannya di keterangannya.
   */
  usd: { answer: bigint; decimals: number } | null;
}

export const CHART_SCALE_LABEL: Record<ChartScale, string> = { price: 'Price', mcap: 'Market cap' };

/** Harga curve (wei per token) → nilai tampilan ber-18 desimal dalam satuan yang dipilih. */
export function toDisplay(priceWei: bigint, unit: ChartUnit): bigint {
  const base = unit.scale === 'mcap' ? marketCapWei(priceWei) : priceWei;
  return unit.usd ? toUsd18(base, unit.usd) : base;
}

/** Teks ringkas untuk sumbu dan legenda. */
export function formatDisplay(value: bigint, unit: ChartUnit, significant = 5): string {
  return unit.usd ? formatCompactUsd(value) : formatCompactUnits(value, 18, significant);
}

/** Teks lengkap untuk tabel pembaca layar. */
export function formatDisplayFull(value: bigint, unit: ChartUnit): string {
  if (unit.usd) return formatUsd(value);
  return `${formatUnitsFixed(value, 18, unit.scale === 'mcap' ? 4 : 12)} ETH`;
}

/** Keterangan satuan di kaki chart, mis. "MARKET CAP IN USD". */
export function unitCaption(unit: ChartUnit): string {
  return `${unit.scale === 'mcap' ? 'MARKET CAP' : 'PRICES'} IN ${unit.usd ? 'USD' : 'ETH'}`;
}

// Library chart hanya menerima angka sampai sekitar 9×10^13. Market cap dalam wei jauh di atas
// itu, jadi nilai tampilan dibagi pembagi pangkat sepuluh sebelum digambar dan dikalikan kembali
// saat label diformat. Ada ruang seribu kali lipat di atas nilai tertinggi, supaya kenaikan harga
// biasa tidak mengubah pembaginya.
const PLOT_LIMIT = 90_000_000_000_000n;
const PLOT_HEADROOM = 1_000n;

/** Pembagi pangkat sepuluh terkecil yang membuat `peak` (dengan ruang gerak) muat di batas plot. */
export function plotDivisor(peak: bigint): bigint {
  let divisor = 1n;
  while ((peak * PLOT_HEADROOM) / divisor >= PLOT_LIMIT) divisor *= 10n;
  return divisor;
}
