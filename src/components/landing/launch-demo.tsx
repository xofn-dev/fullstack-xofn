'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { ChainInfo } from '@/lib/chains';
import { formatInt, isValidTicker } from '@/lib/format';
import type { ChainKey, Tier } from '@/types/enums';
import { TIERS } from '@/types/enums';
import { useOverlay } from '@/components/ui/overlay-provider';
import { SplitHeading } from '@/components/landing/split-heading';
import { TIER_COPY, useTier } from '@/components/landing/tier-context';

const FIXED_SUPPLY = 999_000_000;
const MAX_LOGO_BYTES = 3_000_000;

// Section 12 — form launch versi pratinjau (D8). Tidak ada transaksi, wallet, atau unggahan:
// gambar hanya dipratinjau lokal lewat object URL.
export function LaunchDemo({ home, expansions }: { home: ChainInfo; expansions: ChainInfo[] }) {
  const { tier, setTier } = useTier();
  const { openModal, toast } = useOverlay();
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

  const onLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > MAX_LOGO_BYTES) {
      toast('Please use an image smaller than 3 MB.');
      event.target.value = '';
      return;
    }
    setLogoUrl(URL.createObjectURL(file));
  };

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
            wallet or collect funds.
          </p>
        </div>
        <form className="launch-form" id="launchForm" noValidate onSubmit={onSubmit}>
          <div className="form-header">
            <h3>Create a launch</h3>
            <span className="tag warn">
              <i /> PREVIEW
            </span>
          </div>
          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="tokenName">
                TOKEN NAME
              </label>
              <input
                className="form-control"
                id="tokenName"
                maxLength={32}
                placeholder="e.g. Your Protocol"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="tokenTicker">
                TICKER
              </label>
              <input
                className="form-control"
                id="tokenTicker"
                maxLength={12}
                placeholder="e.g. YOUR"
                value={ticker}
                onChange={(event) => setTicker(event.target.value.toUpperCase())}
              />
            </div>
          </div>
          <div className="form-row is-centered">
            <div>
              <span className="field-label">TOKEN LOGO</span>
              <div className="upload-wrap">
                <div className="upload-preview" id="uploadPreview">
                  {/* Pratinjau lokal dari object URL; next/image tidak berlaku untuk blob. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logoUrl ? <img src={logoUrl} alt="Selected token logo preview" /> : '✳'}
                </div>
                <label className="upload-label" htmlFor="tokenLogo">
                  Choose image
                  <br />
                  <small>Local preview only</small>
                </label>
                <input type="file" id="tokenLogo" accept="image/*" hidden onChange={onLogo} />
              </div>
            </div>
            <div>
              <span className="field-label">SUPPLY / HOME CHAIN</span>
              <div className="supply-readout">
                {formatInt(FIXED_SUPPLY)} FIXED
                <br />
                <span>{home.shortName} · EVM</span>
              </div>
            </div>
          </div>
          <div className="form-group">
            <div className="field-label" id="launchTierLabel">
              SECURITY TIER
            </div>
            <div className="choose-tier" role="radiogroup" aria-labelledby="launchTierLabel">
              {TIERS.map((item: Tier) => (
                <label key={item}>
                  <input
                    type="radio"
                    name="launchTier"
                    value={item}
                    checked={tier === item}
                    onChange={() => setTier(item)}
                  />
                  <strong>{TIER_COPY[item].label}</strong>
                  <small>{TIER_COPY[item].badge}</small>
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <div className="field-label">EXPANSION NETWORKS · APPLIED AT EXPANSION · PLANNED</div>
            <div className="check-group">
              {expansions.map((chain) => (
                <label key={chain.key}>
                  <input
                    type="checkbox"
                    name="expand"
                    value={chain.key}
                    checked={selected.includes(chain.key)}
                    onChange={() => toggleChain(chain.key)}
                  />{' '}
                  {chain.name}
                </label>
              ))}
            </div>
          </div>
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
