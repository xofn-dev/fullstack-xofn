'use client';

import { useRef } from 'react';
import { cn } from '@/lib/cn';
import { TIERS, type Tier } from '@/types/enums';
import { SplitHeading } from '@/components/landing/split-heading';
import { TIER_COPY, useTier } from '@/components/landing/tier-context';

interface TierCardCopy {
  name: string;
  heading: string;
  copy: string;
  bullets: string[];
  footer: string;
}

// D17: PRD P1 belum diputuskan, jadi kartu menampilkan JUMLAH DVN. Operator yang sudah pasti
// (LayerZero Labs sebagai wajib; Deutsche Telekom dan FCAT sebagai opsional) disebut namanya,
// sisanya ditulis "to be confirmed". Google Cloud/Polyhedra dari HTML konsep tidak dipakai:
// keduanya tidak tersedia di pathway Robinhood (proof/2026-11-17-phase0).
const CARDS: Record<Tier, TierCardCopy> = {
  standard: {
    name: 'TIER_01 / DEFAULT',
    heading: '2+1/2',
    copy: 'Two required DVNs plus one of two optional DVNs.',
    bullets: [
      'LayerZero Labs required',
      'Second required operator to be confirmed*',
      '1 of Deutsche Telekom / FCAT',
      'Lowest of the two tier targets',
    ],
    footer: 'STANDARD · SELECT TO PREVIEW',
  },
  fortress: {
    name: 'TIER_02 / HIGH ASSURANCE',
    heading: '3+1/2',
    copy: 'Three required DVNs plus one of two optional DVNs.',
    bullets: [
      'LayerZero Labs required',
      'Second required operator to be confirmed*',
      'Third required operator to be confirmed*',
      '1 of Deutsche Telekom / FCAT',
    ],
    footer: 'FORTRESS · HIGHER MESSAGE COST',
  },
};

// Section 10 — pemilih tier (radiogroup, D14) + DVN rig.
export function Security() {
  const { tier, setTier } = useTier();
  const refs = useRef<Record<Tier, HTMLDivElement | null>>({ standard: null, fortress: null });

  // Pola radiogroup: panah memindahkan pilihan sekaligus fokus.
  const onKeyDown = (event: React.KeyboardEvent, current: Tier) => {
    const index = TIERS.indexOf(current);
    let next: Tier | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = TIERS[(index + 1) % TIERS.length];
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = TIERS[(index - 1 + TIERS.length) % TIERS.length];
    if (event.key === ' ' || event.key === 'Enter') next = current;
    if (!next) return;
    event.preventDefault();
    setTier(next);
    refs.current[next]?.focus();
  };

  return (
    <section className="section tier-section" id="security">
      <div className="container tier-wrap">
        <div className="tier-intro">
          <div className="section-label">05 / SECURITY POLICY</div>
          <SplitHeading
            lines={[
              'More than',
              <>
                one set of <span className="accent">eyes.</span>
              </>,
            ]}
          />
          <p>
            The creator chooses a security tier when launching. No one can downgrade it later.
            Every route must meet a published verification threshold.
          </p>
          <p className="fine-print">
            The tier is committed at launch and its DVN configuration is applied at expansion.
            Higher-tier messages generally cost more.
          </p>
          <div className="tag-row">
            <span className="tag">
              <i /> 1-OF-1 NEVER PERMITTED
            </span>
          </div>
        </div>
        <div className="tier-panels" role="radiogroup" aria-label="Security tier">
          {TIERS.map((item) => {
            const card = CARDS[item];
            const selected = tier === item;
            return (
              <div
                key={item}
                ref={(node) => {
                  refs.current[item] = node;
                }}
                className={cn('tier-card', selected && 'selected')}
                role="radio"
                aria-checked={selected}
                aria-label={`${TIER_COPY[item].label} tier, ${TIER_COPY[item].badge}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTier(item)}
                onKeyDown={(event) => onKeyDown(event, item)}
              >
                <div className="tier-name">{card.name}</div>
                <h3>{card.heading}</h3>
                <div className="tier-copy">{card.copy}</div>
                <ul>
                  {card.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <div className="tier-footer">{card.footer}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="container v3-dvn-demo" aria-label="Interactive design preview of DVN security tiers">
        <div className="v3-dvn-intro">
          <span>{'/// LIVE VISUALIZER · SIMULATION ONLY'}</span>
          <SplitHeading as="h3" lines={['Verification has', 'an architecture.']} />
          <p>
            Toggle the tier cards above. See the required and optional verifier structure. This
            illustration does not read any chain.
          </p>
        </div>
        <div className="v3-dvn-rig" id="v3DvnRig" data-tier={tier}>
          <div className="v3-dvn-lines" />
          <div className="v3-dvn-core">
            X<span>of</span>N<small>SECURITY POLICY</small>
          </div>
          <div className="v3-verifier v3-required v3-v1">
            01 <span>LABS</span>
          </div>
          <div className="v3-verifier v3-required v3-v2">
            02 <span>REQUIRED · TBC*</span>
          </div>
          <div className="v3-verifier v3-required v3-v3">
            03 <span>REQUIRED · TBC*</span>
          </div>
          <div className="v3-verifier v3-optional v3-v4">
            A <span>DT MMS</span>
          </div>
          <div className="v3-verifier v3-optional v3-v5">
            B <span>FCAT</span>
          </div>
          <div className="v3-dvn-code" id="v3DvnCode">
            REQUIRED: {TIER_COPY[tier].required}&nbsp;&nbsp; OPTIONAL THRESHOLD: 1/2
          </div>
        </div>
      </div>
      <div className="container note-block">
        <p className="preview-note">
          *Required operators beyond LayerZero Labs are pending a published decision and are
          checked per pathway before they are offered. A badge describes cross-chain verifier
          configuration; it is not a guarantee against market loss or all exploits.
        </p>
      </div>
    </section>
  );
}
