'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ChainInfo } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/client/use-reduced-motion';
import { ARCH_MODES, ARCH_STATIONS, type ArchMode, type ArchStation } from '@/types/enums';
import { SplitHeading } from '@/components/landing/split-heading';
import { ArchStageScene } from '@/components/landing/scene-loaders';
import { useTier } from '@/components/landing/tier-context';

const TOUR_INTERVAL_MS = 2100;

const MODE_LABELS: Record<ArchMode, string> = {
  run: 'COIN RUN',
  overview: 'OVERVIEW',
  xray: 'X-RAY',
};

interface StationCopy {
  idx: string;
  /** Baris kecil di pod. */
  podId: string;
  podTitle: string;
  podNote: string;
  /** Modul blueprint (fallback tanpa WebGL). */
  blueprintId: string;
  blueprintNote: string;
  pill: string;
  ariaLabel: string;
  name: string;
  description: string;
  below?: boolean;
}

// Teks inspector ditulis ulang mengikuti lifecycle dua tahap dan peran chain baru (D15).
function buildStations(home: ChainInfo, expA: ChainInfo, expB: ChainInfo): Record<ArchStation, StationCopy> {
  return {
    home: {
      idx: '01',
      podId: '01 / ORIGIN',
      podTitle: home.shortName,
      podNote: 'HOME · CURVE',
      blueprintId: '01 / GENESIS',
      blueprintNote: 'BONDING CURVE',
      pill: `01 ${home.shortName}`,
      ariaLabel: `Explore ${home.name}`,
      name: `${home.name} / Bonding curve & local graduation`,
      description: `Every XofN token starts on ${home.name} as an OFT with a fixed 999,000,000 supply. During bonding the Graduator contract holds ownership. When the curve reaches its threshold, graduate() creates the ${home.name} pool. The token is then graduated and awaiting expansion; it is not locked yet.`,
      below: true,
    },
    core: {
      idx: '02',
      podId: '02 / TRIGGER',
      podTitle: 'GRADUATOR',
      podNote: 'IMMUTABLE RECIPE',
      blueprintId: '02 / TRIGGER',
      blueprintNote: 'IMMUTABLE RECIPE',
      pill: '02 CORE',
      ariaLabel: 'Explore XofN Graduator',
      name: 'XofN Graduator',
      description:
        'The immutable recipe engine. graduate() handles the local graduation. expandAndLock() then coordinates remote OFT deployment, cross-chain liquidity, security configuration and final locking. It stays owner and delegate of the token until expansion completes. This is the most security-sensitive contract.',
    },
    dvn: {
      idx: '03',
      podId: '03 / SECURITY',
      podTitle: 'DVN NETWORK',
      podNote: 'REQUIRED + OPTIONAL',
      blueprintId: '03 / SECURITY',
      blueprintNote: 'PATHWAY QUORUM',
      pill: '03 DVNs',
      ariaLabel: 'Explore security DVN network',
      name: 'Independent DVN Verification',
      description:
        'Standard requires two DVNs plus one of two optional operators. Fortress requires three plus one of two optional. The tier is committed at launch and applied at expansion. Specific operators are published per pathway before they are offered.',
    },
    expA: {
      idx: '04',
      podId: '04 / REMOTE',
      podTitle: expA.shortName,
      podNote: 'DEPLOY · POOL',
      blueprintId: '04 / EXPANSION',
      blueprintNote: 'REMOTE + POOL',
      pill: `04 ${expA.shortName}`,
      ariaLabel: `Explore ${expA.name}`,
      name: `${expA.name} / Expansion`,
      description: `During expansion, LayerZero messages deploy a remote OFT on ${expA.name}. A send + lzCompose flow is designed to create and fund the ${expA.name} liquidity pool in one call. Failed steps must remain retryable.`,
    },
    expB: {
      idx: '05',
      podId: '05 / REMOTE',
      podTitle: expB.shortName,
      podNote: 'DEPLOY · POOL',
      blueprintId: '05 / EXPANSION',
      blueprintNote: 'REMOTE + POOL',
      pill: `05 ${expB.shortName}`,
      ariaLabel: `Explore ${expB.name}`,
      name: `${expB.name} / Expansion`,
      description: `The second expansion pathway from ${home.name}. Every pathway runs through the home chain. Fortress is not offered on a pathway that cannot meet its verifier requirement, and a tier is never downgraded silently.`,
      below: true,
    },
    registry: {
      idx: '06',
      podId: '06 / PROOF',
      podTitle: 'REGISTRY',
      podNote: 'VERIFY() · LOCK',
      blueprintId: '06 / FINALITY',
      blueprintNote: 'VERIFY + LOCK',
      pill: '06 PROOF',
      ariaLabel: 'Explore security Registry',
      name: 'XofN Registry / Proof',
      description:
        'A registry on every chain exposes verify(token). A token is only shown as Locked after owner and delegate are zero and the pinned configuration matches the tier on every chain. Until then verify() returns false.',
    },
  };
}

// Section 5 — satu koin melewati enam stasiun; tiga mode kamera; tur otomatis.
export function Architecture({ home, expansions }: { home: ChainInfo; expansions: ChainInfo[] }) {
  const [expA, expB] = expansions;
  const { tier } = useTier();
  const [active, setActive] = useState<ArchStation>('core');
  const [mode, setMode] = useState<ArchMode>('run');
  const [touring, setTouring] = useState(false);
  const [has3d, setHas3d] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const tourTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTour = useCallback(() => {
    if (tourTimer.current) clearInterval(tourTimer.current);
    tourTimer.current = null;
    setTouring(false);
  }, []);

  useEffect(() => () => stopTour(), [stopTour]);

  // `has-3d` ditulis lewat classList, bukan className: LandingMotion menaruh kelas `fx-hold`
  // di shell ini, dan perubahan prop className akan menghapusnya.
  useEffect(() => {
    shellRef.current?.classList.toggle('has-3d', has3d);
  }, [has3d]);

  // Sorotan pointer pada stage (pointer fine saja).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || prefersReducedMotion() || !window.matchMedia('(pointer:fine)').matches) return;
    const onMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      stage.style.setProperty('--archX', `${(x * 100).toFixed(1)}%`);
      stage.style.setProperty('--archY', `${(y * 100).toFixed(1)}%`);
      stage.style.setProperty('--archRX', `${(0.5 - y) * 7}deg`);
      stage.style.setProperty('--archRY', `${(x - 0.5) * 9}deg`);
    };
    const onLeave = () => {
      stage.style.setProperty('--archRX', '0deg');
      stage.style.setProperty('--archRY', '0deg');
      stage.style.setProperty('--archX', '50%');
      stage.style.setProperty('--archY', '50%');
    };
    stage.addEventListener('pointermove', onMove, { passive: true });
    stage.addEventListener('pointerleave', onLeave);
    return () => {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  if (!expA || !expB) return null;
  const stations = buildStations(home, expA, expB);
  const current = stations[active];

  const choose = (station: ArchStation) => {
    stopTour();
    setActive(station);
  };

  const toggleTour = () => {
    if (touring) {
      stopTour();
      return;
    }
    let index = 0;
    setActive(ARCH_STATIONS[0]);
    setTouring(true);
    tourTimer.current = setInterval(() => {
      index = (index + 1) % ARCH_STATIONS.length;
      const next = ARCH_STATIONS[index];
      if (next) setActive(next);
    }, TOUR_INTERVAL_MS);
  };

  return (
    <section className="section architecture-section" id="architecture" aria-labelledby="architectureTitle">
      <div className="architecture-backdrop" aria-hidden="true">
        <div className="arch-grid" />
        <div className="arch-aurora" />
      </div>
      <div className="container">
        <div className="sec-head arch-heading">
          <div>
            <div className="section-label">02 / PROTOCOL ARCHITECTURE · INTERACTIVE</div>
            <SplitHeading
              id="architectureTitle"
              lines={[
                'See the invisible.',
                <span className="accent arch-shimmer" key="a">
                  Architect the trust.
                </span>,
              ]}
            />
          </div>
          <p>
            One token begins on {home.name}. When demand is proven, it graduates locally. Expansion
            then prepares liquidity across pathways, verifies the security recipe, and locks the
            configuration.{' '}
            <strong>
              Follow one coin through the whole pipeline. Switch between three camera modes, choose
              a station, or run the tour.
            </strong>
          </p>
        </div>
        <div className="architecture-shell" id="architectureShell" ref={shellRef}>
          <div className="arch-top">
            <span>
              <i className="signal-led" /> XOFN / COIN RUN
            </span>
            <div className="v3-modes" role="group" aria-label="Architecture visual modes">
              {ARCH_MODES.map((item, index) => (
                <button
                  key={item}
                  type="button"
                  className={cn('v3-mode', mode === item && 'active')}
                  aria-pressed={mode === item}
                  onClick={() => setMode(item)}
                >
                  <span>0{index + 1}</span> {MODE_LABELS[item]}
                </button>
              ))}
            </div>
            <span className="arch-top-right">
              THREE CAMERA MODES · PREVIEW <b>●</b>
            </span>
          </div>
          <div
            className={cn('arch-stage v3-stage', has3d && 'webgl-on')}
            id="archStage"
            ref={stageRef}
            data-active={active}
            data-mode={mode}
          >
            <div className="v3-stage-light" id="archLight" />
            <ArchStageScene active={active} mode={mode} tier={tier} onReady={setHas3d} />
            <div className="coin-hotspots" id="archHotspots">
              {ARCH_STATIONS.map((station) => {
                const copy = stations[station];
                return (
                  <button
                    key={station}
                    type="button"
                    className={cn(
                      'v3-pod coin-pod',
                      copy.below && 'pod-below',
                      active === station && 'active',
                    )}
                    data-arch={station}
                    aria-label={copy.ariaLabel}
                    aria-pressed={active === station}
                    onClick={() => choose(station)}
                  >
                    <span className="pod-id">{copy.podId}</span>
                    <strong>{copy.podTitle}</strong>
                    <small>{copy.podNote}</small>
                    <i />
                  </button>
                );
              })}
            </div>
            <div className="v3-scene-left coin-scene-label">
              XOFN : COIN RUN <span>0{ARCH_MODES.indexOf(mode) + 1} / 03</span>
            </div>
            <div className="v3-scene-right coin-scene-label">
              INTERACTIVE PROTOCOL PREVIEW&nbsp; / &nbsp; NOT LIVE
            </div>
            <div
              className="v3-view v3-blueprint active"
              id="v3Blueprint"
              aria-label="Blueprint model of XofN graduation and expansion"
            >
              <div className="v3-blueprint-head">
                <span>{'// XOFN / PROTOCOL BLUEPRINT'}</span>
                <span>SPECIFICATION / 001</span>
              </div>
              <div className="v3-blueprint-watermark" aria-hidden="true">
                X / N
              </div>
              <div className="v3-blueprint-track">
                {ARCH_STATIONS.map((station, index) => {
                  const copy = stations[station];
                  return (
                    <button
                      key={station}
                      type="button"
                      data-arch={station}
                      className={cn('v3-blueprint-module', active === station && 'active')}
                      style={{ '--n': index } as CSSProperties}
                      aria-pressed={active === station}
                      onClick={() => choose(station)}
                    >
                      <span>{copy.blueprintId}</span>
                      <b>{copy.podTitle}</b>
                      <small>{copy.blueprintNote}</small>
                      <i>{station === 'registry' ? '✓' : '↗'}</i>
                    </button>
                  );
                })}
              </div>
              <div className="v3-blueprint-bottom">
                <span>CONFIGURATION: 2+1/2 / 3+1/2</span>
                <span>ALL ROUTES REQUIRE VERIFICATION</span>
                <span>01-OF-01: DISALLOWED</span>
              </div>
            </div>
          </div>
          <div className="arch-controlbar">
            <div className="arch-discovery" aria-live="polite">
              <div className="arch-inspector-top">
                <span>NODE / {current.idx}</span>
                <span>
                  <i className="livepulse" /> INTERACTIVE REFERENCE
                </span>
              </div>
              <h3>{current.name}</h3>
              <p>{current.description}</p>
            </div>
            <div className="arch-controls">
              <div className="arch-control-label">EXPLORE SYSTEM</div>
              <div className="arch-pills" id="archPills">
                {ARCH_STATIONS.map((station) => (
                  <button
                    key={station}
                    type="button"
                    data-arch={station}
                    className={cn(active === station && 'active')}
                    aria-pressed={active === station}
                    onClick={() => choose(station)}
                  >
                    {stations[station].pill}
                  </button>
                ))}
              </div>
              <button type="button" className="arch-tour" aria-pressed={touring} onClick={toggleTour}>
                {touring ? '❚❚ Pause tour' : '▶ Run architecture tour'}
              </button>
              <div className="arch-footnote">
                Routes, validators, and flows shown for visual explanation only. Nothing here is a
                live chain reading.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
