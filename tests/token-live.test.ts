import { encodeAbiParameters, encodeEventTopics, type Log } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  areaPoints,
  curveSamples,
  linePoints,
  nearestIndex,
  priceScale,
  raisedPosition,
  tradeSamples,
} from '@/lib/tokens/chart';
import { mergeLocalTrades, pendingLocalTrades, tradesFromReceipt, withLiveCurve } from '@/lib/tokens/live';
import { curveAbi } from '@/lib/web3/abi/xofn';
import { priceAtRaised } from '@/lib/web3/curve-trade';
import type { Address, TokenDetail, Trade } from '@/types/domain';

const CURVE: Address = '0x00000000000000000000000000000000000000c1';
const OTHER: Address = '0x00000000000000000000000000000000000000c2';
const TRADER: Address = '0x00000000000000000000000000000000000000d1';
const ETH = 10n ** 18n;

const SHAPE = {
  virtualEth: ETH,
  virtualTokens: 10n ** 27n,
  saleSupply: 8n * 10n ** 26n,
  graduationThreshold: 4n * ETH,
};

const trade = (blockNumber: number, txHash: `0x${string}`, ethRaised: bigint, patch: Partial<Trade> = {}): Trade => ({
  side: 'buy',
  trader: TRADER,
  ethAmount: '1',
  tokenAmount: '1',
  ethRaised: ethRaised.toString(),
  blockNumber: String(blockNumber),
  txHash,
  logIndex: 0,
  timestamp: null,
  ...patch,
});

function detail(trades: Trade[], ethRaised = 0n): TokenDetail {
  const start = priceAtRaised({ ...SHAPE, ethRaised: 0n });
  return {
    address: '0x00000000000000000000000000000000000000a1',
    name: 'Fake',
    symbol: 'FAKE',
    tier: 'standard',
    creator: TRADER,
    curve: CURVE,
    eids: [],
    status: 'bonding',
    graduatorStatus: 'bonding',
    progressBps: 0,
    spark: [start.toString(), ...trades.map((item) => priceAtRaised({ ...SHAPE, ethRaised: BigInt(item.ethRaised) }).toString())],
    curveState: {
      address: CURVE,
      ethRaised: ethRaised.toString(),
      tokensSold: '0',
      saleSupply: SHAPE.saleSupply.toString(),
      graduationThreshold: SHAPE.graduationThreshold.toString(),
      currentPrice: start.toString(),
      thresholdReached: false,
      progressBps: 0,
    },
    pool: null,
    poolState: null,
    tokensPerChain: '0',
    curveParams: { virtualEth: SHAPE.virtualEth.toString(), virtualTokens: SHAPE.virtualTokens.toString() },
    trades,
    tradeCount: trades.length,
    expansion: [],
    pathways: [],
    verify: [],
    economics: { callerReward: '0', expansionPairEth: '0', startPrice: start.toString() },
    checkedAt: '2026-11-21T00:00:00.000Z',
    relayPending: null,
  };
}

function eventLog(
  address: Address,
  eventName: 'Bought' | 'Sold',
  values: [bigint, bigint, bigint],
  logIndex: number,
): Log {
  const topics = encodeEventTopics({
    abi: curveAbi,
    eventName,
    args: eventName === 'Bought' ? { buyer: TRADER } : { seller: TRADER },
  });
  return {
    address,
    topics: topics as Log['topics'],
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], values),
    blockNumber: 77n,
    blockHash: `0x${'1'.repeat(64)}`,
    transactionHash: `0x${'a'.repeat(64)}`,
    transactionIndex: 0,
    logIndex,
    removed: false,
  };
}

describe('trade dari receipt', () => {
  it('membaca Bought dan Sold milik curve ini saja, urut indeks log', () => {
    const logs = [
      eventLog(CURVE, 'Sold', [30n, 2n, 5n * ETH], 3),
      eventLog(OTHER, 'Bought', [9n, 9n, 9n], 2),
      eventLog(CURVE, 'Bought', [ETH, 500n, 6n * ETH], 1),
    ];
    const trades = tradesFromReceipt(logs, CURVE);
    expect(trades.map((item) => [item.side, item.logIndex])).toEqual([
      ['buy', 1],
      ['sell', 3],
    ]);
    expect(trades[0]).toMatchObject({ trader: TRADER, ethAmount: ETH.toString(), tokenAmount: '500', ethRaised: (6n * ETH).toString(), blockNumber: '77', timestamp: null });
    // Sold: tokensIn lalu ethOut.
    expect(trades[1]).toMatchObject({ tokenAmount: '30', ethAmount: '2', ethRaised: (5n * ETH).toString() });
  });

  it('log lain di receipt (mis. Transfer token) diabaikan', () => {
    const transfer: Log = { ...eventLog(CURVE, 'Bought', [1n, 1n, 1n], 0), topics: [`0x${'d'.repeat(64)}`] };
    expect(tradesFromReceipt([transfer], CURVE)).toEqual([]);
  });
});

describe('trade lokal di atas detail dari API', () => {
  const first = trade(10, '0xaa', ETH);

  it('trade baru ditambahkan, jumlah dan spark ikut bertambah', () => {
    const base = detail([first], ETH);
    const local = trade(12, '0xbb', 2n * ETH);
    const merged = mergeLocalTrades(base, [local]);
    expect(merged.trades.map((item) => item.txHash)).toEqual(['0xaa', '0xbb']);
    expect(merged.tradeCount).toBe(2);
    expect(merged.spark).toHaveLength(base.spark.length + 1);
    expect(merged.spark.at(-1)).toBe(priceAtRaised({ ...SHAPE, ethRaised: 2n * ETH }).toString());
    // Detail asli tidak diubah.
    expect(base.trades).toHaveLength(1);
  });

  it('trade yang sudah dimuat index, atau lebih tua dari trade terakhir, tidak ditambahkan lagi', () => {
    const base = detail([first], ETH);
    expect(mergeLocalTrades(base, [first])).toBe(base);
    expect(mergeLocalTrades(base, [trade(4, '0xcc', 1n)])).toBe(base);
    expect(mergeLocalTrades(base, [])).toBe(base);
    expect(pendingLocalTrades(base, [first, trade(12, '0xbb', 2n * ETH)]).map((item) => item.txHash)).toEqual(['0xbb']);
  });

  it('spark tidak tumbuh melewati 60 titik', () => {
    const many = Array.from({ length: 70 }, (_, index) => trade(20 + index, `0x${(index + 16).toString(16)}`, BigInt(index + 2) * 10n ** 15n));
    expect(mergeLocalTrades(detail([first], ETH), many).spark).toHaveLength(60);
  });
});

describe('state curve langsung', () => {
  it('menimpa state dan progres; pembacaan yang sama mengembalikan objek yang sama', () => {
    const base = detail([], 0n);
    const live = { ethRaised: ETH, tokensSold: 5n, currentPrice: 7n, thresholdReached: false };
    const next = withLiveCurve(base, live);
    expect(next.curveState).toMatchObject({ ethRaised: ETH.toString(), tokensSold: '5', currentPrice: '7', progressBps: 2500 });
    expect(next.progressBps).toBe(2500);
    expect(withLiveCurve(next, live)).toBe(next);
    expect(withLiveCurve(base, null)).toBe(base);
  });
});

describe('geometri chart', () => {
  it('sampel curve: dari 0 sampai ambang, harga tidak pernah turun, sama dengan rumus kontrak', () => {
    const points = curveSamples(SHAPE, 16);
    expect(points).toHaveLength(16);
    expect(points[0]).toMatchObject({ x: 0, raised: 0n });
    expect(points.at(-1)).toMatchObject({ x: 1, raised: SHAPE.graduationThreshold });
    for (let index = 1; index < points.length; index += 1) {
      expect(points[index]!.price >= points[index - 1]!.price).toBe(true);
    }
    expect(points[5]?.price).toBe(priceAtRaised({ ...SHAPE, ethRaised: points[5]!.raised! }));
    expect(curveSamples({ ...SHAPE, graduationThreshold: 0n })).toEqual([]);
  });

  it('skala: harga tertinggi di atas, terendah di bawah, rentang nol di tengah', () => {
    const points = tradeSamples(['10', '30', '20']);
    const scale = priceScale(points, 0.1);
    expect(scale.min).toBe(10n);
    expect(scale.max).toBe(30n);
    expect(scale.y(30n)).toBeCloseTo(0.1);
    expect(scale.y(10n)).toBeCloseTo(0.9);
    expect(scale.y(20n)).toBeCloseTo(0.5);
    expect(priceScale(tradeSamples(['7'])).y(7n)).toBe(0.5);
  });

  it('satu titik digambar sebagai garis datar; garis dan area memakai titik yang sama', () => {
    const flat = tradeSamples(['7']);
    expect(flat.map((point) => point.x)).toEqual([0, 1]);
    const points = tradeSamples(['10', '30']);
    const scale = priceScale(points, 0);
    expect(linePoints(points, scale, 100, 50)).toBe('0.0,50.0 100.0,0.0');
    expect(areaPoints(points, scale, 100, 50)).toBe('0.0,50 0.0,50.0 100.0,0.0 100.0,50');
    expect(areaPoints([], scale, 100, 50)).toBe('');
    expect(tradeSamples([])).toEqual([]);
  });

  it('titik terdekat dan posisi ETH terkumpul', () => {
    const points = tradeSamples(['1', '2', '3', '4', '5']);
    expect(nearestIndex(points, 0)).toBe(0);
    expect(nearestIndex(points, 0.55)).toBe(2);
    expect(nearestIndex(points, 1)).toBe(4);
    expect(raisedPosition(ETH, 4n * ETH)).toBe(0.25);
    expect(raisedPosition(9n * ETH, 4n * ETH)).toBe(1);
    expect(raisedPosition(0n, 4n * ETH)).toBe(0);
    expect(raisedPosition(ETH, 0n)).toBe(0);
  });
});
