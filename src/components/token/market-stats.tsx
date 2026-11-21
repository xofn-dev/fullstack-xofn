'use client';

import { memo } from 'react';
import { getChain } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { formatCompactUnits, formatEth, formatInt, formatUnitsFixed, formatUsd } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';
import { FIXED_SUPPLY, changeTenths, marketCapWei, toUsd18 } from '@/lib/tokens/market';
import { priceFromSqrtX96, virtualReserves } from '@/lib/web3/pool-trade';
import { Ago } from '@/components/ui/ago';
import { LiveValue } from '@/components/ui/live-value';
import type { CurveState, EthUsdRate, MarketWindow, PoolState } from '@/types/domain';

export type MoneyUnit = 'eth' | 'usd';

interface MarketStatsProps {
  curve: CurveState;
  /** Curve sudah ditutup (token lulus): harga curve final, bukan harga pasar berjalan. */
  closed: boolean;
  market: MarketWindow;
  poolState: PoolState | null;
  /** Kurs ETH/USD; null = tidak terbaca, tampilan USD dinonaktifkan. */
  rate: EthUsdRate | null;
  rateReading: boolean;
  unit: MoneyUnit;
  onUnit: (unit: MoneyUnit) => void;
}

const PRICE_DIGITS = 12;

/** "▲ +12.3%" dari persepuluh persen; arah selalu ditulis dengan panah, bukan warna saja. */
function changeText(tenths: bigint): { text: string; direction: 'up' | 'down' | null } {
  if (tenths === 0n) return { text: '0.0%', direction: null };
  const abs = tenths < 0n ? -tenths : tenths;
  return { text: `${tenths > 0n ? '▲ +' : '▼ −'}${abs / 10n}.${abs % 10n}%`, direction: tenths > 0n ? 'up' : 'down' };
}

/**
 * Statistik pasar di kepala panel harga. Market cap paling menonjol; semua angka berasal dari
 * pembacaan chain dan trade curve terindeks. Nilai yang tidak terbaca ditulis "NOT READ".
 */
export const MarketStats = memo(function MarketStats({
  curve,
  closed,
  market,
  poolState,
  rate,
  rateReading,
  unit,
  onUnit,
}: MarketStatsProps) {
  const usd = unit === 'usd' && rate !== null ? { answer: BigInt(rate.answer), decimals: rate.decimals } : null;
  const money = (wei: bigint, fraction: number) => (usd ? formatUsd(toUsd18(wei, usd)) : formatEth(wei, fraction));

  // Setelah graduation harga pasar ada di pool home. Bila pool terbaca, itu yang ditampilkan;
  // bila tidak, harga curve terakhir ditulis sebagai harga saat curve ditutup.
  const poolPrice = closed && poolState ? priceFromSqrtX96(BigInt(poolState.sqrtPriceX96)) : null;
  const price = poolPrice ?? BigInt(curve.currentPrice);
  const priceSource = !closed ? 'CURVE PRICE' : poolPrice !== null ? 'HOME POOL PRICE' : 'AT CURVE CLOSE';
  const cap = marketCapWei(price);

  const reference = !closed && market.status === 'read' && market.price24hAgo !== null ? BigInt(market.price24hAgo) : null;
  const tenths = reference !== null ? changeTenths(price, reference) : null;
  const change = tenths !== null ? changeText(tenths) : null;
  const changeNote = closed
    ? priceSource
    : change
      ? `${change.text} · ${market.reference === 'start' ? 'SINCE START PRICE' : '24H'}`
      : '24H CHANGE NOT READ';

  const volume = !closed && market.status === 'read' && market.volume24h !== null ? BigInt(market.volume24h) : null;

  const reserves = closed && poolState ? virtualReserves(BigInt(poolState.liquidity), BigInt(poolState.sqrtPriceX96)) : null;
  const liquidity = closed ? (reserves ? reserves.eth : null) : BigInt(curve.ethRaised);

  const testReference = publicEnv.network !== 'mainnet';
  const source = rate ? getChain(rate.source.network, rate.source.chain) : null;

  return (
    <div className="market">
      <div className="market-head">
        <div className="market-cap">
          <small>MARKET CAP · FULLY DILUTED</small>
          <strong>
            <LiveValue amount={cap}>{money(cap, 4)}</LiveValue>
          </strong>
          <em>
            PRICE × {formatInt(FIXED_SUPPLY)} FIXED SUPPLY · {priceSource}
          </em>
        </div>
        <div className="unit-switch">
          <div className="chart-tabs" role="group" aria-label="Display unit">
            {/* Tanpa kurs, tampilan kembali ke ETH walau USD pernah dipilih. */}
            <button type="button" aria-pressed={usd === null} onClick={() => onUnit('eth')}>
              ETH
            </button>
            <button
              type="button"
              aria-pressed={unit === 'usd' && rate !== null}
              disabled={rate === null}
              aria-describedby={rate === null ? 'usd-rate-note' : undefined}
              onClick={() => onUnit('usd')}
            >
              USD
            </button>
          </div>
          {rate === null && (
            <span id="usd-rate-note" className="unit-note">
              {rateReading ? 'READING USD RATE…' : 'USD RATE NOT READ'}
            </span>
          )}
        </div>
      </div>
      <div className="stat-row">
        <div className="stat-tile">
          <small>PRICE</small>
          {/* Bentuk ringkas (nol berhitung) seperti di sumbu chart; nilai lengkapnya ada di `title`. */}
          <strong title={`${formatUnitsFixed(price, 18, PRICE_DIGITS)} ETH per token`}>
            <LiveValue amount={price}>{usd ? money(price, PRICE_DIGITS) : `${formatCompactUnits(price, 18, 6)} ETH`}</LiveValue>
          </strong>
          <em className={cn(change?.direction)}>{changeNote}</em>
        </div>
        <div className="stat-tile">
          <small>24H VOLUME</small>
          <strong>{volume !== null ? <LiveValue amount={volume}>{money(volume, 4)}</LiveValue> : 'NOT READ'}</strong>
          <em>
            {closed
              ? 'POOL TRADES NOT INDEXED'
              : volume !== null
                ? `${formatInt(market.trades24h ?? 0)} CURVE ${market.trades24h === 1 ? 'TRADE' : 'TRADES'}`
                : 'BLOCK TIMES STILL BEING READ'}
          </em>
        </div>
        <div className="stat-tile">
          <small>{closed ? 'POOL LIQUIDITY' : 'CURVE RESERVE'}</small>
          <strong>{liquidity !== null ? <LiveValue amount={liquidity}>{money(liquidity, 4)}</LiveValue> : 'NOT READ'}</strong>
          <em>
            {closed
              ? liquidity !== null
                ? 'ETH SIDE · FULL RANGE'
                : 'POOL NOT READ ON THIS NETWORK'
              : 'ETH HELD BY THE CURVE'}
          </em>
        </div>
        <div className="stat-tile">
          <small>TOTAL SUPPLY</small>
          <strong>{formatInt(FIXED_SUPPLY)}</strong>
          <em>FIXED · NO MINT</em>
        </div>
      </div>
      {usd && rate && source && (
        <p className="rate-note">
          USD AT {formatUsd(toUsd18(10n ** 18n, usd))} PER ETH · CHAINLINK ETH / USD ON {source.shortName} ·{' '}
          <Ago iso={new Date(rate.updatedAt * 1_000).toISOString()} prefix="FEED UPDATED" /> ·{' '}
          <Ago iso={rate.readAt} prefix="READ" />
          {testReference && (
            <>
              <br />
              REFERENCE RATE FROM MAINNET · TEST ETH HAS NO MARKET VALUE
            </>
          )}
        </p>
      )}
    </div>
  );
});
