import type { Metadata } from 'next';
import { LaunchDemo } from '@/components/landing/launch-demo';
import { AppBackdrop } from '@/components/landing/scene-loaders';
import { TierProvider } from '@/components/landing/tier-context';
import { LaunchForm } from '@/components/launch/launch-form';
import { getExpansionChains, getHomeChain } from '@/lib/chains';
import { getModeCopy, resolveMode } from '@/lib/mode';
import { publicEnv } from '@/lib/public-env';
import { getLaunchConfig } from '@/lib/tokens';
import { getDeployment, getManifestState } from '@/lib/web3/addresses';

export const metadata: Metadata = {
  title: 'Launch',
  description: 'Create a token with a fixed supply and a committed security tier. Preview build.',
};

// Konfigurasi launch dibaca dari chain pada saat halaman diminta.
export const dynamic = 'force-dynamic';

// "/launch" — USER_FLOWS Flow D. Mode preview memakai form pratinjau landing (tanpa transaksi);
// mode simulation menandatangani launch di Anvil lokal.
export default async function LaunchPage() {
  const network = publicEnv.network;
  const home = getHomeChain(network);
  const expansions = getExpansionChains(network);
  const mode = resolveMode({ network, manifest: getManifestState(network) });
  const deployment = getDeployment(network);

  if (mode === 'preview' || !deployment) {
    return (
      <TierProvider>
        <AppBackdrop />
        <main className="app-page" id="top">
          <LaunchDemo home={home} expansions={expansions} />
        </main>
      </TierProvider>
    );
  }

  const config = await getLaunchConfig();
  return (
    <>
      <AppBackdrop />
      <main className="app-page" id="top">
        <div className="container launch-layout">
          <div className="launch-intro">
            <div className="section-label">CREATE A TOKEN</div>
            <h1 className="h2">
              Build a token. <span className="accent">Set the standard.</span>
            </h1>
            <p>
              Create once on {home.name} with fixed supply and a committed security tier. When the
              curve reaches its threshold, anyone can graduate the token on {home.name}. Expansion
              and locking are a separate step.
            </p>
            <div className="steps-mini">
              <div>
                <i>01</i> Define identity and token metadata
              </div>
              <div>
                <i>02</i> Choose Standard or Fortress
              </div>
              <div>
                <i>03</i> Select expansion networks
              </div>
              <div>
                <i>04</i> Review and sign on {home.name}
              </div>
            </div>
            <p className="preview-note">
              ◈ LOCAL SIMULATION: transactions go to a local test node with mock LayerZero endpoints
              and mock DVNs. No real funds are used and nothing is deployed to a public network.
            </p>
          </div>
          <LaunchForm
            home={home}
            expansions={expansions}
            deployment={deployment}
            config={config}
            actionTag={getModeCopy(mode).actionTag}
          />
        </div>
      </main>
    </>
  );
}
