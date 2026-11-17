'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChainInfo } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { sparklinePoints } from '@/lib/format';
import { useDialogFocus, useOverlay } from '@/components/ui/overlay-provider';
import { SplitHeading } from '@/components/landing/split-heading';
import { TIER_COPY } from '@/components/landing/tier-context';
import { DEMO_TOKENS, STATUS_COPY, TONE_VAR, type DemoToken } from '@/components/landing/demo-data';

// D16: filter menambah "Graduated" untuk token yang lulus lokal dan menunggu ekspansi.
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'bonding', label: 'Bonding' },
  { key: 'graduated', label: 'Graduated' },
  { key: 'locked', label: 'Locked' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

type TradeMode = 'Buy' | 'Sell';

// Section 7 — contoh token fiktif + drawer detail (mode preview).
export function Explore({ home }: { home: ChainInfo }) {
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
          <div>
            <div className="section-label">03 / DISCOVER</div>
            <SplitHeading
              lines={[
                'The next generation',
                <>
                  of <span className="accent">provable tokens.</span>
                </>,
              ]}
            />
          </div>
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
              // Kartu berisi heading dan paragraf, jadi tetap <article> ber-role button
              // (seperti di HTML) agar markup sah dan tetap bisa dioperasikan dengan keyboard.
              <article
                key={token.id}
                className="token-card"
                role="button"
                tabIndex={0}
                aria-label={`Open fictional token ${token.name}`}
                onClick={() => setSelected(token)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(token);
                  }
                }}
              >
                <div className="token-top">
                  <div className="token-id">
                    <div className="token-glyph" style={{ color: tone }}>
                      {token.glyph}
                    </div>
                    <div>
                      <h3>{token.name}</h3>
                      <p>${token.ticker} · FICTIONAL</p>
                    </div>
                  </div>
                  <span className={cn('status', status.className)}>{status.badge}</span>
                </div>
                <svg className="token-chart" viewBox="0 0 250 68" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id={`spark-${token.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={tone} stopOpacity=".23" />
                      <stop offset="100%" stopColor={tone} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points={`0,68 ${points} 250,68`} fill={`url(#spark-${token.id})`} />
                  <polyline
                    points={points}
                    fill="none"
                    stroke={tone}
                    strokeWidth="1.7"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <div className="token-info">
                  <span>GRADUATION / SAMPLE</span>
                  <strong>{token.progress}%</strong>
                </div>
                <div className="progress">
                  <div style={{ width: `${token.progress}%` }} />
                </div>
                <div className="token-bottom">
                  <span className="token-badge">{TIER_COPY[token.tier].badge}*</span>
                  <span className="card-more">Preview details ↗</span>
                </div>
              </article>
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
              <strong>{selected ? `${selected.progress}% / SAMPLE` : '—'}</strong>
            </div>
            <div className="drawer-kv">
              <small>SECURITY BADGE</small>
              <strong>{selected ? `${TIER_COPY[selected.tier].badge} / DEMO` : '—'}</strong>
            </div>
            <div className="drawer-kv">
              <small>HOME CHAIN</small>
              <strong>{home.name} / example</strong>
            </div>
            <div className="drawer-kv">
              <small>STATUS</small>
              <strong>{selected ? STATUS_COPY[selected.status].drawer : '—'}</strong>
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
