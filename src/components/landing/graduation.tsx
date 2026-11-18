'use client';

import { useState } from 'react';
import type { ChainInfo } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { Coin3D } from '@/components/ui/coin-3d';
import { SplitHeading } from '@/components/landing/split-heading';

interface Step {
  title: string;
  note: string;
  caption: string;
  explain: string;
}

// Lima langkah landing mengikuti lifecycle dua tahap (DESIGN_SYSTEM §5.7).
// Ini penjelasan konsep; urutan teknis ekspansi mengikuti keputusan PRD P28.
function buildSteps(home: ChainInfo): Step[] {
  return [
    {
      title: 'Bonding threshold reached',
      note: 'Anyone may call graduate()',
      caption: 'BONDING',
      explain: `Threshold is reached on the ${home.name} bonding curve. Graduation becomes callable by anyone, with a predetermined caller incentive.`,
    },
    {
      title: `${home.name} liquidity goes live`,
      note: `Create and seed the ${home.name} AMM pool`,
      caption: `${home.shortName} POOL`,
      explain: `graduate() creates and seeds the ${home.name} AMM pool using liquidity released from the bonding curve. The token is now graduated and awaiting expansion: owner and delegate are still the Graduator contract.`,
    },
    {
      title: 'Expand through LayerZero',
      note: 'expandAndLock() · deploy remote OFT · send + compose liquidity',
      caption: 'REMOTE DEPLOY',
      explain:
        'expandAndLock() deploys remote OFTs and sends liquidity across the configured LayerZero pathways. lzCompose creates and seeds each destination pool in the same compose call.',
    },
    {
      title: 'Verify every pathway',
      note: 'Pin libraries · check DVNs · retry failures',
      caption: 'PATHWAY CHECK',
      explain:
        'Each pathway must match pinned library, ULN, DVN, executor, peer and gas settings in both directions. Failed steps must be retryable with the same parameters.',
    },
    {
      title: 'Lock & publish proof',
      note: 'Owner = 0 · delegate = 0 · registry verified',
      caption: 'IMMUTABLE',
      explain:
        'Only after every chain completes do endpoint delegates and contract ownership become zero. Each registry then returns an on-chain verifiable locked result.',
    },
  ];
}

// Section 11 — skema graduation + lima langkah. Scroll menjalankan langkah lewat LandingMotion,
// yang memicu klik pada tombol `.grad-step`.
export function Graduation({ home, expansions }: { home: ChainInfo; expansions: ChainInfo[] }) {
  const [stage, setStage] = useState(0);
  const steps = buildSteps(home);
  const current = steps[stage] ?? steps[0];
  const [expA, expB] = expansions;

  return (
    <section className="section alt" id="graduation">
      <div className="container">
        <div className="sec-head">
          <div>
            <div className="section-label">GRADUATION ENGINE</div>
            <SplitHeading
              lines={[
                'Momentum meets',
                <span className="accent" key="a">
                  immutability.
                </span>,
              ]}
            />
          </div>
          <p>
            Start with a bonding curve on {home.name}. After the threshold, graduate locally. Then
            expand cross-chain, verify each pathway, and lock the configuration.
          </p>
        </div>
        <div className="grad-layout">
          <div className="grad-display">
            <div className="v3-grad-energy" aria-hidden="true" />
            <div className="v3-grad-stage" id="v3GradStage">
              {current?.caption}
            </div>
            <div className="little-label">XOFN / CROSS-CHAIN EXPANSION SCHEMATIC</div>
            <div className="grad-ring" />
            <div className="grad-center">
              <Coin3D />
              <span className="mono">XofNGraduator</span>
            </div>
            {/* Kelas posisi .base/.arb/.robin dari HTML dipertahankan; isinya mengikuti peran chain (D15). */}
            <div className="grad-node base">{home.shortName} / HOME</div>
            {expA && <div className="grad-node arb">{expA.shortName}</div>}
            {expB && <div className="grad-node robin">{expB.shortName}</div>}
            <div className="little-bottom">
              <span>REPEATABLE REMOTE STEPS</span>
              <span>ONE VERIFIED FINAL STATE</span>
            </div>
          </div>
          <div>
            <div className="v3-grad-timeline">
              <div id="v3GradFill" style={{ width: `${(stage + 1) * 20}%` }} />
            </div>
            <div className="grad-steps">
              {steps.map((step, index) => (
                <button
                  key={step.title}
                  type="button"
                  className={cn('grad-step', stage === index && 'active')}
                  data-stage={index}
                  aria-pressed={stage === index}
                  onClick={() => setStage(index)}
                >
                  <span className="count">0{index + 1}</span>
                  <span>
                    <strong>{step.title}</strong>
                    <small>{step.note}</small>
                  </span>
                  <span className="arrow">↗</span>
                </button>
              ))}
            </div>
            <div className="grad-explainer" id="stageExplain" aria-live="polite">
              {current?.explain}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
