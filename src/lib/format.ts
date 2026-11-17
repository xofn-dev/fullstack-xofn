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
