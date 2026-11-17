'use client';

import { TIER_COPY, useTier } from '@/components/landing/tier-context';

// Section 9 — "inside the coin". Koin 3D-nya digambar lapisan galaxy; section ini hanya
// menyediakan ruang scroll, judul, dan teks yang mengikuti tier terpilih.
export function InsideCoin() {
  const { tier } = useTier();
  return (
    <section className="coin-core" id="inside" aria-labelledby="coinCoreTitle">
      <div className="coin-core-sticky">
        <div className="container coin-core-top">
          <div className="section-label">XOFN / INSIDE THE COIN</div>
          <span className="coin-core-hint">SCROLL TO OPEN · DRAG TO TURN · ILLUSTRATION ONLY</span>
        </div>
        <h2 className="container coin-core-big" id="coinCoreTitle">
          <span>
            Don&apos;t
            <br />
            trust
          </span>
          <i className="coin-core-gem" aria-hidden="true" />
          <span className="mint">Verify</span>
        </h2>
        <div className="container coin-core-row">
          <p id="coinCapA">More than one set of eyes.</p>
          <p>
            <span id="coinCoreCode" aria-live="polite">
              {TIER_COPY[tier].code}
            </span>
            <small>FOLLOWS THE TIER SELECTED BELOW · NOT A CHAIN READING</small>
          </p>
          <p id="coinCapB">
            The creator chooses a security tier when launching. No one can downgrade it later.
          </p>
        </div>
      </div>
    </section>
  );
}
