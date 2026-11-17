// Pemformat tampilan. Semua fungsi murni dan dites di tests/format.test.ts.

const INT_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatInt(value: number): string {
  return INT_FORMAT.format(Math.round(value));
}

/** Alamat EVM ringkas: 0x1234…abcd. Input yang terlalu pendek dikembalikan apa adanya. */
export function shortAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** Waktu UTC tetap, mis. "2026-11-17 10:13 UTC". Dipakai untuk "Checked at". */
export function formatUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

/** Titik sparkline deterministik untuk kartu token demo (sama dengan rumus di HTML konsep). */
export function sparklinePoints(seed: number, count = 40, width = 250, height = 68): string {
  let v = height * 0.8;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    v += (Math.sin(i * 0.68 + seed) + Math.cos(i * 0.37 + seed)) * 2.1 + 0.22;
    v = Math.max(8, Math.min(height - 8, v));
    out.push(`${((i / (count - 1)) * width).toFixed(1)},${(height - v).toFixed(1)}`);
  }
  return out.join(' ');
}

const TICKER_PATTERN = /^[a-zA-Z0-9]{2,12}$/;
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export function isValidTicker(value: string): boolean {
  return TICKER_PATTERN.test(value);
}

// Validasi bentuk saja untuk form demo Phase 1. Check nyata (Phase 2) memakai viem.isAddress.
export function looksLikeEvmAddress(value: string): boolean {
  return EVM_ADDRESS_PATTERN.test(value);
}

// ───────────── Jumlah on-chain (Phase 4). Semua murni; bigint tidak pernah lewat Number. ─────────────

function groupThousands(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Memformat jumlah bersatuan terkecil (wei/unit token) dengan pemisah ribuan dan pecahan dipotong. */
export function formatUnitsFixed(value: bigint | string, decimals = 18, maxFraction = 4): string {
  const raw = typeof value === 'string' ? BigInt(value) : value;
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
  const text = fraction ? `${groupThousands(whole.toString())}.${fraction}` : groupThousands(whole.toString());
  // Nilai positif yang terpotong menjadi nol ditulis "<0.0001", bukan "0".
  if (abs > 0n && whole === 0n && fraction === '') return `<0.${'0'.repeat(Math.max(0, maxFraction - 1))}1`;
  return negative ? `-${text}` : text;
}

export function formatEth(wei: bigint | string, maxFraction = 5): string {
  return `${formatUnitsFixed(wei, 18, maxFraction)} ETH`;
}

export function formatTokens(units: bigint | string, maxFraction = 2): string {
  return formatUnitsFixed(units, 18, maxFraction);
}

/** Basis poin → persen satu desimal, mis. 2500 → "25.0%". */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Input jumlah dari pengguna → satuan terkecil. null bila kosong, bukan angka desimal biasa,
 * negatif, atau punya lebih banyak angka pecahan daripada `decimals`.
 */
export function parseAmount(input: string, decimals = 18): bigint | null {
  const text = input.trim();
  if (!AMOUNT_PATTERN.test(text)) return null;
  const [whole = '0', fraction = ''] = text.split('.');
  if (fraction.length > decimals) return null;
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

/** Titik polyline SVG dari deret harga (string bigint). Deret konstan digambar sebagai garis datar. */
export function pricePolyline(points: string[], width = 250, height = 68, pad = 8): string {
  if (points.length === 0) return '';
  const values = points.map((point) => BigInt(point));
  let min = values[0] ?? 0n;
  let max = min;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min;
  const usable = height - pad * 2;
  const series = values.length === 1 ? [values[0] ?? 0n, values[0] ?? 0n] : values;
  return series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * width;
      // Skala dihitung dalam bigint lalu baru diubah ke number (rasio 0–10000).
      const ratio = span === 0n ? 5_000 : Number(((value - min) * 10_000n) / span);
      const y = height - pad - (ratio / 10_000) * usable;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
