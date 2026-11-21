'use client';

import { memo, useState } from 'react';
import { explorerAddressUrl, explorerTxUrl, getChain, type ChainInfo } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { formatBps, formatEth, formatInt, formatTokens, shortAddress } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';
import { FIXED_SUPPLY } from '@/components/launch/launch-fields';
import { PriceChart, type ChartMode } from '@/components/token/price-chart';
import { Ago, useAgeSeconds } from '@/components/ui/ago';
import { LiveValue } from '@/components/ui/live-value';
import { ProgressBar } from '@/components/ui/progress-bar';
import type { CurveParams, CurveState, Trade, VerifyReading } from '@/types/domain';

const TOTAL_SUPPLY_UNITS = BigInt(FIXED_SUPPLY) * 10n ** 18n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const RECENT_TRADES = 8;

/** Perubahan harga terhadap harga awal curve, dalam persen satu desimal. null bila tidak terhitung. */
function changeFromStart(current: bigint, start: bigint): { text: string; direction: 'up' | 'down' | null } | null {
  if (start <= 0n) return null;
  const tenths = ((current - start) * 1_000n) / start;
  if (tenths === 0n) return { text: 'AT START PRICE', direction: null };
  const abs = tenths < 0n ? -tenths : tenths;
  const text = `${tenths > 0n ? '▲ +' : '▼ −'}${abs / 10n}.${abs % 10n}% FROM START`;
  return { text, direction: tenths > 0n ? 'up' : 'down' };
}

interface PricePanelProps {
  curve: CurveState;
  params: CurveParams;
  spark: string[];
  tradeCount: number;
  startPrice: string;
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

export const PricePanel = memo(function PricePanel({ curve, params, spark, tradeCount, startPrice, feed }: PricePanelProps) {
  const [mode, setMode] = useState<ChartMode>('curve');
  const price = BigInt(curve.currentPrice);
  const raised = BigInt(curve.ethRaised);
  const threshold = BigInt(curve.graduationThreshold);
  const change = changeFromStart(price, BigInt(startPrice));
  const remaining = threshold > raised ? threshold - raised : 0n;

  return (
    <div className="app-panel area-chart rise" style={{ '--i': 2 } as React.CSSProperties}>
      <div className="panel-head">
        <h2>Bonding curve</h2>
        <div className="chart-tabs" role="group" aria-label="Chart view">
          {(['curve', 'trades'] as const).map((item) => (
            <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)}>
              {item === 'curve' ? 'Curve' : 'Trades'}
            </button>
          ))}
        </div>
      </div>
      <PriceChart mode={mode} curve={curve} params={params} spark={spark} tradeCount={tradeCount} />
      {mode === 'trades' && tradeCount === 0 && (
        <p className="step-note">No trades yet. The line shows the starting price.</p>
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
          <small>PRICE</small>
          <strong>
            <LiveValue amount={price}>{formatEth(price, 12)}</LiveValue>
          </strong>
          <em className={cn(change?.direction)}>{change?.text}</em>
        </div>
        <div className="stat-tile">
          <small>RAISED</small>
          <strong>
            <LiveValue amount={raised}>{formatEth(raised)}</LiveValue>
          </strong>
          <em>OF {formatEth(threshold)}</em>
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
          <em>{remaining > 0n ? `${formatEth(remaining)} TO GO` : 'THRESHOLD REACHED'}</em>
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
  home,
}: {
  trades: Trade[];
  tradeCount: number;
  home: ChainInfo;
}) {
  // Baris yang sudah ada saat panel pertama tampil tidak dianimasikan; hanya trade yang datang
  // sesudahnya. Kunci pertama disimpan sekali lewat state awal.
  const [seen] = useState(() => new Set(trades.map(tradeKey)));
  const [timeMode, setTimeMode] = useState<TimeMode>('age');
  if (trades.length === 0) return null;
  const recent = trades.slice(-RECENT_TRADES).reverse();
  return (
    <div className="app-panel area-trades">
      <div className="panel-head">
        <h2>Recent curve trades</h2>
        <span className="panel-meta">
          {recent.length} OF {formatInt(tradeCount)}
        </span>
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
    </div>
  );
});
