'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import type { ChainInfo } from '@/lib/chains';
import { formatInt, isValidTicker } from '@/lib/format';
import type { ChainKey } from '@/types/enums';
import { useOverlay } from '@/components/ui/overlay-provider';
import { FIXED_SUPPLY, LaunchFields } from '@/components/launch/launch-fields';
import { SplitHeading } from '@/components/landing/split-heading';
import { TIER_COPY, useTier } from '@/components/landing/tier-context';

// Section 12 — form launch versi pratinjau (D8). Tidak ada transaksi, wallet, atau unggahan:
// gambar hanya dipratinjau lokal lewat object URL.
export function LaunchDemo({ home, expansions }: { home: ChainInfo; expansions: ChainInfo[] }) {
  const { tier, setTier } = useTier();
  const { openModal } = useOverlay();
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<ChainKey[]>(() => expansions.map((chain) => chain.key));
  const [error, setError] = useState('');

  // Object URL dilepas saat diganti atau saat komponen dilepas, supaya tidak bocor.
  useEffect(
    () => () => {
      if (logoUrl) URL.revokeObjectURL(logoUrl);
    },
    [logoUrl],
  );

  const toggleChain = (key: ChainKey) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanTicker = ticker.trim();
    if (!cleanName || !cleanTicker) {
      setError('Enter both token name and ticker to preview the configuration.');
      return;
    }
    if (!isValidTicker(cleanTicker)) {
      setError('Ticker should contain 2–12 letters or numbers.');
      return;
    }
    if (selected.length === 0) {
      setError('Choose at least one proposed expansion chain.');
      return;
    }
    setError('');
    const networks = expansions
      .filter((chain) => selected.includes(chain.key))
      .map((chain) => chain.name)
      .join(', ');
    openModal({
      eyebrow: 'LAUNCH DRAFT / NO TRANSACTION',
      title: 'Launch configuration preview',
      copy: 'Your token configuration is ready for review. No blockchain deployment or fee payment has been initiated.',
      detail: [
        `Token: ${cleanName} ($${cleanTicker.toUpperCase()})`,
        `Home: ${home.name}`,
        `Supply: ${formatInt(FIXED_SUPPLY)} fixed`,
        `Security: ${TIER_COPY[tier].label} (${TIER_COPY[tier].badge})`,
        `Expansion (applied later, at expansion): ${networks}`,
        'Graduation threshold: To be defined by owner',
        'Message / gas cost: Not quoted',
        'Network DVN readiness: Must be validated',
      ].join('\n'),
    });
  };

  return (
    <section className="section launch-section" id="launch">
      <div className="container launch-layout">
        <div className="launch-intro">
          <div className="section-label">07 / CREATE A TOKEN</div>
          <SplitHeading
            className="h2"
            lines={[
              'Build a token.',
              <span className="accent" key="a">
                Set the standard.
              </span>,
            ]}
          />
          <p>
            Create once on {home.name} with fixed supply and a verifiable security tier. When the
            market reaches the defined threshold, the token graduates on {home.name}. Expansion and
            locking are a separate step.
          </p>
          <div className="steps-mini">
            <div>
              <i>01</i> Define identity and token metadata
            </div>
            <div>
              <i>02</i> Choose Standard or Fortress
            </div>
            <div>
              <i>03</i> Select supported expansion networks
            </div>
            <div>
              <i>04</i> Review fees and sign on {home.name}
            </div>
          </div>
          <p className="preview-note">
            This builder is an interactive preview form. It does not deploy a contract, connect a
            wallet or collect funds. <Link href="/launch">Open the launch page ↗</Link>
          </p>
        </div>
        <form className="launch-form" id="launchForm" noValidate onSubmit={onSubmit}>
          <div className="form-header">
            <h3>Create a launch</h3>
            <span className="tag warn">
              <i /> PREVIEW
            </span>
          </div>
          <LaunchFields
            idPrefix="demoLaunch"
            home={home}
            expansions={expansions}
            name={name}
            onName={setName}
            ticker={ticker}
            onTicker={setTicker}
            logoUrl={logoUrl}
            onLogo={(file) => setLogoUrl(URL.createObjectURL(file))}
            logoNote="Local preview only"
            tier={tier}
            onTier={setTier}
            selected={selected}
            onToggleChain={toggleChain}
            networksLabel="EXPANSION NETWORKS · APPLIED AT EXPANSION · PLANNED"
          />
          <div className="form-note">
            <span>
              MESSAGE / EXPANSION COST
              <br />
              <small>Requires live LayerZero quotes</small>
            </span>
            <strong>NOT QUOTED</strong>
          </div>
          <button className="btn primary form-submit" type="submit">
            Review launch configuration <span className="arr">↗</span>
          </button>
          <div id="launchError" className="error-msg" aria-live="polite">
            {error}
          </div>
        </form>
      </div>
    </section>
  );
}
