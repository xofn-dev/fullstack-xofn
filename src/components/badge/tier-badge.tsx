'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { getTierInfo } from '@/lib/tiers';
import { STATUS_CLASS, STATUS_LABEL } from '@/lib/tokens/status';
import type { DisplayStatus, Tier } from '@/types/enums';

// TierBadge: selalu tampil BERSAMA status (mis. "XofN 2+1/2 · Bonding") dan selalu bisa diklik
// untuk membuka rincian DVN (DESIGN_SYSTEM §5.3, PRD §4.1).
export function TierBadge({
  tier,
  status,
  children,
}: {
  tier: Tier;
  status: DisplayStatus;
  /** Isi panel rincian (biasanya <DvnList/>). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const info = getTierInfo(tier);
  return (
    <div className="tier-badge">
      <button
        type="button"
        className={cn('tier-badge-btn', STATUS_CLASS[status])}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <b>{info.badge}</b>
        <span aria-hidden="true">·</span>
        <span>{STATUS_LABEL[status]}</span>
        <span className="arr" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      <div id={panelId} className="tier-badge-panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
