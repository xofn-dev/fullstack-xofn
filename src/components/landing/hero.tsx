import type { ChainInfo } from '@/lib/chains';
import { formatInt } from '@/lib/format';
import { HeroCanvas } from '@/components/landing/scene-loaders';

const FIXED_SUPPLY = 999_000_000;

// Section 1. Chip chain mengikuti peran dari registry (D15): home = Robinhood, ekspansi = Base & Arbitrum.
export function Hero({ home, expansions }: { home: ChainInfo; expansions: ChainInfo[] }) {
  const [expA, expB] = expansions;
  return (
    <section className="hero">
      <HeroCanvas />
      <div className="container hero-inner">
        <div className="hero-copy">
          <div className="top-rule">
            <span className="eyebrow">SECURITY IS A CONFIGURATION. NOT A PROMISE.</span>
          </div>
          <div className="v3-hero-coordinate">
            XOFN / PROTOCOL PREVIEW <span>● NOT LIVE</span>
          </div>
          <h1>
            <span>NEVER</span>
            <span className="outline">ONE OF</span>
            <span className="mint">
              ONE<span className="hero-dot">.</span>
            </span>
          </h1>
          <p className="hero-desc">
            If a token crosses chains, its security shouldn&apos;t be a mystery. Launch with
            measurable verification. Graduate on proof, not promises.
          </p>
          <div className="hero-actions">
            <a className="btn primary" href="#check">
              Explore XofN Check <span className="arr">↗</span>
            </a>
            <a className="btn secondary" href="#explore">
              Discover Launches <span className="arr">→</span>
            </a>
          </div>
          <div className="hero-foot">
            <div>
              <strong>2+ REQUIRED</strong>
              <small>DVN verification target</small>
            </div>
            <div>
              <strong>{formatInt(FIXED_SUPPLY)}</strong>
              <small>Fixed supply / launch</small>
            </div>
            <div>
              <strong>ZERO 1-OF-1</strong>
              <small>Permitted by design</small>
            </div>
          </div>
        </div>
        <div
          className="hero-visual"
          id="v3HeroVisual"
          aria-label="Animated 3D illustration: tokens roll through the XofN verification gate"
        >
          <div className="coin-fallback" aria-hidden="true">
            <i className="cf-track cf-track-a" />
            <span className="cf-coin cf-coin-a">X</span>
            <span className="cf-gate">
              <b />
            </span>
            <span className="cf-coin cf-coin-b" />
            <i className="cf-track cf-track-b" />
          </div>
          <div className="hero-float f1">
            <div className="label">HOME CHAIN · MVP</div>
            <strong>
              <span className="symbol tone-mint" /> {home.shortName}
            </strong>
          </div>
          {expA && (
            <div className="hero-float f2">
              <div className="label">EXPANSION · PLANNED</div>
              <strong>
                <span className="symbol tone-blue" /> {expA.shortName}
              </strong>
            </div>
          )}
          {expB && (
            <div className="hero-float f3">
              <div className="label">EXPANSION · PLANNED</div>
              <strong>
                <span className="symbol tone-violet" /> {expB.shortName}
              </strong>
            </div>
          )}
          <div className="hero-float f4">
            <div className="label">SECURITY POLICY</div>
            <strong>
              <span className="symbol tone-mint" /> 1-of-1 BLOCKED
            </strong>
          </div>
          <div className="hero-visual-caption">3D COIN VERIFICATION FLOW · ILLUSTRATION</div>
        </div>
      </div>
    </section>
  );
}
