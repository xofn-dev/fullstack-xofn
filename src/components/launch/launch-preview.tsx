'use client';

import { memo } from 'react';
import type { ChainInfo } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { formatEth, formatInt, isValidTicker } from '@/lib/format';
import { getTierInfo, tierDvnSummary } from '@/lib/tiers';
import { FIXED_SUPPLY } from '@/lib/tokens/market';
import { STATUS_LABEL } from '@/lib/tokens/status';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatusPill } from '@/components/ui/status-pill';
import type { Tier } from '@/types/enums';

interface LaunchPreviewProps {
  name: string;
  ticker: string;
  /** Object URL yang sama dengan pratinjau di form; tidak dibuat ulang di sini. */
  logoUrl: string | null;
  tier: Tier;
  home: ChainInfo;
  /** Nama chain ekspansi terpilih, sudah digabung; kosong bila belum ada yang dipilih. */
  networks: string;
  /** Ambang graduation dari chain (wei); null bila belum/tidak terbaca. */
  threshold: string | null;
  thresholdReading: boolean;
}

const NAME_MAX_BYTES = 32;

/**
 * Pratinjau "On the board": kartu token seperti yang akan tampil setelah launch, diisi langsung
 * dari state form. Murni tampilan: tidak punya state, tidak memvalidasi ulang, dan tidak membaca
 * chain. Selalu berlabel PREVIEW supaya tidak terbaca sebagai token yang sudah ada.
 * Di-`memo` dan hanya menerima nilai primitif, jadi hanya digambar ulang saat isinya berubah.
 */
export const LaunchPreview = memo(function LaunchPreview({
  name,
  ticker,
  logoUrl,
  tier,
  home,
  networks,
  threshold,
  thresholdReading,
}: LaunchPreviewProps) {
  const info = getTierInfo(tier);
  const shownName = name.trim();
  const shownTicker = ticker.trim().toUpperCase();
  // Aturan yang sama dengan validasi submit; di sini hanya petunjuk, bukan penghalang.
  const tickerHint = shownTicker !== '' && !isValidTicker(shownTicker) ? 'Ticker needs 2 to 12 letters or digits.' : null;
  const nameHint =
    new TextEncoder().encode(shownName).length > NAME_MAX_BYTES ? 'Name is longer than 32 bytes.' : null;

  const rows: Array<[string, string]> = [
    ['SUPPLY', `${formatInt(FIXED_SUPPLY)} FIXED`],
    ['HOME CHAIN', home.name],
    ['EXPANSION · PLANNED', networks || 'None selected'],
    ['GRADUATES AT', threshold ? formatEth(threshold) : thresholdReading ? 'READING…' : 'NOT READ'],
    ['MESSAGE / EXPANSION COST', 'NOT QUOTED'],
    ['LOGO', logoUrl ? 'Hash only · image is not stored' : 'Default glyph'],
    ['TOKEN ADDRESS', 'Assigned at launch'],
  ];

  return (
    <section className="app-panel is-quiet launch-preview" aria-labelledby="launchPreviewTitle">
      <div className="panel-head">
        <h2 id="launchPreviewTitle">On the board</h2>
        <span className="tag warn">
          <i /> PREVIEW · NOT DEPLOYED
        </span>
      </div>
      <div className="token-top">
        <div className="token-id">
          <div className="token-glyph">
            {/* Pratinjau lokal dari object URL; next/image tidak berlaku untuk blob. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? <img src={logoUrl} alt="" /> : '✳'}
          </div>
          <div>
            <h3 className={cn(!shownName && 'is-placeholder')}>{shownName || 'Token name'}</h3>
            <p>
              <span className={cn(!shownTicker && 'is-placeholder')}>${shownTicker || 'TICKER'}</span> · {home.shortName}
            </p>
          </div>
        </div>
        <StatusPill status="bonding" short />
      </div>
      {(nameHint || tickerHint) && <p className="field-reason">{nameHint ?? tickerHint}</p>}
      <div className="preview-tier">
        <span className="token-badge">
          {info.badge} · {STATUS_LABEL.bonding}
        </span>
        <small>
          {info.label} · {tierDvnSummary(tier)}. Tier committed at launch, applied at expansion.
        </small>
      </div>
      <div className="token-info">
        <span>GRADUATION AT LAUNCH</span>
        <strong>0.0%</strong>
      </div>
      <ProgressBar bps={0} label="Progress to graduation threshold at launch" />
      <dl className="quote-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="step-note">
        This card mirrors the form as you type. Nothing on it exists on chain until the launch is signed.
      </p>
    </section>
  );
});
