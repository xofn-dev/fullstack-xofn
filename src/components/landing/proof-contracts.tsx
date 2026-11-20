import Link from 'next/link';
import { explorerAddressUrl, type ChainInfo } from '@/lib/chains';
import { shortAddress } from '@/lib/format';
import type { HomeOnlyDeployment } from '@/lib/web3/addresses';
import { SplitHeading } from '@/components/landing/split-heading';

// Semua status di bawah mencerminkan keadaan nyata dan tidak pernah memakai centang (USER_FLOWS
// Flow I). Versi pertama berlaku selama belum ada kontrak publik yang live.
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

// Testnet live (Fase 1a): kontrak home sudah terbuka di testnet, tetapi belum ada token yang
// berekspansi, jadi belum ada verify() yang bisa ditunjukkan dan Locked tetap belum mungkin.
const INVARIANTS_TESTNET = [
  ['Contract owner is zero', 'NO TOKEN LOCKED YET'],
  ['Endpoint delegate is zero', 'NO TOKEN LOCKED YET'],
  ['DVN threshold matches tier', 'NOT VERIFIED'],
  ['Libraries and pathways pinned', 'NOT VERIFIED'],
  ['All expansion chains complete', 'NOT DEPLOYED'],
] as const;

const ROADMAP_TESTNET = [
  ['Research · DVN and pathway feasibility', 'IN REVIEW'],
  ['XofN Check · public OFT reader', 'ON TESTNET'],
  ['Curve / Graduator / Registry', 'ON TESTNET'],
  ['Independent security audit', 'REQUIRED'],
  ['Home-chain release, then expansion', 'TESTNET ONLY'],
] as const;

const MILESTONES = [
  ['VERIFY', 'DVN pathways, AMM options, liquidity pairing.', 'FEASIBILITY GATE'],
  ['CHECK', 'OFT reader and configuration comparison.', 'PUBLIC TOOL FIRST'],
  ['CURVE', 'Token, bonding curve and local graduation.', 'HOME CHAIN FIRST'],
  ['EXPAND', 'Expansion, composer and failure retries.', 'RETRYABLE STEPS'],
  ['AUDIT', 'External review of critical contracts.', 'NO OPEN HIGH / CRITICAL'],
  ['RELEASE', 'Staged rollout with published evidence.', 'ON-CHAIN EVIDENCE'],
] as const;

// Section 14 — bukti dan roadmap. `testnetLive`: launchpad home sudah dibuka di testnet.
export function Proof({ testnetLive }: { testnetLive: boolean }) {
  const invariants = testnetLive ? INVARIANTS_TESTNET : INVARIANTS;
  const roadmap = testnetLive ? ROADMAP_TESTNET : ROADMAP;
  return (
    <section className="section proof-section" id="proof">
      <div className="container">
        <div className="sec-head">
          <div>
            <div className="section-label">ON-CHAIN RECEIPTS</div>
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
              {invariants.map(([label, status]) => (
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
              {roadmap.map(([label, status]) => (
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

interface ContractRow {
  name: string;
  role: string;
  /** Alamat dari manifest; null = belum dipublikasikan. */
  address: string | null;
  /** Teks pengganti alamat untuk kontrak yang lahir per launch. */
  note?: string;
  status: string;
}

// Section 15 — tabel kontrak. Alamat hanya dari manifest deployment yang sah dan hanya setelah
// launchpad live (dorman ≠ live, PRD P52). Remote tetap PLANNED sampai chain ekspansi di-deploy.
export function Contracts({
  home,
  expansions,
  homeOnly,
}: {
  home: ChainInfo;
  expansions: ChainInfo[];
  homeOnly: HomeOnlyDeployment | null;
}) {
  const live = homeOnly?.status === 'live' ? homeOnly : null;
  const deployed = live ? 'ON TESTNET' : 'PLANNED';
  const rows: ContractRow[] = [
    {
      name: 'XofNToken',
      role: 'Fixed-supply OFT · 999M',
      address: null,
      note: live ? 'One per launch' : undefined,
      status: live ? 'PER LAUNCH' : 'PLANNED',
    },
    {
      name: 'XofNCurve',
      role: `${home.name} bonding curve`,
      address: live?.contracts.curveImplementation ?? null,
      status: deployed,
    },
    {
      name: 'XofNGraduator',
      role: 'graduate() · expandAndLock() · immutable recipe',
      address: live?.contracts.graduator ?? null,
      status: deployed,
    },
    { name: 'XofNRemote', role: 'Remote token deployment · lzCompose pooling', address: null, status: 'PLANNED' },
    {
      name: 'XofNRegistry',
      role: 'Tier registry · verify(token) on every chain',
      address: live?.contracts.registry ?? null,
      status: deployed,
    },
  ];
  const chainList = [home, ...expansions]
    .map((chain) => (chain.role === 'home' ? `${chain.name} (home)` : chain.name))
    .join(' / ');
  return (
    <section className="section tight" id="contracts">
      <div className="container">
        <div className="sec-head">
          <div>
            <div className="section-label">TRANSPARENT BY DESIGN</div>
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
            {live
              ? `Five core components, defined responsibilities. The home-chain contracts are live on ${home.name}; remote contracts appear after expansion is deployed. Unaudited.`
              : 'Five core components, defined responsibilities. Addresses and audit evidence will only appear after actual deployment and verification.'}
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
                {rows.map((row) => {
                  const url = row.address ? explorerAddressUrl(home, row.address) : null;
                  return (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.role}</td>
                      <td>
                        {!row.address ? (
                          (row.note ?? 'Not published')
                        ) : url ? (
                          <a className="mono" href={url} target="_blank" rel="noreferrer noopener" title={row.address}>
                            {shortAddress(row.address)} ↗
                          </a>
                        ) : (
                          <span className="mono">{shortAddress(row.address)}</span>
                        )}
                      </td>
                      <td className="planned">{row.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="contract-foot">
          <span className="tag warn">
            <i /> {live ? 'TESTNET · UNAUDITED' : 'NOT DEPLOYED'}
          </span>
          {live ? (
            <span className="muted mono">
              Expansion to {expansions.map((chain) => chain.name).join(' / ')} is planned.{' '}
              <Link href="/contracts">All addresses ↗</Link>
            </span>
          ) : (
            <span className="muted mono">{chainList} follow the deploy guide v1.0.</span>
          )}
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
