import { priceAtRaised } from '@/lib/web3/curve-trade';

// Geometri chart halaman token. Murni dan tanpa DOM supaya bisa diuji. Angka diubah ke `number`
// HANYA untuk posisi piksel; label selalu diformat dari bigint aslinya.

export interface ChartPoint {
  /** Posisi horizontal 0..1. */
  x: number;
  /** Harga dalam wei per token. */
  price: bigint;
  /** ETH terkumpul di titik ini (mode curve); null di mode trade. */
  raised: bigint | null;
}

export interface CurveShape {
  virtualEth: bigint;
  virtualTokens: bigint;
  saleSupply: bigint;
  graduationThreshold: bigint;
}

/** Titik bonding curve dari 0 sampai ambang graduation, berjarak sama dalam ETH terkumpul. */
export function curveSamples(shape: CurveShape, count = 64): ChartPoint[] {
  const steps = Math.max(2, Math.floor(count));
  const threshold = shape.graduationThreshold;
  if (threshold <= 0n) return [];
  const points: ChartPoint[] = [];
  for (let index = 0; index < steps; index += 1) {
    const raised = (threshold * BigInt(index)) / BigInt(steps - 1);
    points.push({
      x: index / (steps - 1),
      price: priceAtRaised({ ...shape, ethRaised: raised }),
      raised,
    });
  }
  return points;
}

/** Titik harga per trade (spark dari server): tersebar rata dari kiri ke kanan. */
export function tradeSamples(spark: readonly string[]): ChartPoint[] {
  if (spark.length === 0) return [];
  if (spark.length === 1) {
    const price = BigInt(spark[0] ?? '0');
    return [
      { x: 0, price, raised: null },
      { x: 1, price, raised: null },
    ];
  }
  return spark.map((value, index) => ({ x: index / (spark.length - 1), price: BigInt(value), raised: null }));
}

export interface ChartScale {
  min: bigint;
  max: bigint;
  /** Posisi vertikal 0 (atas) .. 1 (bawah) untuk sebuah harga. */
  y(price: bigint): number;
}

/** Skala vertikal dengan sedikit ruang di atas dan bawah. Rentang nol digambar di tengah. */
export function priceScale(points: readonly ChartPoint[], pad = 0.12): ChartScale {
  let min = points[0]?.price ?? 0n;
  let max = min;
  for (const point of points) {
    if (point.price < min) min = point.price;
    if (point.price > max) max = point.price;
  }
  const span = max - min;
  return {
    min,
    max,
    y(price) {
      if (span === 0n) return 0.5;
      // Skala 1e6 menjaga presisi pembagian bigint sebelum diubah ke number.
      const ratio = Number(((price - min) * 1_000_000n) / span) / 1_000_000;
      return pad + (1 - ratio) * (1 - 2 * pad);
    },
  };
}

/** Atribut `points` SVG untuk garis, dalam kotak `width` × `height`. */
export function linePoints(points: readonly ChartPoint[], scale: ChartScale, width: number, height: number): string {
  return points
    .map((point) => `${(point.x * width).toFixed(1)},${(scale.y(point.price) * height).toFixed(1)}`)
    .join(' ');
}

/** Poligon area di bawah garis sampai dasar chart. */
export function areaPoints(points: readonly ChartPoint[], scale: ChartScale, width: number, height: number): string {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return '';
  return `${(first.x * width).toFixed(1)},${height} ${linePoints(points, scale, width, height)} ${(last.x * width).toFixed(1)},${height}`;
}

/** Indeks titik terdekat dengan posisi horizontal 0..1 (untuk crosshair). */
export function nearestIndex(points: readonly ChartPoint[], x: number): number {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const gap = Math.abs(point.x - x);
    if (gap < distance) {
      distance = gap;
      best = index;
    }
  });
  return best;
}

/** Posisi 0..1 sebuah nilai ETH terkumpul terhadap ambang graduation. */
export function raisedPosition(ethRaised: bigint, threshold: bigint): number {
  if (threshold <= 0n) return 0;
  if (ethRaised >= threshold) return 1;
  if (ethRaised <= 0n) return 0;
  return Number((ethRaised * 1_000_000n) / threshold) / 1_000_000;
}
