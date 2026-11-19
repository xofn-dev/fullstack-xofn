'use client';

import Link from 'next/link';
import { getChain } from '@/lib/chains';
import { formatBps, formatEth, formatInt, formatTokens, pricePolyline, shortAddress } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';
import { ApiError, useTokenDetail } from '@/lib/client/use-tokens';
import { homeContracts, type Deployment } from '@/lib/web3/addresses';
import { DvnList } from '@/components/badge/dvn-list';
import { TierBadge } from '@/components/badge/tier-badge';
import { ExpansionPanel } from '@/components/expansion/expansion-panel';
import { GraduationPanel } from '@/components/graduation/graduation-panel';
import { TradePanel } from '@/components/token/trade-panel';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/ui/progress-bar';
import { FIXED_SUPPLY } from '@/components/launch/launch-fields';
import type { TokenDetail, VerifyReading } from '@/types/domain';

const TOTAL_SUPPLY_UNITS = BigInt(FIXED_SUPPLY) * 10n ** 18n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function verifyCell(reading: VerifyReading): { text: string; className: string } {
  if (reading.status === 'absent') return { text: 'NOT DEPLOYED', className: '' };
  if (reading.status === 'unread' || reading.locked === null) return { text: 'NOT READ', className: 'warn' };
  if (reading.registrarKnown === false) return { text: 'REGISTRY NOT RECOGNISED', className: 'bad' };
  return reading.locked ? { text: 'TRUE', className: 'ok' } : { text: 'FALSE', className: '' };
}

const holder = (address: string | null) =>
  address === null ? 'not read' : address === ZERO_ADDRESS ? '0x0 · none' : shortAddress(address);

function SecurityTable({ token }: { token: TokenDetail }) {
  const readSupplies = token.verify.filter((reading) => reading.totalSupply !== null);
  const sum = readSupplies.reduce((total, reading) => total + BigInt(reading.totalSupply ?? '0'), 0n);
  const anyUnread = token.verify.some((reading) => reading.status === 'unread');
  return (
    <div className="app-panel">
      <h2>Security · read from each chain</h2>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">CHAIN</th>
              <th scope="col">TOKEN</th>
              <th scope="col">OWNER</th>
              <th scope="col">DELEGATE</th>
              <th scope="col">SUPPLY</th>
              <th scope="col">VERIFY()</th>
            </tr>
          </thead>
          <tbody>
            {token.verify.map((reading) => {
              const cell = verifyCell(reading);
              return (
                <tr key={reading.chain}>
                  <td>{getChain(publicEnv.network, reading.chain).shortName}</td>
                  <td>{reading.token ? shortAddress(reading.token) : 'n/a'}</td>
                  <td>{reading.token ? holder(reading.owner) : 'n/a'}</td>
                  <td>{reading.token ? holder(reading.delegate) : 'n/a'}</td>
                  <td>{reading.totalSupply !== null ? formatTokens(reading.totalSupply, 0) : 'n/a'}</td>
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
          <dd>
            {anyUnread ? 'NOT READ ON EVERY CHAIN' : `${formatTokens(sum, 0)} of ${formatInt(FIXED_SUPPLY)}`}
          </dd>
        </div>
        <div>
          <dt>CHECKED AT</dt>
          <dd>{token.checkedAt.replace('T', ' ').slice(0, 19)} UTC</dd>
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
}

function PricePanel({ token }: { token: TokenDetail }) {
  const curve = token.curveState;
  const points = pricePolyline(token.spark, 600, 190, 14);
  return (
    <div className="app-panel">
      <h2>Bonding curve</h2>
      <svg className="price-chart" viewBox="0 0 600 190" preserveAspectRatio="none" role="img" aria-label="Curve price after each trade">
        {points && (
          <polyline points={points} fill="none" stroke="var(--color-mint)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {token.trades.length === 0 && <p className="step-note">No trades yet. The line shows the starting price.</p>}
      <div className="token-info">
        <span>GRADUATION</span>
        <strong>{formatBps(curve.progressBps)}</strong>
      </div>
      <ProgressBar bps={curve.progressBps} label="Progress to graduation threshold" />
      <div className="stat-row">
        <div className="drawer-kv">
          <small>PRICE</small>
          <strong>{formatEth(curve.currentPrice, 12)}</strong>
        </div>
        <div className="drawer-kv">
          <small>RAISED</small>
          <strong>
            {formatEth(curve.ethRaised)} / {formatEth(curve.graduationThreshold)}
          </strong>
        </div>
        <div className="drawer-kv">
          <small>SOLD ON CURVE</small>
          <strong>{formatTokens(curve.tokensSold, 0)}</strong>
        </div>
        <div className="drawer-kv">
          <small>TRADES</small>
          <strong>{token.trades.length}</strong>
        </div>
      </div>
    </div>
  );
}

function TradesTable({ token }: { token: TokenDetail }) {
  const recent = [...token.trades].reverse().slice(0, 8);
  if (recent.length === 0) return null;
  return (
    <div className="app-panel">
      <h2>Recent curve trades</h2>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">SIDE</th>
              <th scope="col">ETH</th>
              <th scope="col">TOKENS</th>
              <th scope="col">TRADER</th>
              <th scope="col">BLOCK</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((trade) => (
              <tr key={`${trade.txHash}-${trade.logIndex}`}>
                <td className={trade.side === 'buy' ? 'ok' : 'warn'}>{trade.side.toUpperCase()}</td>
                <td>{formatEth(trade.ethAmount)}</td>
                <td>{formatTokens(trade.tokenAmount, 0)}</td>
                <td>{shortAddress(trade.trader)}</td>
                <td>{trade.blockNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Halaman token (USER_FLOWS Flow G). Data di-poll dari API yang membaca chain; kegagalan baca
// ditampilkan sebagai "not read", tidak ditebak.
export function TokenView({
  address,
  initial,
  deployment,
}: {
  address: string;
  initial?: TokenDetail;
  deployment: Deployment;
}) {
  const query = useTokenDetail(address, initial);
  const token = query.data;
  const home = homeContracts(deployment);
  const homeInfo = getChain(publicEnv.network, home.chain.chain);

  if (!token) {
    const message = query.error instanceof ApiError ? query.error.message : null;
    return (
      <EmptyState title={query.isError ? 'TOKEN NOT READ' : 'READING TOKEN…'}>
        {query.isError
          ? (message ?? 'The chain could not be read. No token data is assumed.')
          : 'Reading the token from the chain.'}
      </EmptyState>
    );
  }

  return (
    <>
      <div className="token-head">
        <div>
          <div className="section-label">
            <Link href="/#explore">EXPLORE</Link> / {homeInfo.shortName}
          </div>
          <h1>{token.name}</h1>
          <div className="mono">
            ${token.symbol} · {token.address}
          </div>
        </div>
        <TierBadge tier={token.tier} status={token.status}>
          <DvnList tier={token.tier} pathways={token.pathways} verify={token.verify} applied={token.status === 'locked'} />
        </TierBadge>
      </div>
      {query.isError && (
        <div className="checker-error is-visible" role="status">
          The latest read failed. Showing the last values read at {token.checkedAt.replace('T', ' ').slice(0, 19)}{' '}
          UTC.
        </div>
      )}
      {token.status === 'changed' && (
        <div className="checker-error is-visible" role="status">
          CHANGED: this token is recorded as locked, but verify() is not true on every chain. See the
          security table below for the chain-by-chain reads.
        </div>
      )}
      <div className="app-grid">
        <div className="app-stack">
          <PricePanel token={token} />
          <SecurityTable token={token} />
          <TradesTable token={token} />
        </div>
        <div className="app-stack">
          <TradePanel token={token} homeChain={home.chain.chain} poolVenue={home.chain.uniswapV4} />
          <GraduationPanel token={token} deployment={deployment} />
          <ExpansionPanel token={token} deployment={deployment} />
        </div>
      </div>
    </>
  );
}
