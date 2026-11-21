import type { Metadata } from 'next';
import { currentBuildNote } from '@/lib/web3/app-mode';
import { AppBackdrop } from '@/components/landing/scene-loaders';
import { AppMotion } from '@/components/layout/app-motion';
import { getExpansionChains, getHomeChain } from '@/lib/chains';
import { publicEnv } from '@/lib/public-env';
import { getHomeOnlyDeployment, getManifestState } from '@/lib/web3/addresses';

export const metadata: Metadata = {
  title: 'Proof',
  description: `What verify() checks, what is not proven yet, and where the evidence lives. ${currentBuildNote()}`,
};

// Yang diperiksa `XofNRegistry.verify(token)` untuk setiap chain token (kontrak Phase 3).
const INVARIANTS = [
  'Token owner is the zero address',
  'Endpoint delegate is the zero address',
  'Send and receive libraries are set explicitly, not left on the default',
  'No receive-library timeout is pending',
  'A peer is set for every chain of the token',
  'DVN, executor and enforced-options configuration matches the committed tier',
] as const;

// Folder bukti di repo (`proof/`). Daftar ditulis tangan: satu baris konteks per folder.
const EVIDENCE = [
  ['proof/2026-11-17-phase0', 'Read-only research: EIDs, DVNs per pathway, ULN semantics'],
  ['proof/2026-11-17-phase1', 'Web foundation and landing port in preview mode'],
  ['proof/2026-11-17-phase2', 'XofN Check: read-only OFT reader, cache, share card'],
  ['proof/2026-11-17-phase3', 'Contracts and local tests. Open review finding recorded'],
  ['proof/2026-11-17-phase4', 'Application pages against a local test node'],
  ['proof/2026-11-19-phase3-uniswap-v4', 'Pools moved to Uniswap v4 with a guard hook; independent review'],
  ['proof/2026-11-19-phase6-1a', 'Home-chain deploy on testnet, then go-live through the Safe'],
] as const;

// "/proof" — USER_FLOWS Flow I. Yang belum terpenuhi ditulis PLANNED / NOT DEPLOYED, tanpa centang.
export default function ProofPage() {
  const network = publicEnv.network;
  const home = getHomeChain(network);
  // Milestone memakai nama chain mainnet dari registry, supaya di build testnet tidak terbaca
  // "Robinhood Chain Testnet testnet".
  const homeBase = getHomeChain('mainnet').name;
  const expansions = getExpansionChains('mainnet').map((chain) => chain.name).join(' and ');
  const local = getManifestState(network) === 'local';
  // Fase 1a live: launchpad home terbuka di testnet (Safe memanggil setRegistrar).
  const testnetLive = network === 'testnet' && getHomeOnlyDeployment(network)?.status === 'live';
  const milestones = [
    ['1a', `${homeBase} testnet`, testnetLive ? '● LIVE ON TESTNET · UNAUDITED' : '○ PLANNED'],
    ['1b', `${homeBase} mainnet + public XofN Check`, '○ PLANNED'],
    ['2a', `Expansion to ${expansions} on testnet`, '○ PLANNED'],
    ['2b', `Expansion to ${expansions} on mainnet`, '○ PLANNED'],
  ] as const;
  const invariantStatus = local
    ? '○ CHECKED ON LOCAL TEST NODE ONLY'
    : testnetLive
      ? '○ NOT SHOWN YET · NO TOKEN HAS EXPANDED'
      : '○ NOT DEPLOYED';

  return (
    <>
      <AppBackdrop />
      <main className="app-page" id="top">
        <div className="container">
          <AppMotion />
          <div className="app-head rise">
            <div className="section-label">PROOF</div>
            <h1>
              Graduate on proof, <span className="accent">not promises.</span>
            </h1>
            <p>
              This page lists what the Registry checks, what has been shown so far and what has not.{' '}
              {testnetLive
                ? `The home-chain contracts are live on ${home.name}. Nothing has expanded yet, so no token is Locked.`
                : 'Nothing below is deployed to a public network.'}
            </p>
          </div>
          <div className="app-stack">
            <div className="app-panel rise" style={{ '--i': 1 } as React.CSSProperties} data-reveal="">
              <h2>What verify() checks on each chain</h2>
              <ul className="proof-list">
                {INVARIANTS.map((item) => (
                  <li key={item}>
                    <b>{item}</b>
                    <span>{invariantStatus}</span>
                  </li>
                ))}
              </ul>
              <p className="step-note">
                A token is shown as Locked only when verify() is true on the Registry of every chain
                it lives on. Before expansion completes, verify() is false by design.
              </p>
            </div>
            <div className="app-panel rise" style={{ '--i': 2 } as React.CSSProperties} data-reveal="">
              <h2>Milestones</h2>
              <ul className="proof-list">
                {milestones.map(([id, label, status]) => (
                  <li key={id}>
                    <b>
                      {id} · {label}
                    </b>
                    <span>{status}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="app-panel rise" style={{ '--i': 3 } as React.CSSProperties} data-reveal="">
              <h2>Limits stated plainly</h2>
              <ul className="proof-list">
                <li>
                  <b>Contracts are unaudited</b>
                  <span>
                    Pool seeding was rewritten for Uniswap v4 and reviewed independently. No external
                    audit has been done yet.
                  </span>
                </li>
                <li>
                  <b>Infrastructure pathway</b>
                  <span>
                    Its peers can be set only once, but its delegate can still change the DVNs of the
                    Graduator to Remote pathway. That affects tokens that are not locked yet.
                  </span>
                </li>
                <li>
                  <b>No single on-chain &quot;global&quot; status</b>
                  <span>Each chain has its own Registry. The interface combines their verify() reads.</span>
                </li>
                <li>
                  <b>Expansion is all-or-nothing</b>
                  <span>If one chain can never complete, the token never becomes Locked.</span>
                </li>
                <li>
                  <b>Badges describe configuration</b>
                  <span>They do not guarantee returns or remove risk.</span>
                </li>
              </ul>
            </div>
            <div className="app-panel rise" style={{ '--i': 4 } as React.CSSProperties} data-reveal="">
              <h2>Evidence folders in the repository</h2>
              <ul className="proof-list">
                {EVIDENCE.map(([path, note]) => (
                  <li key={path}>
                    <b>{path}</b>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
