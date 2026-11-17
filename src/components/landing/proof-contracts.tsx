import type { ChainInfo } from '@/lib/chains';
import { SplitHeading } from '@/components/landing/split-heading';

// Semua status di bawah mencerminkan keadaan nyata: belum ada kontrak yang ter-deploy,
// jadi tidak ada centang (USER_FLOWS Flow I).
const INVARIANTS = [
  ['Contract owner is zero', 'NOT DEPLOYED'],
  ['Endpoint delegate is zero', 'NOT DEPLOYED'],
  ['DVN threshold matches tier', 'NOT VERIFIED'],
  ['Libraries and pathways pinned', 'NOT VERIFIED'],
  ['All expansion chains complete', 'NOT VERIFIED'],
] as const;

const ROADMAP = [
  ['Research · DVN and pathway feasibility', 'IN REVIEW'],
  ['XofN Check · public OFT reader', 'PLANNED'],
  ['Curve / Graduator / Registry', 'PLANNED'],
  ['Independent security audit', 'REQUIRED'],
  ['Home-chain release, then expansion', 'NOT LIVE'],
] as const;

const MILESTONES = [
  ['VERIFY', 'DVN pathways, AMM options, liquidity pairing.', 'FEASIBILITY GATE'],
  ['CHECK', 'OFT reader and configuration comparison.', 'PUBLIC TOOL FIRST'],
  ['CURVE', 'Token, bonding curve and local graduation.', 'HOME CHAIN FIRST'],
  ['EXPAND', 'Expansion, composer and failure retries.', 'RETRYABLE STEPS'],
  ['AUDIT', 'External review of critical contracts.', 'NO OPEN HIGH / CRITICAL'],
  ['RELEASE', 'Staged rollout with published evidence.', 'ON-CHAIN EVIDENCE'],
] as const;

// Section 14 — bukti dan roadmap.
export function Proof() {
  return (
    <section className="section proof-section" id="proof">
      <div className="container">
        <div className="sec-head">
          <div>
            <div className="section-label">09 / ON-CHAIN RECEIPTS</div>
            <SplitHeading
              lines={[
                'Proof, not',
                <span className="accent" key="a">
                  promises.
                </span>,
              ]}
            />
          </div>
          <p>
            Trust should be inspectable. Every claim of a locked token must be backed by real
            contract state and verifiable explorer links.
          </p>
        </div>
        <div className="proof-layout">
          <article className="proof-card">
            <div className="eyebrow">REGISTRY VERIFY / TARGET INVARIANTS</div>
            <h3>Immutable means verifiable.</h3>
            <p>
              XofNRegistry is intended to expose a public `verify(token)` function on every chain.
              These checks must all pass before displaying a locked state.
            </p>
            <div className="proof-checks">
              {INVARIANTS.map(([label, status]) => (
                <div className="proof-check" key={label}>
                  <span>{label}</span>
                  <b>{status}</b>
                </div>
              ))}
            </div>
          </article>
          <article className="proof-card">
            <div className="eyebrow">ROADMAP / EVIDENCE-DRIVEN</div>
            <h3>Ship with receipts.</h3>
            <p>
              Development milestones are gated by testing and published evidence, not marketing
              timelines.
            </p>
            <div className="proof-checks">
              {ROADMAP.map(([label, status]) => (
                <div className="proof-check" key={label}>
                  <span>{label}</span>
                  <b>{status}</b>
                </div>
              ))}
            </div>
          </article>
        </div>
        <div className="milestone-list">
          {MILESTONES.map(([title, copy, gate], index) => (
            <div className="milestone" key={title}>
              <strong>
                0{index + 1} / {title}
              </strong>
              <p>{copy}</p>
              <small>{gate}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Section 15 — tabel kontrak. Alamat baru muncul setelah ada manifest deployment yang sah.
export function Contracts({ home, expansions }: { home: ChainInfo; expansions: ChainInfo[] }) {
  const rows = [
    ['XofNToken', 'Fixed-supply OFT · 999M'],
    ['XofNCurve', `${home.name} bonding curve`],
    ['XofNGraduator', 'graduate() · expandAndLock() · immutable recipe'],
    ['XofNRemote', 'Remote token deployment · lzCompose pooling'],
    ['XofNRegistry', 'Tier registry · verify(token) on every chain'],
  ] as const;
  const chainList = [home, ...expansions]
    .map((chain) => (chain.role === 'home' ? `${chain.name} (home)` : chain.name))
    .join(' / ');
  return (
    <section className="section tight" id="contracts">
      <div className="container">
        <div className="sec-head">
          <div>
            <div className="section-label">10 / TRANSPARENT BY DESIGN</div>
            <SplitHeading
              lines={[
                'Meet the',
                <span className="accent" key="a">
                  contracts.
                </span>,
              ]}
            />
          </div>
          <p>
            Five core components, defined responsibilities. Addresses and audit evidence will only
            appear after actual deployment and verification.
          </p>
        </div>
        <div className="contract-table-wrap">
          <div className="table-scroll">
            <table className="contract-table">
              <thead>
                <tr>
                  <th>CONTRACT</th>
                  <th>ROLE</th>
                  <th>PUBLIC ADDRESS</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([name, role]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{role}</td>
                    <td>Not published</td>
                    <td className="planned">PLANNED</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="contract-foot">
          <span className="tag warn">
            <i /> NOT DEPLOYED
          </span>
          <span className="muted mono">{chainList} follow the deploy guide v1.0.</span>
        </div>
      </div>
    </section>
  );
}

// Section 16 — CTA penutup.
export function ClosingCta() {
  return (
    <section className="footer-top">
      <div className="container">
        <div className="section-label">BUILT FOR PROOF</div>
        <h2>
          THE FUTURE
          <br />
          IS <span className="accent">VERIFIABLE.</span>
        </h2>
        <p>
          Not another token with a promise. A launchpad with security rules designed to be
          measured, inspected, and enforced on-chain.
        </p>
        <div className="cta-actions">
          <a className="btn primary" href="#check">
            Inspect the preview <span className="arr">↗</span>
          </a>
          <a className="btn secondary" href="#launch">
            Explore token launch <span className="arr">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
