'use client';

import Link from 'next/link';
import { memo, useEffect, useRef, useState } from 'react';
import { explorerAddressUrl, type ChainInfo } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { shortAddress } from '@/lib/format';
import { STATUS_LABEL } from '@/lib/tokens/status';
import { DvnList } from '@/components/badge/dvn-list';
import { TierBadge } from '@/components/badge/tier-badge';
import { Coin3D } from '@/components/ui/coin-3d';
import { CopyButton } from '@/components/ui/copy-button';
import type { TokenDetail } from '@/types/domain';
import type { DisplayStatus, GraduatorStatus } from '@/types/enums';

type HeadToken = Pick<
  TokenDetail,
  'name' | 'symbol' | 'address' | 'creator' | 'curve' | 'tier' | 'status' | 'pathways' | 'verify'
>;

/** Kepala halaman token: nama, ticker, alamat, dan TierBadge yang selalu bersama statusnya. */
export const TokenHead = memo(function TokenHead({ token, home }: { token: HeadToken; home: ChainInfo }) {
  const coin = useRef<HTMLDivElement>(null);
  const [coinVisible, setCoinVisible] = useState(true);
  // Koin CSS berhenti berputar saat tergulir keluar layar.
  useEffect(() => {
    const element = coin.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setCoinVisible(entry?.isIntersecting ?? true));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const tokenUrl = explorerAddressUrl(home, token.address);
  const creatorUrl = explorerAddressUrl(home, token.creator);
  const curveUrl = explorerAddressUrl(home, token.curve);

  return (
    <div className="token-head rise">
      <div className="token-id">
        <div ref={coin} className={cn(!coinVisible && 'is-paused')}>
          <Coin3D className="token-coin" />
        </div>
        <div className="token-id-text">
          <div className="section-label">
            <Link href="/#explore">EXPLORE</Link> / {home.shortName}
          </div>
          <h1>{token.name}</h1>
          <div className="token-meta">
            <span className="chip">
              <b>${token.symbol}</b>
            </span>
            <span className="chip">
              <span className="address-full" title={token.address}>
                {shortAddress(token.address, 10, 8)}
              </span>
              <CopyButton value={token.address} what="Token address" />
              {tokenUrl && (
                <a href={tokenUrl} target="_blank" rel="noreferrer noopener">
                  explorer ↗
                </a>
              )}
            </span>
            <span className="chip">
              CREATOR{' '}
              {creatorUrl ? (
                <a href={creatorUrl} target="_blank" rel="noreferrer noopener">
                  {shortAddress(token.creator)} ↗
                </a>
              ) : (
                <b>{shortAddress(token.creator)}</b>
              )}
            </span>
            <span className="chip">
              CURVE{' '}
              {curveUrl ? (
                <a href={curveUrl} target="_blank" rel="noreferrer noopener">
                  {shortAddress(token.curve)} ↗
                </a>
              ) : (
                <b>{shortAddress(token.curve)}</b>
              )}
            </span>
            {/* Konfigurasi DVN token ini bisa dibaca siapa pun di XofN Check, tanpa mempercayai halaman ini. */}
            <Link className="chip is-link" href={`/check/${home.key}/${token.address}`}>
              XOFN CHECK ↗
            </Link>
          </div>
        </div>
      </div>
      <TierBadge tier={token.tier} status={token.status}>
        <DvnList tier={token.tier} pathways={token.pathways} verify={token.verify} applied={token.status === 'locked'} />
      </TierBadge>
    </div>
  );
});

const STAGES: Array<{ key: Exclude<GraduatorStatus, 'none'>; hint: string }> = [
  { key: 'bonding', hint: 'Trading on the curve' },
  { key: 'graduated', hint: 'Home pool created' },
  { key: 'expanding', hint: 'Deploying to planned chains' },
  { key: 'locked', hint: 'verify() true on every chain' },
];

/**
 * Rel lifecycle dua tahap. Posisi mengikuti status Graduator; langkah terakhir hanya ditandai
 * Locked bila status tampilan memang `locked` (verify() true di semua chain). Setiap langkah
 * membawa teks keadaannya, jadi tidak bergantung pada warna.
 */
export const StageRail = memo(function StageRail({
  graduatorStatus,
  status,
}: {
  graduatorStatus: GraduatorStatus;
  status: DisplayStatus;
}) {
  const position = STAGES.findIndex((stage) => stage.key === graduatorStatus);
  return (
    <ol className="stage-rail rise" style={{ '--i': 1 } as React.CSSProperties} aria-label="Token lifecycle">
      {STAGES.map((stage, index) => {
        let state: 'done' | 'current' | 'next' | 'alert' | 'unread' = 'next';
        let mark = '○ NEXT';
        if (position === -1) {
          state = 'unread';
          mark = '◌ NOT READ';
        } else if (stage.key === 'locked' && graduatorStatus === 'locked') {
          if (status === 'locked') {
            state = 'current';
            mark = '● LOCKED';
          } else if (status === 'changed') {
            state = 'alert';
            mark = '✕ CHANGED';
          } else {
            state = 'unread';
            mark = '◌ NOT READ';
          }
        } else if (index < position) {
          state = 'done';
          mark = '✓ DONE';
        } else if (index === position) {
          state = 'current';
          mark = '● NOW';
        }
        return (
          <li key={stage.key} className={`is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <strong>{STATUS_LABEL[stage.key]}</strong>
            <small>
              {mark} · {stage.hint}
            </small>
          </li>
        );
      })}
    </ol>
  );
});
