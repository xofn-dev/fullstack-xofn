// Pembatas laju sederhana (jendela geser) untuk Re-check paksa. Per proses: cukup untuk
// melindungi RPC publik saat pengembangan. Untuk produksi multi-instance, pembatasan perlu
// dipindah ke penyimpanan bersama atau CDN (ARCHITECTURE §8) — itu keputusan saat deploy.

export interface RateLimiter {
  /** true = diizinkan dan dicatat; false = melebihi batas. */
  take(id: string, now?: number): boolean;
}

export function createRateLimiter(options: { limit: number; windowMs: number; maxIds?: number }): RateLimiter {
  const { limit, windowMs, maxIds = 2000 } = options;
  const hits = new Map<string, number[]>();
  return {
    take(id: string, now = Date.now()): boolean {
      const recent = (hits.get(id) ?? []).filter((time) => now - time < windowMs);
      if (recent.length >= limit) {
        hits.set(id, recent);
        return false;
      }
      recent.push(now);
      hits.delete(id);
      hits.set(id, recent);
      // Batasi memori: buang id yang paling lama tidak aktif.
      while (hits.size > maxIds) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
      }
      return true;
    },
  };
}
