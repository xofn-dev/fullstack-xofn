'use client';

import { useState } from 'react';
import type { ChainInfo } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { looksLikeEvmAddress } from '@/lib/format';
import { useOverlay } from '@/components/ui/overlay-provider';
import { SplitHeading } from '@/components/landing/split-heading';
import { CHECK_SAMPLES, type CheckSampleKey } from '@/components/landing/demo-data';

const SAMPLE_KEYS = Object.keys(CHECK_SAMPLES) as CheckSampleKey[];

// Section 8 — XofN Check versi demo. Phase 1 belum punya pembaca chain (itu Phase 2),
// jadi alamat apa pun TIDAK pernah diberi hasil: hanya sampel berlabel simulasi yang tampil.
export function CheckDemo({ home, expansions }: { home: ChainInfo; expansions: ChainInfo[] }) {
  const [address, setAddress] = useState('');
  const [sampleKey, setSampleKey] = useState<CheckSampleKey>('standard');
  const [error, setError] = useState('');
  const [inspected, setInspected] = useState(false);
  const { toast } = useOverlay();
  const sample = CHECK_SAMPLES[sampleKey];

  const inspect = () => {
    const value = address.trim();
    if (value) {
      setError(
        looksLikeEvmAddress(value)
          ? 'LIVE CHECK UNAVAILABLE — This preview has no RPC connection. No security result will be fabricated for this address.'
          : 'ENTER A VALID EVM ADDRESS (0x + 40 hexadecimal characters), or choose a sample demo.',
      );
      return;
    }
    setError('');
    setInspected(true);
    toast('Sample configuration displayed. Not a live on-chain result.');
  };

  return (
    <section className="section check-section" id="check">
      <div className="container check-layout">
        <div className="check-copy">
          <div className="section-label">04 / XOFN CHECK</div>
          <SplitHeading
            lines={[
              'What does',
              <>
                your token <span className="accent">actually trust?</span>
              </>,
            ]}
          />
          <p>
            A beautiful interface is easy to fake. Cross-chain verifier configuration isn&apos;t.
            Explore how XofN Check will expose the DVN threshold, endpoint pathways, owner and
            delegate—publicly and inspectably.
          </p>
          <div className="check-perks">
            <div>
              <i>↗</i> Inspect OFTs beyond the XofN ecosystem
            </div>
            <div>
              <i>↗</i> Read required and optional DVN configuration
            </div>
            <div>
              <i>↗</i> See pathway status and config timestamps
            </div>
            <div>
              <i>↗</i> Share security findings with context
            </div>
          </div>
          <div className="stack-gap">
            <span className="tag warn">
              <i /> DEMONSTRATION DATA ONLY · NO RPC CONNECTION
            </span>
          </div>
        </div>
        <div className="terminal">
          <div className="terminal-head">
            <div className="window-dots">
              <i />
              <i />
              <i />
            </div>
            <span className="mono">XOFN_CHECK / CONFIG_INSPECTOR</span>
            <span className="tag">
              <i /> DEMO
            </span>
          </div>
          <div className="terminal-body">
            <label className="field-label" htmlFor="checkAddr">
              TOKEN CONTRACT ADDRESS
            </label>
            <div className="input-row">
              <input
                id="checkAddr"
                className="field"
                placeholder="0x... Paste an OFT address"
                autoComplete="off"
                spellCheck={false}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') inspect();
                }}
              />
              <button className="btn primary small" type="button" onClick={inspect}>
                Inspect <span className="arr">↗</span>
              </button>
            </div>
            <div className="sample-row">
              <label className="field-label" htmlFor="sampleSelect">
                RUN A SAMPLE
              </label>
              <select
                id="sampleSelect"
                className="field"
                value={sampleKey}
                onChange={(event) => {
                  setAddress('');
                  setError('');
                  setInspected(true);
                  setSampleKey(event.target.value as CheckSampleKey);
                }}
              >
                {SAMPLE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {CHECK_SAMPLES[key].label}
                  </option>
                ))}
              </select>
            </div>
            <div className={cn('checker-error', error && 'is-visible')} role="alert">
              {error}
            </div>
            <div className="check-results" aria-live="polite">
              <div className="result-main">
                <div>
                  <div className="caption">
                    {inspected ? 'SIMULATED EXAMPLE · NOT VERIFIED' : 'SIMULATED OFT CONFIGURATION'}
                  </div>
                  <h3>{sample.tier}</h3>
                  <span className="mono check-owner">{sample.owner}</span>
                </div>
                <div className={cn('big-status', sample.risk && 'danger')}>{sample.status}</div>
              </div>
              <div className="kv-grid">
                <div className="kv">
                  <small>REQUIRED DVNs</small>
                  <strong>{sample.required}</strong>
                </div>
                <div className="kv">
                  <small>OPTIONAL THRESHOLD</small>
                  <strong>{sample.optional}</strong>
                </div>
                <div className="kv">
                  <small>REQUIRED OPERATORS</small>
                  <strong>{sample.requiredNames}</strong>
                </div>
                <div className="kv">
                  <small>OPTIONAL OPERATORS</small>
                  <strong>{sample.optionalNames}</strong>
                </div>
              </div>
              <div className="pathways">
                <div className="field-label">PATHWAYS · EXAMPLE ONLY</div>
                {expansions.map((chain) => (
                  <div className="path-row" key={chain.key}>
                    <div className="lhs">
                      {home.shortName} <span>↔</span> {chain.shortName}
                    </div>
                    <div className={cn('rhs', sample.risk ? 'is-risk' : 'is-ok')}>{sample.path}</div>
                  </div>
                ))}
              </div>
              <div className="hint">
                *Illustrative verification states, not live blockchain results. Production requires
                endpoint.getConfig, owner/delegate and pathway checks.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
