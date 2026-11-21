'use client';

import dynamic from 'next/dynamic';
import { Component, memo, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { explorerAddressUrl, explorerTxUrl, getChain, type ChainInfo } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { formatBps, formatEth, formatInt, formatTokens, formatUnitsFixed, shortAddress } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';
import {
  TIMEFRAMES,
  TIMEFRAME_LABEL,
  bucketLabel,
  candlesFor,
  curvePriceAt,
  priceTrades,
  timedRun,
  type TimeframeId,
} from '@/lib/tokens/candles';
import type { CurveShape } from '@/lib/tokens/chart';
import { CHART_SCALE_LABEL, unitCaption, type ChartScale } from '@/lib/tokens/chart-scale';
import type { HistoryState } from '@/lib/tokens/history';
import { EMA_PERIOD, INDICATOR_WARMUP, MA_PERIOD, RSI_PERIOD } from '@/lib/tokens/indicators';
import { FIXED_SUPPLY } from '@/lib/tokens/market';
import type { ChartIndicators, MarketChartKind } from '@/components/token/market-chart';
import { MarketStats, type MoneyUnit } from '@/components/token/market-stats';
import { PriceChart } from '@/components/token/price-chart';
import { Ago, useAgeSeconds } from '@/components/ui/ago';
import { LiveValue } from '@/components/ui/live-value';
import { ProgressBar } from '@/components/ui/progress-bar';
import type { CurveParams, CurveState, EthUsdRate, MarketWindow, PoolState, Trade, VerifyReading } from '@/types/domain';

const TOTAL_SUPPLY_UNITS = BigInt(FIXED_SUPPLY) * 10n ** 18n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const PRICE_DIGITS = 12;

/** Bentuk curve dari nilai teks; hanya dihitung ulang bila salah satu nilainya berubah. */
function useCurveShape(curve: CurveState, params: CurveParams): CurveShape {
  const { saleSupply, graduationThreshold } = curve;
  const { virtualEth, virtualTokens } = params;
  return useMemo(
    () => ({
      virtualEth: BigInt(virtualEth),
      virtualTokens: BigInt(virtualTokens),
      saleSupply: BigInt(saleSupply),
      graduationThreshold: BigInt(graduationThreshold),
    }),
    [virtualEth, virtualTokens, saleSupply, graduationThreshold],
  );
}

// Library chart hanya diunduh saat mode Line/Candles dibuka, dan hanya di browser.
const MarketChartLazy = dynamic(
  () => import('@/components/token/market-chart').then((module) => module.MarketChart),
  { ssr: false, loading: () => <ChartPlaceholder busy>Loading the chart.</ChartPlaceholder> },
);

/** Bingkai setinggi chart untuk keadaan memuat, kosong, dan gagal: data datang tanpa menggeser layout. */
function ChartPlaceholder({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <div className="market-chart">
      <div className="chart-legend" aria-hidden="true" />
      {/* Setinggi chart bawaan (dengan pane volume), supaya chart yang datang tidak menggeser layout. */}
      <div
        className={cn('chart-frame market-frame has-volume chart-state', busy && 'skeleton')}
        role="status"
        aria-busy={busy || undefined}
      >
        <div className={cn(busy && 'sr-only')}>{children}</div>
      </div>
    </div>
  );
}

/** Bila bundel chart gagal dimuat, chart tulis tangan (tanpa sumbu waktu) tetap dipakai. */
class ChartBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type ViewMode = 'curve' | MarketChartKind;

const VIEW_LABEL: Record<ViewMode, string> = { curve: 'Curve', line: 'Line', candles: 'Candles' };

const INDICATOR_ITEMS: Array<{ key: keyof ChartIndicators; label: string; hint: string; warmup: number }> = [
  { key: 'volume', label: 'Volume', hint: 'ETH traded per candle', warmup: 1 },
  { key: 'ma', label: `MA ${MA_PERIOD}`, hint: 'Simple moving average of the close', warmup: INDICATOR_WARMUP.ma },
  { key: 'ema', label: `EMA ${EMA_PERIOD}`, hint: 'Exponential moving average of the close', warmup: INDICATOR_WARMUP.ema },
  { key: 'rsi', label: `RSI ${RSI_PERIOD}`, hint: 'Relative strength, 0 to 100', warmup: INDICATOR_WARMUP.rsi },
];

/** Menu indikator ringkas. Indikator yang datanya belum cukup tetap bisa dipilih, dengan catatannya. */
function IndicatorMenu({
  value,
  onChange,
  candleCount,
}: {
  value: ChartIndicators;
  onChange: (next: ChartIndicators) => void;
  candleCount: number;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const active = INDICATOR_ITEMS.filter((item) => value[item.key]).length;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="indicator-menu" ref={root}>
      <button
        type="button"
        className="indicator-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        Indicators <b>{active}</b>
      </button>
      {open && (
        <div id={panelId} className="indicator-panel" role="group" aria-label="Chart indicators">
          {INDICATOR_ITEMS.map((item) => (
            <label key={item.key}>
              <input
                type="checkbox"
                checked={value[item.key]}
                onChange={(event) => onChange({ ...value, [item.key]: event.target.checked })}
              />
              <span>
                <b>{item.label}</b>
                <small>
                  {candleCount < item.warmup
                    ? `Needs ${item.warmup} candles · this range has ${candleCount}`
                    : item.hint}
                </small>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface PricePanelProps {
  curve: CurveState;
  params: CurveParams;
  spark: string[];
  tradeCount: number;
  market: MarketWindow;
  poolState: PoolState | null;
  /** Riwayat trade ber-waktu untuk chart; null selagi belum terbaca. */
  history: HistoryState | null;
  historyFailed: boolean;
  onRetryHistory: () => void;
  rate: EthUsdRate | null;
  rateReading: boolean;
  /**
   * Asal angka di panel ini: `live` = state curve dibaca langsung tiap 2 detik; `polling` =
   * pembacaan langsung belum/tidak tersedia, angka dari polling API; `closed` = curve sudah
   * ditutup (token lulus), nilainya final.
   */
  feed: 'live' | 'polling' | 'closed';
}

const FEED_LABEL: Record<PricePanelProps['feed'], string> = {
  live: 'LIVE · READ FROM THE CURVE EVERY 2S',
  polling: 'READ FROM THE CHAIN EVERY 4S',
  closed: 'CURVE CLOSED · FINAL VALUES',
};

export const PricePanel = memo(function PricePanel({
  curve,
  params,
  spark,
  tradeCount,
  market,
  poolState,
  history,
  historyFailed,
  onRetryHistory,
  rate,
  rateReading,
  feed,
}: PricePanelProps) {
  // Token yang sudah diperdagangkan dibuka di chart harga; yang belum, di bentuk curve-nya.
  const [mode, setMode] = useState<ViewMode>(tradeCount > 0 ? 'candles' : 'curve');
  const [timeframe, setTimeframe] = useState<TimeframeId>('all');
  const [indicators, setIndicators] = useState<ChartIndicators>({ volume: true, ma: false, ema: false, rsi: false });
  const [unit, setUnit] = useState<MoneyUnit>('eth');
  const [scale, setScale] = useState<ChartScale>('price');
  // Chart mengikuti sakelar ETH/USD di atas. Kurs yang dipakai adalah kurs saat dibaca, untuk
  // semua candle; keterangannya ditulis di kaki chart.
  const chartUsd = unit === 'usd' && rate !== null ? rate : null;
  const shape = useCurveShape(curve, params);
  const closed = feed === 'closed';
  const raised = BigInt(curve.ethRaised);
  const threshold = BigInt(curve.graduationThreshold);
  const remaining = threshold > raised ? threshold - raised : 0n;

  // Candle dibentuk dari trade ber-waktu yang bersambung; dihitung ulang hanya bila riwayat atau
  // timeframe berubah, bukan pada setiap polling harga.
  const priced = useMemo(() => (history ? priceTrades(timedRun(history.points), shape) : []), [history, shape]);
  const { candles, view } = useMemo(() => candlesFor(priced, timeframe), [priced, timeframe]);
  const label = bucketLabel(view.bucketSec);

  const fallback = (
    <>
      <PriceChart mode="trades" curve={curve} params={params} spark={spark} tradeCount={tradeCount} />
      <p className="step-note">
        Showing the curve price after each trade, without a time axis.
      </p>
    </>
  );

  let chart: ReactNode;
  if (mode === 'curve') {
    chart = <PriceChart mode="curve" curve={curve} params={params} spark={spark} tradeCount={tradeCount} />;
  } else if (!history) {
    chart = historyFailed ? (
      <ChartPlaceholder>
        <strong>TRADE HISTORY NOT READ</strong>
        <p>The trade history could not be read. No candles are assumed.</p>
        <button type="button" className="btn small" onClick={onRetryHistory}>
          Retry
        </button>
      </ChartPlaceholder>
    ) : (
      <ChartPlaceholder busy>Reading the trade history.</ChartPlaceholder>
    );
  } else if (history.total === 0) {
    chart = (
      <ChartPlaceholder>
        <strong>NO TRADES YET</strong>
        <p>Candles appear after the first trade on the curve. The Curve view shows the price path to graduation.</p>
      </ChartPlaceholder>
    );
  } else if (priced.length === 0) {
    // Trade sudah ada, tetapi waktu bloknya belum terbaca: tanpa waktu tidak ada candle.
    chart = (
      <>
        <PriceChart mode="trades" curve={curve} params={params} spark={spark} tradeCount={tradeCount} />
        <p className="step-note" role="status">
          Block times for these trades are still being read, so there is no time axis yet. This view shows
          the curve price after each trade.
        </p>
      </>
    );
  } else {
    chart = (
      <ChartBoundary fallback={fallback}>
        <MarketChartLazy
          kind={mode}
          candles={candles}
          indicators={indicators}
          livePrice={closed ? null : curve.currentPrice}
          bucketLabel={label}
          summary={`${CHART_SCALE_LABEL[scale]} chart of curve trades, ${candles.length} ${label} candles.`}
          scale={scale}
          usdAnswer={chartUsd?.answer ?? null}
          usdDecimals={chartUsd?.decimals ?? 0}
        />
      </ChartBoundary>
    );
  }

  const covered = priced.length;
  const total = history?.total ?? 0;

  return (
    <div className="app-panel area-chart rise" style={{ '--i': 2 } as React.CSSProperties}>
      <MarketStats
        curve={curve}
        closed={closed}
        market={market}
        poolState={poolState}
        rate={rate}
        rateReading={rateReading}
        unit={unit}
        onUnit={setUnit}
      />
      <div className="panel-head chart-head">
        <h2>{mode === 'curve' ? 'Bonding curve' : scale === 'mcap' ? 'Market cap chart' : 'Price chart'}</h2>
        <div className="chart-tabs" role="group" aria-label="Chart view">
          {(['curve', 'line', 'candles'] as const).map((item) => (
            <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)}>
              {VIEW_LABEL[item]}
            </button>
          ))}
        </div>
      </div>
      {mode !== 'curve' && (
        <div className="chart-toolbar">
          <div className="chart-tabs is-wrap" role="group" aria-label="Chart timeframe">
            {TIMEFRAMES.map((item) => (
              <button key={item} type="button" aria-pressed={timeframe === item} onClick={() => setTimeframe(item)}>
                {TIMEFRAME_LABEL[item]}
              </button>
            ))}
          </div>
          <div className="chart-toolbar-end">
            <div className="chart-tabs" role="group" aria-label="Chart value">
              {(['price', 'mcap'] as const).map((item) => (
                <button key={item} type="button" aria-pressed={scale === item} onClick={() => setScale(item)}>
                  {CHART_SCALE_LABEL[item]}
                </button>
              ))}
            </div>
            <IndicatorMenu value={indicators} onChange={setIndicators} candleCount={candles.length} />
          </div>
        </div>
      )}
      {chart}
      {mode !== 'curve' && (
        <div className="chart-foot">
          <span>
            TIMES IN UTC · BLOCK TIME · {unitCaption({ scale, usd: chartUsd ? { answer: 0n, decimals: 0 } : null })}
            {chartUsd && ' AT THE CURRENT RATE, NOT THE RATE AT TRADE TIME'}
            {scale === 'mcap' && ' · PRICE × FIXED SUPPLY'}
          </span>
          <span>
            {closed
              ? 'CURVE TRADES ONLY · POOL TRADES ARE NOT INDEXED'
              : history && covered < total
                ? `CANDLES COVER ${formatInt(covered)} OF ${formatInt(total)} TRADES · OLDER BLOCK TIMES STILL BEING READ`
                : 'CURVE TRADES ONLY'}
          </span>
        </div>
      )}
      <div className="token-info">
        <span>GRADUATION</span>
        <strong>
          <LiveValue amount={curve.progressBps}>{formatBps(curve.progressBps)}</LiveValue>
        </strong>
      </div>
      <ProgressBar bps={curve.progressBps} label="Progress to graduation threshold" />
      <div className="stat-row">
        <div className="stat-tile">
          <small>RAISED</small>
          <strong>
            <LiveValue amount={raised}>{formatEth(raised)}</LiveValue>
          </strong>
          <em>OF {formatEth(threshold)}</em>
        </div>
        <div className="stat-tile">
          <small>TO GRADUATION</small>
          <strong>{remaining > 0n ? <LiveValue amount={remaining}>{formatEth(remaining)}</LiveValue> : 'REACHED'}</strong>
          <em>{remaining > 0n ? 'UNTIL THE THRESHOLD' : 'THRESHOLD REACHED'}</em>
        </div>
        <div className="stat-tile">
          <small>SOLD ON CURVE</small>
          <strong>
            <LiveValue amount={BigInt(curve.tokensSold)}>{formatTokens(curve.tokensSold, 0)}</LiveValue>
          </strong>
          <em>OF {formatTokens(curve.saleSupply, 0)}</em>
        </div>
        <div className="stat-tile">
          <small>TRADES</small>
          <strong>
            <LiveValue amount={tradeCount}>{formatInt(tradeCount)}</LiveValue>
          </strong>
          <em>ON THE CURVE</em>
        </div>
      </div>
      <div className="panel-meta panel-foot">
        <span className={cn('live-dot', feed !== 'live' && 'is-stale')} aria-hidden="true" />
        {FEED_LABEL[feed]}
      </div>
    </div>
  );
});

function verifyCell(reading: VerifyReading): { text: string; className: string } {
  if (reading.status === 'absent') return { text: '— NOT DEPLOYED', className: '' };
  if (reading.status === 'unread' || reading.locked === null) return { text: '◌ NOT READ', className: 'warn' };
  if (reading.registrarKnown === false) return { text: '✕ REGISTRY NOT RECOGNISED', className: 'bad' };
  return reading.locked ? { text: '● TRUE', className: 'ok' } : { text: '○ FALSE', className: '' };
}

const holder = (address: string | null) =>
  address === null ? 'not read' : address === ZERO_ADDRESS ? '0x0 · none' : shortAddress(address);

export const SecurityTable = memo(function SecurityTable({
  verify,
  checkedAt,
  stale,
}: {
  verify: VerifyReading[];
  checkedAt: string;
  /** Pembacaan terakhir gagal: nilai di tabel adalah yang terbaca sebelumnya. */
  stale: boolean;
}) {
  const sum = verify.reduce((total, reading) => total + BigInt(reading.totalSupply ?? '0'), 0n);
  const anyUnread = verify.some((reading) => reading.status === 'unread');
  return (
    <div className="app-panel area-security">
      <div className="panel-head">
        <h2>Security · read from each chain</h2>
        <span className="panel-meta">
          <span className={cn('live-dot', stale && 'is-stale')} aria-hidden="true" />
          <Ago iso={checkedAt} />
        </span>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">CHAIN</th>
              <th scope="col">TOKEN</th>
              <th scope="col">OWNER</th>
              <th scope="col">DELEGATE</th>
              <th scope="col" className="num">
                SUPPLY
              </th>
              <th scope="col">VERIFY()</th>
            </tr>
          </thead>
          <tbody>
            {verify.map((reading) => {
              const cell = verifyCell(reading);
              const chain = getChain(publicEnv.network, reading.chain);
              const url = reading.token ? explorerAddressUrl(chain, reading.token) : null;
              return (
                <tr key={reading.chain}>
                  <td>{chain.shortName}</td>
                  <td>
                    {reading.token ? (
                      url ? (
                        <a href={url} target="_blank" rel="noreferrer noopener">
                          {shortAddress(reading.token)}
                        </a>
                      ) : (
                        shortAddress(reading.token)
                      )
                    ) : (
                      'n/a'
                    )}
                  </td>
                  <td>{reading.token ? holder(reading.owner) : 'n/a'}</td>
                  <td>{reading.token ? holder(reading.delegate) : 'n/a'}</td>
                  <td className="num">{reading.totalSupply !== null ? formatTokens(reading.totalSupply, 0) : 'n/a'}</td>
                  <td className={cell.className}>{cell.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="quote-list">
        <div>
          <dt>SUPPLY ACROSS CHAINS</dt>
          <dd>{anyUnread ? 'NOT READ ON EVERY CHAIN' : `${formatTokens(sum, 0)} of ${formatInt(FIXED_SUPPLY)}`}</dd>
        </div>
        <div>
          <dt>CHECKED AT</dt>
          <dd>{checkedAt.replace('T', ' ').slice(0, 19)} UTC</dd>
        </div>
      </dl>
      <p className="step-note">
        {anyUnread
          ? 'One or more chains could not be read. No value is assumed for them.'
          : sum === TOTAL_SUPPLY_UNITS
            ? `Invariant: supply across all chains is always ${formatInt(FIXED_SUPPLY)}.`
            : 'Tokens in cross-chain transit are not counted on any chain until they are delivered.'}{' '}
        verify() is a live read of the Registry on each chain. It is false until expansion locks the
        token: that is a fact about its stage, not a warning.
      </p>
    </div>
  );
});

const tradeKey = (trade: Trade) => `${trade.txHash}-${trade.logIndex}`;

type TimeMode = 'age' | 'time';
type SideFilter = 'all' | 'buy' | 'sell';

// Tabel dibuka dengan beberapa trade terbaru; "Show more" menambahnya bertahap sampai semua trade
// yang dibawa detail (detail hanya membawa trade terbaru, bukan seluruh riwayat).
const TRADE_STEPS = [8, 25] as const;
const SIDE_LABEL: Record<SideFilter, string> = { all: 'All', buy: 'Buys', sell: 'Sells' };

const pad2 = (value: number) => String(value).padStart(2, '0');

/** Waktu blok dalam UTC: "11-18 14:03" untuk sel, lengkap dengan tahun dan detik untuk `title`. */
function utcParts(timestamp: number): { short: string; full: string } {
  const date = new Date(timestamp * 1_000);
  const day = `${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  const clock = `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
  return {
    short: `${day} ${clock}`,
    full: `${date.getUTCFullYear()}-${day} ${clock}:${pad2(date.getUTCSeconds())} UTC`,
  };
}

/** Umur ringkas: 45s, 12m, 7h, 3d. */
function shortAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/**
 * Sel waktu sebuah trade. Umur dihitung dari waktu blok dan terus berjalan; sebelum hidrasi (jam
 * server ≠ jam klien) yang tampil adalah waktu UTC-nya. Waktu yang belum terbaca ditulis apa
 * adanya, tidak diperkirakan.
 */
function TradeTime({ timestamp, mode }: { timestamp: number | null; mode: TimeMode }) {
  const age = useAgeSeconds(timestamp === null ? null : new Date(timestamp * 1_000).toISOString());
  // Waktu blok menyusul sesaat setelah trade tampil; sampai terbaca tidak ada angka yang ditebak.
  if (timestamp === null) return <span title="The block time has not been read yet.">reading…</span>;
  const utc = utcParts(timestamp);
  return (
    <time dateTime={new Date(timestamp * 1_000).toISOString()} title={utc.full}>
      {mode === 'age' && age !== null ? shortAge(age) : utc.short}
    </time>
  );
}

export const TradesTable = memo(function TradesTable({
  trades,
  tradeCount,
  curve,
  params,
  home,
}: {
  trades: Trade[];
  tradeCount: number;
  curve: CurveState;
  params: CurveParams;
  home: ChainInfo;
}) {
  // Baris yang sudah ada saat panel pertama tampil tidak dianimasikan; hanya trade yang datang
  // sesudahnya. Kunci pertama disimpan sekali lewat state awal.
  const [seen] = useState(() => new Set(trades.map(tradeKey)));
  const [timeMode, setTimeMode] = useState<TimeMode>('age');
  const [side, setSide] = useState<SideFilter>('all');
  const [step, setStep] = useState(0);
  const shape = useCurveShape(curve, params);
  if (trades.length === 0) return null;
  const matching = side === 'all' ? trades : trades.filter((trade) => trade.side === side);
  const limit = TRADE_STEPS[step] ?? matching.length;
  const recent = matching.slice(-limit).reverse();
  const canShowMore = recent.length < matching.length;
  return (
    <div className="app-panel area-trades">
      <div className="panel-head">
        <h2>Recent curve trades</h2>
        <div className="chart-tabs" role="group" aria-label="Filter trades by side">
          {(['all', 'buy', 'sell'] as const).map((item) => (
            <button key={item} type="button" aria-pressed={side === item} onClick={() => setSide(item)}>
              {SIDE_LABEL[item]}
            </button>
          ))}
        </div>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="time-switch" role="group" aria-label="Show trade age or time">
                  {(['age', 'time'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={timeMode === item}
                      onClick={() => setTimeMode(item)}
                    >
                      {item === 'age' ? 'AGE' : 'TIME (UTC)'}
                      {timeMode === item && <span aria-hidden="true"> ↓</span>}
                    </button>
                  ))}
                </span>
              </th>
              <th scope="col">SIDE</th>
              <th scope="col" className="num">
                PRICE AFTER
              </th>
              <th scope="col" className="num">
                ETH
              </th>
              <th scope="col" className="num">
                TOKENS
              </th>
              <th scope="col">TRADER</th>
              <th scope="col">TX</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr>
                <td colSpan={7}>
                  No {side === 'buy' ? 'buys' : 'sells'} among the latest {formatInt(trades.length)} trades.
                </td>
              </tr>
            )}
            {recent.map((trade) => {
              const txUrl = explorerTxUrl(home, trade.txHash);
              const traderUrl = explorerAddressUrl(home, trade.trader);
              return (
                <tr key={tradeKey(trade)} className={cn(!seen.has(tradeKey(trade)) && 'is-new')}>
                  <td className="num-left">
                    <TradeTime timestamp={trade.timestamp} mode={timeMode} />
                  </td>
                  <td>
                    <span className={cn('side-badge', trade.side === 'sell' && 'is-sell')}>
                      <span aria-hidden="true">{trade.side === 'buy' ? '▲' : '▼'}</span>
                      {trade.side === 'buy' ? 'BUY' : 'SELL'}
                    </span>
                  </td>
                  {/* Harga curve sesudah trade ini, diturunkan dari `ethRaised` di event-nya. */}
                  <td className="num">
                    {formatUnitsFixed(curvePriceAt(shape, BigInt(trade.ethRaised)), 18, PRICE_DIGITS)}
                  </td>
                  <td className="num">{formatEth(trade.ethAmount)}</td>
                  <td className="num">{formatTokens(trade.tokenAmount, 0)}</td>
                  <td>
                    {traderUrl ? (
                      <a href={traderUrl} target="_blank" rel="noreferrer noopener">
                        {shortAddress(trade.trader)}
                      </a>
                    ) : (
                      shortAddress(trade.trader)
                    )}
                  </td>
                  <td>
                    {txUrl ? (
                      <a href={txUrl} target="_blank" rel="noreferrer noopener">
                        BLOCK {trade.blockNumber} ↗
                      </a>
                    ) : (
                      `BLOCK ${trade.blockNumber}`
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel-meta panel-foot trades-foot">
        <span>
          SHOWING {formatInt(recent.length)} OF {formatInt(matching.length)} LOADED · {formatInt(tradeCount)} TOTAL ON THE CURVE
        </span>
        {canShowMore ? (
          <button type="button" className="link-btn" onClick={() => setStep((current) => current + 1)}>
            Show more
          </button>
        ) : (
          step > 0 && (
            <button type="button" className="link-btn" onClick={() => setStep(0)}>
              Show fewer
            </button>
          )
        )}
      </div>
    </div>
  );
});
