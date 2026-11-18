import type { ChainInfo } from '@/lib/chains';
import { SplitHeading } from '@/components/landing/split-heading';

// Warna stroke ilustrasi diambil dari token lewat currentColor / variabel CSS (tanpa hex di komponen).
const MINT = 'var(--color-mint)';
const BLUE = 'var(--color-blue)';
const DIM = 'var(--color-dim)';
const MUTED = 'var(--color-muted)';
const PANEL = 'var(--color-panel-2)';

// Section 3 — tiga pembeda produk.
export function Vision({ home, expansions }: { home: ChainInfo; expansions: ChainInfo[] }) {
  const expansionNames = expansions.map((chain) => chain.name).join(' and ');
  return (
    <section className="section" id="vision">
      <div className="container">
        <div className="sec-head">
          <div>
            <div className="section-label">THE XOFN DIFFERENCE</div>
            <SplitHeading
              lines={[
                <>Don&apos;t trust.</>,
                <span className="accent" key="a">
                  Verify.
                </span>,
              ]}
            />
          </div>
          <p>
            One number changes the conversation. From invisible trust assumptions to a security
            configuration anyone can inspect.
          </p>
        </div>
        <div className="feature-grid">
          <article className="feature">
            <span className="corner">↗</span>
            <div className="art">
              <svg viewBox="0 0 150 110" fill="none">
                <path
                  d="M75 10 112 28v35c0 22-17 34-37 43C55 97 38 85 38 63V28L75 10Z"
                  stroke={MINT}
                  strokeWidth="1.4"
                  fill={MINT}
                  fillOpacity="0.04"
                />
                <path
                  d="M75 23 99 35v26c0 13-10 23-24 30-14-7-24-17-24-30V35L75 23Z"
                  stroke={BLUE}
                  opacity=".65"
                />
                <circle cx="75" cy="54" r="20" stroke={MINT} strokeDasharray="3 5" />
                <path d="m65 54 7 7 15-16" stroke={MINT} strokeWidth="3" />
                <circle cx="75" cy="54" r="35" stroke={MINT} opacity=".15" />
              </svg>
            </div>
            <h3>Security with a receipt.</h3>
            <p>
              Every tier is defined by verifier requirements. A badge you can inspect, not a claim
              you have to believe.
            </p>
          </article>
          <article className="feature">
            <span className="corner">↗</span>
            <div className="art">
              <svg viewBox="0 0 150 110" fill="none">
                <circle cx="75" cy="56" r="43" stroke={DIM} strokeDasharray="3 5" />
                <path d="M37 56h76M75 18v76" stroke={DIM} />
                <circle cx="37" cy="56" r="9" fill={PANEL} stroke={MINT} />
                <circle cx="113" cy="56" r="9" fill={PANEL} stroke={BLUE} />
                <circle cx="75" cy="18" r="9" fill={PANEL} stroke={BLUE} />
                <circle cx="75" cy="94" r="9" fill={PANEL} stroke={MINT} />
                <circle cx="75" cy="56" r="19" fill={PANEL} stroke={MINT} />
                <path d="M67 56h16m-8-8 8 8-8 8" stroke={MINT} strokeWidth="2" />
              </svg>
            </div>
            <h3>
              Omnichain by demand.<span className="planned-chip">PLANNED</span>
            </h3>
            <p>
              Begin on a {home.name} bonding curve. Expand to {expansionNames} only when graduation
              and expansion conditions are met.
            </p>
          </article>
          <article className="feature">
            <span className="corner">↗</span>
            <div className="art">
              <svg viewBox="0 0 150 110" fill="none">
                <rect x="20" y="18" width="110" height="75" rx="7" stroke={MUTED} fill={PANEL} />
                <path d="M20 35h110" stroke={DIM} />
                <circle cx="30" cy="27" r="2.2" fill="var(--color-danger)" />
                <circle cx="38" cy="27" r="2.2" fill="var(--color-caution)" />
                <circle cx="46" cy="27" r="2.2" fill="var(--color-mint-2)" />
                <path d="m36 52 10 8-10 8m18 0h15" stroke={MINT} strokeWidth="2" />
                <rect x="83" y="47" width="34" height="30" rx="4" stroke={MINT} />
                <path d="m90 61 6 6 14-14" stroke={MINT} strokeWidth="2" />
              </svg>
            </div>
            <h3>Check any OFT.</h3>
            <p>
              Inspect cross-chain verifier pathways, owner and delegate settings, even for tokens
              launched elsewhere.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
