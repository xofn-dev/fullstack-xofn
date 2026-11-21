import { describe, expect, it } from 'vitest';
import { formatCompactUnits, formatCompactUsd, formatUsd } from '@/lib/format';
import { countUntimedBlocks, untimedBlocks } from '@/lib/tokens/block-times';
import {
  bucketCandles,
  bucketLabel,
  candlesFor,
  curvePriceAt,
  diffCandles,
  priceTrades,
  resolveTimeframe,
  timedRun,
  type Candle,
} from '@/lib/tokens/candles';
import { formatDisplay, formatDisplayFull, plotDivisor, toDisplay, unitCaption } from '@/lib/tokens/chart-scale';
import { withAlpha } from '@/lib/tokens/chart-theme';
import { ETH_USD_MAX_AGE_SEC, readEthUsd, type FeedReader } from '@/lib/tokens/eth-usd';
import { historyCursor, historyPage, mergeHistory, parseHistoryQuery, toTradePoint, type HistoryState } from '@/lib/tokens/history';
import { ema, rsi, sma } from '@/lib/tokens/indicators';
import { FIXED_SUPPLY, changeTenths, market24h, marketCapWei, toUsd18 } from '@/lib/tokens/market';
import { priceAtRaised } from '@/lib/web3/curve-trade';
import type { Address, Trade, TradePoint } from '@/types/domain';

const ETH = 10n ** 18n;
const TRADER: Address = '0x00000000000000000000000000000000000000d1';

// Bentuk curve yang sama dengan tes lain: ambang 4 ETH, 800 juta token dijual.
const SHAPE = {
  virtualEth: ETH,
  virtualTokens: 10n ** 27n,
  saleSupply: 8n * 10n ** 26n,
  graduationThreshold: 4n * ETH,
};

/** Trade beruntun di curve: `ethRaised` dijalankan dari jumlah tiap trade. */
function tradeSeries(steps: Array<{ side: 'buy' | 'sell'; eth: bigint; block: number; time: number | null }>): Trade[] {
  let raised = 0n;
  return steps.map((step, index) => {
    raised = step.side === 'buy' ? raised + step.eth : raised - step.eth;
    return {
      side: step.side,
      trader: TRADER,
      ethAmount: step.eth.toString(),
      tokenAmount: '1',
      ethRaised: raised.toString(),
      blockNumber: String(step.block),
      txHash: `0x${(index + 1).toString(16).padStart(64, '0')}`,
      logIndex: 0,
      timestamp: step.time,
    };
  });
}

// Tepat di batas jam UTC, supaya batas bucket di tes mudah dibaca.
const T0 = 1_699_999_200;
const HOUR = 3_600;

describe('blok yang waktunya belum terbaca', () => {
  const trades = tradeSeries([
    { side: 'buy', eth: ETH / 10n, block: 5, time: null },
    { side: 'buy', eth: ETH / 10n, block: 7, time: T0 },
    { side: 'buy', eth: ETH / 10n, block: 9, time: null },
    { side: 'sell', eth: ETH / 20n, block: 9, time: null },
    { side: 'buy', eth: ETH / 10n, block: 11, time: null },
  ]);

  it('terbaru dulu, tanpa ganda, dibatasi, dan melewati yang baru gagal', () => {
    expect(untimedBlocks(trades, 10, () => false)).toEqual(['11', '9', '5']);
    expect(untimedBlocks(trades, 2, () => false)).toEqual(['11', '9']);
    expect(untimedBlocks(trades, 2, (block) => block === '11')).toEqual(['9', '5']);
    expect(untimedBlocks(trades, 0, () => false)).toEqual([]);
    expect(countUntimedBlocks(trades)).toBe(3);
  });
});

describe('riwayat trade untuk chart', () => {
  const trades = tradeSeries([
    { side: 'buy', eth: ETH / 10n, block: 5, time: T0 },
    { side: 'buy', eth: ETH / 10n, block: 7, time: T0 + 60 },
    { side: 'sell', eth: ETH / 20n, block: 9, time: null },
  ]);
  const at = '2026-11-21T00:00:00.000Z';

  it('parameter URL yang tidak sah diperlakukan sebagai permintaan penuh', () => {
    expect(parseHistoryQuery(new URLSearchParams('after=7:0&timed=2'))).toEqual({ after: '7:0', timed: 2 });
    expect(parseHistoryQuery(new URLSearchParams(''))).toEqual({ after: null, timed: 0 });
    expect(parseHistoryQuery(new URLSearchParams('after=7:0'))).toEqual({ after: '7:0', timed: 0 });
    expect(parseHistoryQuery(new URLSearchParams('after=abc&timed=2'))).toEqual({ after: null, timed: 0 });
    expect(parseHistoryQuery(new URLSearchParams('after=7:0&timed=-1'))).toEqual({ after: null, timed: 0 });
    expect(parseHistoryQuery(new URLSearchParams("after=7:0';drop&timed=1"))).toEqual({ after: null, timed: 0 });
  });

  it('halaman penuh, lalu delta hanya berisi trade sesudah kursor', () => {
    const full = historyPage(trades, { after: null, timed: 0 }, at);
    expect(full).toMatchObject({ mode: 'full', total: 3, timed: 2 });
    expect(full.points.map((point) => point.key)).toEqual(['5:0', '7:0', '9:0']);
    const state = mergeHistory(null, full, { after: null, timed: 0 });
    // Kursor = trade ber-waktu terakhir; trade tanpa waktu di belakangnya dikirim ulang.
    expect(historyCursor(state)).toEqual({ after: '7:0', timed: 2 });

    const delta = historyPage(trades, historyCursor(state), at);
    expect(delta.mode).toBe('delta');
    expect(delta.points.map((point) => point.key)).toEqual(['9:0']);
    // Tidak ada yang berubah: objek riwayat yang sama dikembalikan (chart tidak dihitung ulang).
    expect(mergeHistory(state, delta, historyCursor(state))).toBe(state);
  });

  it('trade baru dan waktu yang baru terisi disambung ke riwayat lokal', () => {
    const state = mergeHistory(null, historyPage(trades, { after: null, timed: 0 }, at), { after: null, timed: 0 });
    const sent = historyCursor(state);
    const grown = [...trades.slice(0, 2), { ...trades[2]!, timestamp: T0 + 120 }, ...tradeSeries([{ side: 'buy', eth: ETH, block: 12, time: null }])];
    const next = mergeHistory(state, historyPage(grown, sent, at), sent);
    expect(next.points.map((point) => [point.key, point.time])).toEqual([
      ['5:0', T0],
      ['7:0', T0 + 60],
      ['9:0', T0 + 120],
      ['12:0', null],
    ]);
    expect(next).toMatchObject({ total: 4, timed: 3 });
  });

  it('waktu trade LAMA terisi (jumlah ber-waktu di kursor berbeda) → seluruh riwayat dikirim lagi', () => {
    const old = tradeSeries([
      { side: 'buy', eth: ETH / 10n, block: 3, time: null },
      { side: 'buy', eth: ETH / 10n, block: 5, time: T0 },
    ]);
    const state = mergeHistory(null, historyPage(old, { after: null, timed: 0 }, at), { after: null, timed: 0 });
    const sent = historyCursor(state);
    expect(sent).toEqual({ after: '5:0', timed: 1 });
    const filled = [{ ...old[0]!, timestamp: T0 - 60 }, old[1]!];
    const page = historyPage(filled, sent, at);
    expect(page.mode).toBe('full');
    expect(mergeHistory(state, page, sent).points[0]?.time).toBe(T0 - 60);
  });

  it('kursor yang tidak dikenal (index diulang) → penuh; riwayat tanpa trade ber-waktu tidak punya kursor', () => {
    expect(historyPage(trades, { after: '999:0', timed: 2 }, at).mode).toBe('full');
    const untimed: HistoryState = { points: [toTradePoint(trades[2]!)], total: 1, timed: 0, checkedAt: at };
    expect(historyCursor(untimed)).toEqual({ after: null, timed: 0 });
    expect(historyCursor(null)).toEqual({ after: null, timed: 0 });
  });
});

describe('candle dari trade curve', () => {
  const trades = tradeSeries([
    { side: 'buy', eth: ETH / 2n, block: 5, time: T0 + 10 },
    { side: 'buy', eth: ETH / 2n, block: 6, time: T0 + 50 },
    { side: 'sell', eth: ETH / 4n, block: 7, time: T0 + 70 },
    // Tidak ada trade selama dua jam berikutnya.
    { side: 'buy', eth: ETH, block: 9, time: T0 + 3 * HOUR },
  ]);
  const points = trades.map(toTradePoint);
  const priced = priceTrades(points, SHAPE);

  it('harga sebelum dan sesudah trade diturunkan dari ethRaised (curve tanpa fee)', () => {
    expect(priced[0]?.priceBefore).toBe(curvePriceAt(SHAPE, 0n));
    expect(priced[0]?.priceAfter).toBe(curvePriceAt(SHAPE, ETH / 2n));
    // Jual: sebelum = raised sesudah + ETH yang keluar.
    expect(priced[2]?.priceBefore).toBe(curvePriceAt(SHAPE, ETH));
    expect(priced[2]?.priceAfter).toBe(curvePriceAt(SHAPE, (ETH * 3n) / 4n));
    expect(priced[2]!.priceAfter).toBeLessThan(priced[2]!.priceBefore);
    // Harga curve bersambung: sesudah trade n = sebelum trade n+1.
    expect(priced[1]?.priceBefore).toBe(priced[0]?.priceAfter);
  });

  it('di bawah ambang sama dengan rumus yang sudah ada; di ambang token terjual dipaksa saleSupply', () => {
    for (const raised of [0n, ETH / 3n, ETH, 3n * ETH]) {
      expect(curvePriceAt(SHAPE, raised)).toBe(priceAtRaised({ ...SHAPE, ethRaised: raised }));
    }
    const left = SHAPE.virtualTokens - SHAPE.saleSupply;
    expect(curvePriceAt(SHAPE, 4n * ETH)).toBe(((SHAPE.virtualEth + 4n * ETH) * ETH) / left);
  });

  it('bucket: open = harga sebelum trade pertama, close = sesudah trade terakhir, bucket kosong TIDAK dibuat', () => {
    const minute = bucketCandles(priced, 60);
    expect(minute.map((candle) => candle.time)).toEqual([T0, T0 + 60, T0 + 3 * HOUR]);
    const [first, second] = minute;
    expect(first).toMatchObject({ open: priced[0]!.priceBefore, close: priced[1]!.priceAfter, volume: ETH, buyVolume: ETH, trades: 2 });
    expect(first!.high).toBe(priced[1]!.priceAfter);
    expect(first!.low).toBe(priced[0]!.priceBefore);
    // Candle turun: open di atas close, volume beli nol.
    expect(second).toMatchObject({ open: priced[2]!.priceBefore, close: priced[2]!.priceAfter, volume: ETH / 4n, buyVolume: 0n });
    expect(second!.high).toBe(second!.open);
    expect(second!.low).toBe(second!.close);

    const hourly = bucketCandles(priced, HOUR);
    // Dua jam tanpa trade tidak menghasilkan candle karangan.
    expect(hourly).toHaveLength(2);
    expect(hourly[1]!.time - hourly[0]!.time).toBe(3 * HOUR);
    expect(hourly.every((candle) => candle.time % HOUR === 0)).toBe(true);
  });

  it('hanya deret ber-waktu yang bersambung yang dipakai', () => {
    const mixed: TradePoint[] = [
      { ...points[0]!, time: null },
      points[1]!,
      points[2]!,
      { ...points[3]!, time: null },
    ];
    expect(timedRun(mixed).map((point) => point.key)).toEqual(['6:0', '7:0']);
    // Celah di tengah memutus deret: yang dipakai hanya ekor sesudah celah.
    const gap: TradePoint[] = [points[0]!, { ...points[1]!, time: null }, points[2]!, points[3]!];
    expect(timedRun(gap).map((point) => point.key)).toEqual(['7:0', '9:0']);
    expect(timedRun([{ ...points[0]!, time: null }])).toEqual([]);
    expect(timedRun([])).toEqual([]);
    expect(priceTrades(mixed, SHAPE)).toHaveLength(2);
  });

  it('timeframe: 1m–1D ukuran candle; 7D dan All rentang', () => {
    expect(resolveTimeframe('5m', T0, T0 + HOUR)).toEqual({ bucketSec: 300, from: null });
    expect(resolveTimeframe('1d', T0, T0 + HOUR)).toEqual({ bucketSec: 86_400, from: null });
    expect(resolveTimeframe('7d', T0, T0 + 30 * 86_400)).toEqual({ bucketSec: HOUR, from: T0 + 23 * 86_400 });
    // All memilih candle terkecil yang masih paling banyak 240 batang.
    expect(resolveTimeframe('all', T0, T0 + 2 * HOUR).bucketSec).toBe(60);
    expect(resolveTimeframe('all', T0, T0 + 30 * 86_400).bucketSec).toBe(14_400);
    expect(resolveTimeframe('all', T0, T0 + 400 * 86_400).bucketSec).toBe(86_400);
    expect(resolveTimeframe('all', null, null)).toEqual({ bucketSec: 60, from: null });
    expect(bucketLabel(300)).toBe('5m');
    expect(bucketLabel(86_400)).toBe('1D');

    const week = candlesFor(
      priceTrades(
        tradeSeries([
          { side: 'buy', eth: ETH / 10n, block: 1, time: T0 },
          { side: 'buy', eth: ETH / 10n, block: 2, time: T0 + 10 * 86_400 },
        ]).map(toTradePoint),
        SHAPE,
      ),
      '7d',
    );
    // Trade yang lebih tua dari tujuh hari sebelum trade terakhir tidak ikut.
    expect(week.candles).toHaveLength(1);
  });

  it('diff: tanpa perubahan, ekor berubah/bertambah, atau pasang ulang', () => {
    const base = bucketCandles(priced, 60);
    expect(diffCandles(base, base)).toEqual({ kind: 'none' });
    expect(diffCandles([], [])).toEqual({ kind: 'none' });
    expect(diffCandles([], base)).toEqual({ kind: 'reset' });

    // Trade kelima jatuh di menit yang sama dengan trade keempat: hanya candle terakhir yang berubah.
    const grown = tradeSeries([
      { side: 'buy', eth: ETH / 2n, block: 5, time: T0 + 10 },
      { side: 'buy', eth: ETH / 2n, block: 6, time: T0 + 50 },
      { side: 'sell', eth: ETH / 4n, block: 7, time: T0 + 70 },
      { side: 'buy', eth: ETH, block: 9, time: T0 + 3 * HOUR },
      { side: 'buy', eth: ETH / 10n, block: 10, time: T0 + 3 * HOUR + 20 },
    ]);
    const more = bucketCandles(priceTrades(grown.map(toTradePoint), SHAPE), 60);
    const tail = diffCandles(base, more);
    expect(tail.kind).toBe('tail');
    expect(tail.kind === 'tail' && tail.bars.map((bar) => bar.time)).toEqual([base.at(-1)!.time]);
    expect(tail.kind === 'tail' && tail.bars[0]?.trades).toBe(2);

    const appended: Candle[] = [...base, { ...base.at(-1)!, time: base.at(-1)!.time + 60 }];
    const added = diffCandles(base, appended);
    expect(added.kind === 'tail' && added.bars).toHaveLength(2);

    expect(diffCandles(base, base.slice(0, 2))).toEqual({ kind: 'reset' });
    expect(diffCandles(base, bucketCandles(priced, HOUR))).toEqual({ kind: 'reset' });
  });
});

describe('indikator', () => {
  const values = [1, 2, 3, 4, 5, 6];

  it('SMA: null selama pemanasan, lalu rata-rata jendela', () => {
    expect(sma(values, 3)).toEqual([null, null, 2, 3, 4, 5]);
    expect(sma([1, 2], 3)).toEqual([null, null]);
    expect(sma([], 3)).toEqual([]);
  });

  it('EMA: dimulai dari SMA jendela pertama', () => {
    const out = ema(values, 3);
    expect(out.slice(0, 3)).toEqual([null, null, 2]);
    // Bobot 2/(3+1) = 0,5: 4*0,5 + 2*0,5 = 3, lalu 5*0,5 + 3*0,5 = 4.
    expect(out.slice(3)).toEqual([3, 4, 5]);
  });

  it('RSI Wilder: butuh period + 1 nilai; naik terus = 100, turun terus = 0, datar = 50', () => {
    expect(rsi(values, 3)).toEqual([null, null, null, 100, 100, 100]);
    expect(rsi([6, 5, 4, 3, 2], 3)).toEqual([null, null, null, 0, 0]);
    expect(rsi([5, 5, 5, 5, 5], 3)).toEqual([null, null, null, 50, 50]);
    expect(rsi([1, 2, 3], 3)).toEqual([null, null, null]);
    // Naik 2, turun 1, naik 2 → rata-rata naik 4/3, turun 1/3 → RS 4 → RSI 80.
    expect(rsi([10, 12, 11, 13], 3).at(-1)).toBeCloseTo(80, 10);
  });
});

describe('statistik pasar', () => {
  const now = T0 + 30 * HOUR;

  it('market cap = harga × suplai tetap', () => {
    expect(FIXED_SUPPLY).toBe(999_000_000);
    expect(marketCapWei(1_500_000_000n)).toBe(1_498_500_000_000_000_000n);
  });

  it('24 jam: volume di dalam jendela, harga pembanding dari trade terakhir sebelum jendela', () => {
    const trades = tradeSeries([
      { side: 'buy', eth: ETH / 2n, block: 1, time: now - 30 * HOUR },
      { side: 'buy', eth: ETH / 4n, block: 2, time: now - 10 * HOUR },
      { side: 'sell', eth: ETH / 8n, block: 3, time: now - HOUR },
    ]);
    const window = market24h(trades, SHAPE, now);
    expect(window).toMatchObject({ status: 'read', reference: 'window', trades24h: 2, asOf: now });
    expect(window.volume24h).toBe((ETH / 4n + ETH / 8n).toString());
    expect(window.price24hAgo).toBe(curvePriceAt(SHAPE, ETH / 2n).toString());
  });

  it('token berumur kurang dari 24 jam: pembandingnya harga awal curve', () => {
    const trades = tradeSeries([{ side: 'buy', eth: ETH / 2n, block: 1, time: now - HOUR }]);
    expect(market24h(trades, SHAPE, now)).toMatchObject({
      status: 'read',
      reference: 'start',
      trades24h: 1,
      price24hAgo: curvePriceAt(SHAPE, 0n).toString(),
    });
    expect(market24h([], SHAPE, now)).toMatchObject({ status: 'read', reference: 'start', volume24h: '0', trades24h: 0 });
  });

  it('trade tanpa waktu di jalur jendela → unread, tidak ada angka yang ditebak', () => {
    const trades = tradeSeries([
      { side: 'buy', eth: ETH / 2n, block: 1, time: now - 30 * HOUR },
      { side: 'buy', eth: ETH / 4n, block: 2, time: null },
      { side: 'buy', eth: ETH / 8n, block: 3, time: now - HOUR },
    ]);
    expect(market24h(trades, SHAPE, now)).toEqual({
      status: 'unread',
      asOf: now,
      volume24h: null,
      trades24h: null,
      price24hAgo: null,
      reference: 'window',
    });
    // Trade tanpa waktu yang LEBIH TUA dari trade pembanding tidak memengaruhi hasil.
    const older = tradeSeries([
      { side: 'buy', eth: ETH / 2n, block: 1, time: null },
      { side: 'buy', eth: ETH / 4n, block: 2, time: now - 30 * HOUR },
      { side: 'buy', eth: ETH / 8n, block: 3, time: now - HOUR },
    ]);
    expect(market24h(older, SHAPE, now).status).toBe('read');
  });

  it('perubahan harga dan konversi USD tetap bigint', () => {
    expect(changeTenths(110n, 100n)).toBe(100n);
    expect(changeTenths(95n, 100n)).toBe(-50n);
    expect(changeTenths(100n, 0n)).toBeNull();
    const rate = { answer: 163_788_000_000n, decimals: 8 };
    expect(toUsd18(ETH, rate)).toBe(1_637_880_000_000_000_000_000n);
    expect(formatUsd(toUsd18(ETH, rate))).toBe('$1,637.88');
    expect(formatUsd(toUsd18(1_500_000_000n, rate))).toBe('$0.000002456');
    expect(formatUsd(0n)).toBe('$0');
    expect(formatUsd(1_234_567n * ETH + ETH / 2n)).toBe('$1,234,567.50');
    expect(formatUsd(-ETH)).toBe('-$1.00');
  });
});

describe('kurs ETH/USD dari feed on-chain', () => {
  const source = { network: 'mainnet', chain: 'robinhood', feed: '0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9' } as const;
  const now = new Date('2026-11-21T00:00:00Z');
  const nowSec = Math.floor(now.getTime() / 1_000);
  const feed = (patch: Partial<{ description: string; decimals: number; answer: bigint; updatedAt: number; fail: boolean }> = {}): FeedReader => ({
    async readContract({ functionName }) {
      if (patch.fail) throw new Error('rpc down');
      if (functionName === 'description') return patch.description ?? 'ETH / USD';
      if (functionName === 'decimals') return patch.decimals ?? 8;
      return [1n, patch.answer ?? 163_788_000_000n, 0n, BigInt(patch.updatedAt ?? nowSec - 600), 1n];
    },
  });

  it('jawaban yang sah dikembalikan bersama sumber dan waktu bacanya', async () => {
    expect(await readEthUsd(feed(), source, now)).toEqual({
      answer: '163788000000',
      decimals: 8,
      updatedAt: nowSec - 600,
      readAt: now.toISOString(),
      source,
    });
  });

  it('feed yang salah, jawaban tidak positif, basi, atau tidak terbaca → null', async () => {
    expect(await readEthUsd(feed({ description: 'BTC / USD' }), source, now)).toBeNull();
    expect(await readEthUsd(feed({ decimals: 18 }), source, now)).toBeNull();
    expect(await readEthUsd(feed({ answer: 0n }), source, now)).toBeNull();
    expect(await readEthUsd(feed({ answer: -5n }), source, now)).toBeNull();
    expect(await readEthUsd(feed({ updatedAt: nowSec - ETH_USD_MAX_AGE_SEC - 1 }), source, now)).toBeNull();
    expect(await readEthUsd(feed({ updatedAt: 0 }), source, now)).toBeNull();
    expect(await readEthUsd(feed({ fail: true }), source, now)).toBeNull();
    expect(await readEthUsd(feed({ updatedAt: nowSec - ETH_USD_MAX_AGE_SEC }), source, now)).not.toBeNull();
  });
});

describe('satuan sumbu chart', () => {
  const rate = { answer: 163_788_000_000n, decimals: 8 };
  const price = 1_500_000_000n; // 0,0000000015 ETH per token

  it('harga sangat kecil ditulis ringkas dengan hitungan nol, tanpa kehilangan angka penting', () => {
    expect(formatCompactUnits(price, 18, 5)).toBe('0.0₈15');
    expect(formatCompactUnits(1_501_234_567n, 18, 5)).toBe('0.0₈15012');
    expect(formatCompactUnits(1_501_234_567n, 18, 6)).toBe('0.0₈150123');
    // Kurang dari empat nol di depan: ditulis biasa.
    expect(formatCompactUnits(ETH / 2_000n, 18, 5)).toBe('0.0005');
    expect(formatCompactUnits(123n * 10n ** 4n, 18, 5)).toBe('0.0₁₁123');
    expect(formatCompactUnits((ETH * 14_985n) / 10_000n, 18, 5)).toBe('1.4985');
    expect(formatCompactUnits(1_234n * ETH, 18, 5)).toBe('1,234');
    expect(formatCompactUnits(0n)).toBe('0');
    expect(formatCompactUnits(-price, 18, 5)).toBe('-0.0₈15');
  });

  it('USD ringkas: K / M / B dipotong dua desimal; di bawah $1 memakai hitungan nol', () => {
    expect(formatCompactUsd(11_600n * ETH)).toBe('$11.6K');
    expect(formatCompactUsd(5_665n * ETH + (ETH * 82n) / 100n)).toBe('$5.66K');
    expect(formatCompactUsd(1_250_000n * ETH)).toBe('$1.25M');
    expect(formatCompactUsd(3_000_000_000n * ETH)).toBe('$3B');
    expect(formatCompactUsd(968n * ETH + (ETH * 89n) / 100n)).toBe('$968.89');
    expect(formatCompactUsd(toUsd18(price, rate))).toBe('$0.0₅2456');
    expect(formatCompactUsd(0n)).toBe('$0');
  });

  it('harga atau market cap, ETH atau USD, semuanya dari harga curve yang sama', () => {
    const eth = { scale: 'price', usd: null } as const;
    const cap = { scale: 'mcap', usd: null } as const;
    const capUsd = { scale: 'mcap', usd: rate } as const;
    expect(toDisplay(price, eth)).toBe(price);
    expect(toDisplay(price, cap)).toBe(marketCapWei(price));
    expect(toDisplay(price, capUsd)).toBe(toUsd18(marketCapWei(price), rate));
    expect(formatDisplay(toDisplay(price, cap), cap)).toBe('1.4985');
    expect(formatDisplay(toDisplay(price, capUsd), capUsd)).toBe('$2.45K');
    expect(formatDisplayFull(toDisplay(price, eth), eth)).toBe('0.0000000015 ETH');
    expect(formatDisplayFull(toDisplay(price, capUsd), capUsd)).toBe('$2,454.36');
    expect(unitCaption(eth)).toBe('PRICES IN ETH');
    expect(unitCaption(capUsd)).toBe('MARKET CAP IN USD');
  });

  it('pembagi plot menjaga nilai di bawah batas library chart, dengan ruang seribu kali', () => {
    const limit = 90_000_000_000_000n;
    // Harga dalam wei per token muat apa adanya.
    expect(plotDivisor(price)).toBe(1n);
    // Market cap dalam wei (1,5×10^18) tidak: dibagi pangkat sepuluh.
    const cap = marketCapWei(price);
    const divisor = plotDivisor(cap);
    expect(divisor).toBe(10n ** 8n);
    expect((cap * 1_000n) / divisor).toBeLessThan(limit);
    expect(Number.isSafeInteger(Number(cap / divisor))).toBe(true);
    expect(plotDivisor(0n)).toBe(1n);
    for (const value of [10n ** 12n, 10n ** 21n, 10n ** 30n]) {
      const scaled = plotDivisor(value);
      expect((value * 1_000n) / scaled).toBeLessThan(limit);
      // Pembagi terkecil: satu tingkat di bawahnya sudah melewati batas.
      if (scaled > 1n) expect((value * 1_000n) / (scaled / 10n)).toBeGreaterThanOrEqual(limit);
    }
  });
});

describe('warna chart', () => {
  it('hex + alpha → rgba; nilai lain dibiarkan', () => {
    expect(withAlpha('#b5ffe5', 0.5)).toBe('rgba(181, 255, 229, 0.5)');
    expect(withAlpha(' #fff ', 0.1)).toBe('rgba(255, 255, 255, 0.1)');
    expect(withAlpha('#000000', 2)).toBe('rgba(0, 0, 0, 1)');
    expect(withAlpha('oklch(0.9 0.1 160)', 0.5)).toBe('oklch(0.9 0.1 160)');
    expect(withAlpha('', 0.5)).toBe('');
  });
});
