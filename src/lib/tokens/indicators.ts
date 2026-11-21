// Indikator chart, dihitung dari harga penutupan candle yang benar-benar ada. Selama data belum
// cukup (masa pemanasan) hasilnya null: tidak ada nilai yang diisi dengan perkiraan.
// Memakai `number`: ini matematika untuk garis di chart, bukan jumlah yang ditampilkan.

export const MA_PERIOD = 20;
export const EMA_PERIOD = 20;
export const RSI_PERIOD = 14;

/** Rata-rata sederhana `period` nilai terakhir. */
export function sma(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index] ?? 0;
    if (index >= period) sum -= values[index - period] ?? 0;
    out.push(index >= period - 1 ? sum / period : null);
  }
  return out;
}

/** Rata-rata eksponensial; nilai pertamanya adalah SMA `period` nilai pertama. */
export function ema(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const weight = 2 / (period + 1);
  let sum = 0;
  let previous: number | null = null;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    if (previous === null) {
      sum += value;
      if (index === period - 1) previous = sum / period;
      out.push(previous);
    } else {
      previous = value * weight + previous * (1 - weight);
      out.push(previous);
    }
  }
  return out;
}

/** RSI Wilder (0–100). Butuh `period + 1` nilai sebelum angka pertamanya. */
export function rsi(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = values.length > 0 ? [null] : [];
  let gain = 0;
  let loss = 0;
  for (let index = 1; index < values.length; index += 1) {
    const change = (values[index] ?? 0) - (values[index - 1] ?? 0);
    const up = change > 0 ? change : 0;
    const down = change < 0 ? -change : 0;
    if (index <= period) {
      gain += up;
      loss += down;
      if (index < period) {
        out.push(null);
        continue;
      }
      gain /= period;
      loss /= period;
    } else {
      gain = (gain * (period - 1) + up) / period;
      loss = (loss * (period - 1) + down) / period;
    }
    // Tanpa penurunan sama sekali RSI = 100; tanpa pergerakan sama sekali ditulis 50 (netral).
    out.push(loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  }
  return out;
}

/** Jumlah candle yang dibutuhkan sebelum sebuah indikator punya nilai pertama. */
export const INDICATOR_WARMUP = { ma: MA_PERIOD, ema: EMA_PERIOD, rsi: RSI_PERIOD + 1 } as const;
