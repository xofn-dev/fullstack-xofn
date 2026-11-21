import { parseEventLogs, type Log } from 'viem';
import type { Address } from '@/lib/chains';
import { curveAbi } from '@/lib/web3/abi/xofn';
import { priceAtRaised, progressBps } from '@/lib/web3/curve-trade';
import type { TokenDetail, Trade } from '@/types/domain';

// Pembaruan sisi klien untuk halaman token. Semuanya murni (tanpa jaringan) dan hanya memakai
// nilai yang BENAR-BENAR dibaca dari chain: event di receipt transaksi pengguna dan state curve
// yang dipoll langsung. Tidak ada angka yang ditebak selagi menunggu index server.

const SPARK_POINTS = 60;

const tradeKey = (trade: Pick<Trade, 'txHash' | 'logIndex'>) => `${trade.txHash}:${trade.logIndex}`;

function byBlockThenLog(a: Trade, b: Trade): number {
  const blockDiff = BigInt(a.blockNumber) - BigInt(b.blockNumber);
  if (blockDiff !== 0n) return blockDiff < 0n ? -1 : 1;
  return a.logIndex - b.logIndex;
}

/** Trade curve dari log receipt (event `Bought` / `Sold` milik curve ini saja). */
export function tradesFromReceipt(logs: readonly Log[], curve: Address): Trade[] {
  const parsed = parseEventLogs({ abi: curveAbi, logs: [...logs], eventName: ['Bought', 'Sold'] });
  const trades: Trade[] = [];
  for (const log of parsed) {
    if (log.address.toLowerCase() !== curve.toLowerCase()) continue;
    if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) continue;
    const base = {
      ethRaised: log.args.ethRaised.toString(),
      blockNumber: log.blockNumber.toString(),
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      // Receipt tidak membawa waktu blok; index server mengisinya saat memuat trade ini.
      timestamp: null,
    };
    if (log.eventName === 'Bought') {
      trades.push({
        ...base,
        side: 'buy',
        trader: log.args.buyer.toLowerCase() as Address,
        ethAmount: log.args.ethIn.toString(),
        tokenAmount: log.args.tokensOut.toString(),
      });
    } else {
      trades.push({
        ...base,
        side: 'sell',
        trader: log.args.seller.toLowerCase() as Address,
        ethAmount: log.args.ethOut.toString(),
        tokenAmount: log.args.tokensIn.toString(),
      });
    }
  }
  return trades.sort(byBlockThenLog);
}

/**
 * Menambahkan trade dari receipt pengguna ke detail selama index server belum memuatnya.
 * Trade yang sudah ada di detail, atau yang lebih tua daripada trade terakhir di detail (detail
 * hanya membawa trade terbaru), tidak ditambahkan.
 */
export function mergeLocalTrades(detail: TokenDetail, local: readonly Trade[]): TokenDetail {
  if (local.length === 0) return detail;
  const known = new Set(detail.trades.map(tradeKey));
  const last = detail.trades.at(-1);
  const extra = local.filter((trade) => !known.has(tradeKey(trade)) && (!last || byBlockThenLog(trade, last) > 0));
  if (extra.length === 0) return detail;
  const params = {
    virtualEth: BigInt(detail.curveParams.virtualEth),
    virtualTokens: BigInt(detail.curveParams.virtualTokens),
    saleSupply: BigInt(detail.curveState.saleSupply),
  };
  const sorted = [...extra].sort(byBlockThenLog);
  const points = sorted.map((trade) => priceAtRaised({ ...params, ethRaised: BigInt(trade.ethRaised) }).toString());
  // Tanpa trade, spark dari server berisi satu titik (harga awal) dan tetap dipakai sebagai awalan.
  const spark = [...detail.spark, ...points];
  return {
    ...detail,
    trades: [...detail.trades, ...sorted],
    tradeCount: detail.tradeCount + sorted.length,
    spark: spark.length > SPARK_POINTS ? spark.slice(spark.length - SPARK_POINTS) : spark,
  };
}

/** Trade lokal yang belum dimuat index server; sisanya sudah boleh dilupakan. */
export function pendingLocalTrades(detail: TokenDetail, local: readonly Trade[]): Trade[] {
  const known = new Set(detail.trades.map(tradeKey));
  const last = detail.trades.at(-1);
  return local.filter((trade) => !known.has(tradeKey(trade)) && (!last || byBlockThenLog(trade, last) > 0));
}

export interface LiveCurve {
  ethRaised: bigint;
  tokensSold: bigint;
  currentPrice: bigint;
  thresholdReached: boolean;
}

/** Menimpa state curve di detail dengan pembacaan langsung yang lebih baru. */
export function withLiveCurve(detail: TokenDetail, live: LiveCurve | null): TokenDetail {
  if (!live) return detail;
  const state = detail.curveState;
  if (
    state.ethRaised === live.ethRaised.toString() &&
    state.tokensSold === live.tokensSold.toString() &&
    state.currentPrice === live.currentPrice.toString() &&
    state.thresholdReached === live.thresholdReached
  ) {
    return detail;
  }
  const bps = progressBps(live.ethRaised, BigInt(state.graduationThreshold));
  return {
    ...detail,
    progressBps: bps,
    curveState: {
      ...state,
      ethRaised: live.ethRaised.toString(),
      tokensSold: live.tokensSold.toString(),
      currentPrice: live.currentPrice.toString(),
      thresholdReached: live.thresholdReached,
      progressBps: bps,
    },
  };
}
