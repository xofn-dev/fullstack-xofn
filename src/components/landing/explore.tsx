'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChainInfo } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { sparklinePoints } from '@/lib/format';
import { useDialogFocus, useOverlay } from '@/components/ui/overlay-provider';
import { SplitHeading } from '@/components/landing/split-heading';
import { TIER_COPY } from '@/components/landing/tier-context';
import { DEMO_TOKENS, STATUS_COPY, TONE_VAR, type DemoToken } from '@/components/landing/demo-data';
import { ExploreLive } from '@/components/token/explore-live';
import { TokenCard } from '@/components/token/token-card';
import type { AppMode } from '@/types/enums';

// D16: filter menambah "Graduated" untuk token yang lulus lokal dan menunggu ekspansi.
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'bonding', label: 'Bonding' },
  { key: 'graduated', label: 'Graduated' },
  { key: 'locked', label: 'Locked' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

type TradeMode = 'Buy' | 'Sell';

const HEADING = (
  <div>
    <div className="section-label">DISCOVER</div>
    <SplitHeading
      lines={[
        'The next generation',
        <>
          of <span className="accent">provable tokens.</span>
        </>,
      ]}
    />
  </div>
);

// Section 7. Mode preview: contoh token fiktif + drawer detail. Mode simulation dan live (testnet):
// token nyata dari chain, kartu membuka /t/[address] (USER_FLOWS Flow A langkah 4).
export function Explore({ home, mode }: { home: ChainInfo; mode: AppMode }) {
  if (mode !== 'preview') {
    return (
      <section className="section alt" id="explore">
        <div className="container">
          <div className="sec-head">{HEADING}</div>
          <ExploreLive home={home} mode={mode} />
        </div>
      </section>
    );
  }
  return <ExploreDemo home={home} />;
}

function ExploreDemo({ home }: { home: ChainInfo }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<DemoToken | null>(null);
  const [tradeMode, setTradeMode] = useState<TradeMode>('Buy');
  const drawerRef = useRef<HTMLElement>(null);
  const { openModal } = useOverlay();

  const closeDrawer = useCallback(() => setSelected(null), []);
  useDialogFocus(selected !== null, drawerRef, closeDrawer);

  const tokens = DEMO_TOKENS.filter((token) => filter === 'all' || token.status === filter);

  const previewTrade = () => {
    closeDrawer();
    openModal({
      title: 'Trading requires a live launch',
      copy: 'This is an interaction preview only. No buy or sell can be executed, and no sample token is for sale.',
      detail: `Trade mode: ${tradeMode}. A production UI needs audited curve/pool contracts, live price and slippage quotes, wallet connection, and transaction simulation.`,
    });
  };

  return (
    <section className="section alt" id="explore">
      <div className="container">
        <div className="sec-head">
          {HEADING}
          <div className="explore-headline">
            <div className="filters" role="group" aria-label="Filter demo token examples">
              {FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={cn('filter', filter === item.key && 'active')}
                  aria-pressed={filter === item.key}
                  onClick={() => setFilter(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="token-grid" id="tokenGrid">
          {tokens.map((token) => {
            const tone = TONE_VAR[token.tone];
            const status = STATUS_COPY[token.status];
            const points = sparklinePoints(token.seed);
            return (
              <TokenCard
                key={token.id}
                id={String(token.id)}
                glyph={token.glyph}
                tone={tone}
                title={token.name}
                subtitle={`$${token.ticker} · FICTIONAL`}
                status={<span className={cn('status', status.className)}>{status.badge}</span>}
                points={points}
                progressLabel="GRADUATION / SAMPLE"
                progressPercent={token.progress}
                ariaLabel={`Open fictional token ${token.name}`}
                onActivate={() => setSelected(token)}
                footer={
                  <>
                    <span className="token-badge">{TIER_COPY[token.tier].badge}*</span>
                    <span className="card-more">Preview details ↗</span>
                  </>
                }
              />
            );
          })}
          {tokens.length === 0 && <p className="preview-note">No tokens in this state yet.</p>}
        </div>
        <p className="preview-note">
          ◈ INTERFACE DEMO: All tokens, progress bars, charts and security states in this section
          are fictional examples (*). No $XOFN token sale or XofN token deployments are implied.
        </p>
      </div>

      <div
        className={cn('drawer-backdrop', selected && 'open')}
        role="dialog"
        aria-modal="true"
        aria-label="Token details drawer"
        aria-hidden={selected ? undefined : true}
        data-lenis-prevent=""
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
      >
        <aside className="drawer" ref={drawerRef}>
          <div className="drawer-top">
            <span className="eyebrow">DEMO TOKEN DETAIL / NOT LIVE</span>
            <button className="close" type="button" aria-label="Close token details" onClick={closeDrawer}>
              ✕
            </button>
          </div>
          <h2>{selected?.name ?? 'Sample token'}</h2>
          <div className="mono muted">${selected?.ticker ?? 'DEMO'} · FICTIONAL TOKEN DATA</div>
          <div className="drawer-chart">
            <svg className="drawer-spark" viewBox="0 0 440 170" preserveAspectRatio="none" aria-hidden="true">
              {selected && (
                <polyline
                  points={sparklinePoints(selected.seed, 65, 440, 170)}
                  fill="none"
                  stroke={TONE_VAR[selected.tone]}
                  strokeWidth="2"
                />
              )}
            </svg>
          </div>
          <div className="drawer-grid">
            <div className="drawer-kv">
              <small>GRADUATION</small>
              <strong>{selected ? `${selected.progress}% / SAMPLE` : 'n/a'}</strong>
            </div>
            <div className="drawer-kv">
              <small>SECURITY BADGE</small>
              <strong>{selected ? `${TIER_COPY[selected.tier].badge} / DEMO` : 'n/a'}</strong>
            </div>
            <div className="drawer-kv">
              <small>HOME CHAIN</small>
              <strong>{home.name} / example</strong>
            </div>
            <div className="drawer-kv">
              <small>STATUS</small>
              <strong>{selected ? STATUS_COPY[selected.status].drawer : 'n/a'}</strong>
            </div>
          </div>
          <div className="trade-toggle" role="group" aria-label="Trade side">
            {(['Buy', 'Sell'] as const).map((side) => (
              <button
                key={side}
                type="button"
                className={cn(tradeMode === side && 'active')}
                aria-pressed={tradeMode === side}
                onClick={() => setTradeMode(side)}
              >
                {side}
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="tradeAmount">
            AMOUNT · DEMO ONLY
          </label>
          <input id="tradeAmount" className="form-control" type="number" min="0" placeholder="0.0" />
          <p className="trade-note">
            Chart and token information are illustrative. No live price, market cap, wallet
            connection, or execution is available in this preview.
          </p>
          <button className="btn primary" type="button" onClick={previewTrade}>
            Preview {tradeMode} flow ↗
          </button>
          <div className="drawer-foot">
            <div className="eyebrow">INSPECTABLE CONFIGURATION</div>
            <p className="muted">
              The full product would show DVN operators by pathway, owner/delegate, supply across
              chains, live verify() calls, and LayerZero Scan transaction links. Before expansion,
              the tier is committed and its DVN configuration is applied at expansion.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
