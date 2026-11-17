'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { pricePolyline } from '@/lib/format';
import { ApiError, useTokenList } from '@/lib/client/use-tokens';
import { getTierInfo } from '@/lib/tiers';
import { STATUS_LABEL, type StatusFilter } from '@/lib/tokens/status';
import { TokenCard } from '@/components/token/token-card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import type { DisplayStatus } from '@/types/enums';

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'bonding', label: 'Bonding' },
  { key: 'graduated', label: 'Graduated' },
  { key: 'locked', label: 'Locked' },
];

const TONE: Record<DisplayStatus, string> = {
  bonding: 'var(--color-orange)',
  graduated: 'var(--color-blue)',
  expanding: 'var(--color-blue)',
  locked: 'var(--color-mint)',
  changed: 'var(--color-danger)',
  unread: 'var(--color-muted)',
};

// Daftar token nyata untuk mode simulation (USER_FLOWS Flow A). Status tiap kartu dibaca dari
// chain lewat API; kartu membuka halaman token. Tidak ada token fiktif di sini.
export function ExploreLive() {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const query = useTokenList(filter);
  const tokens = query.data;

  return (
    <>
      <div className="explore-headline">
        <div className="filters" role="group" aria-label="Filter tokens by status">
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
      <div className="token-grid" aria-live="polite">
        {tokens?.map((token) => {
          const info = getTierInfo(token.tier);
          return (
            <TokenCard
              key={token.address}
              id={token.address}
              live
              glyph="◇"
              tone={TONE[token.status]}
              title={
                <Link className="token-card-link" href={`/t/${token.address}`}>
                  {token.name}
                </Link>
              }
              subtitle={`$${token.symbol} · LOCAL SIMULATION`}
              status={<StatusPill status={token.status} short />}
              points={pricePolyline(token.spark)}
              progressLabel="GRADUATION"
              progressPercent={Math.floor(token.progressBps / 100)}
              footer={
                <>
                  {/* Badge selalu bersama status (PRD §4.1). */}
                  <span className="token-badge">
                    {info.badge} · {STATUS_LABEL[token.status]}
                  </span>
                  <span className="card-more">Open token ↗</span>
                </>
              }
            />
          );
        })}
      </div>
      {query.isPending && <EmptyState title="READING TOKENS…">Reading the token list from the chain.</EmptyState>}
      {query.isError && !tokens && (
        <EmptyState title="TOKENS NOT READ">
          {query.error instanceof ApiError
            ? query.error.message
            : 'The chain could not be read. No token is assumed.'}
        </EmptyState>
      )}
      {tokens && tokens.length === 0 && (
        <EmptyState title="No tokens in this state yet.">
          {filter === 'all' ? (
            <>
              Nothing has been launched on this local node. <Link href="/launch">Launch a token ↗</Link>
            </>
          ) : null}
        </EmptyState>
      )}
      <p className="preview-note">
        ◈ LOCAL SIMULATION: these tokens exist only on a local test node. Status is read from the
        chain; a token is shown as Locked only when verify() is true on every chain.
      </p>
    </>
  );
}
