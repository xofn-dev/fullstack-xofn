import type { Metadata } from 'next';
import { BridgeWidget } from '@/components/bridge/bridge-widget';
import { BridgeDemo } from '@/components/landing/bridge-demo';
import { AppBackdrop } from '@/components/landing/scene-loaders';
import { getExpansionChains, getHomeChain } from '@/lib/chains';
import { resolveMode } from '@/lib/mode';
import { publicEnv } from '@/lib/public-env';
import { getDeployment, getManifestState } from '@/lib/web3/addresses';

export const metadata: Metadata = {
  title: 'Bridge',
  description: 'Move a locked XofN token between its chains. Preview build.',
};

// "/bridge" — USER_FLOWS Flow H. Mode preview memakai widget pratinjau landing (berlabel PLANNED).
export default function BridgePage() {
  const network = publicEnv.network;
  const home = getHomeChain(network);
  const expansions = getExpansionChains(network);
  const mode = resolveMode({ network, manifest: getManifestState(network) });
  const deployment = getDeployment(network);

  if (mode === 'preview' || !deployment) {
    return (
      <>
        <AppBackdrop />
        <main className="app-page" id="top">
          <BridgeDemo home={home} expansions={expansions} />
        </main>
      </>
    );
  }
  return (
    <>
      <AppBackdrop />
      <main className="app-page" id="top">
        <div className="container">
          <div className="app-head">
            <div className="section-label">BRIDGE · LOCAL SIMULATION</div>
            <h1>
              Move a locked token <span className="accent">between its chains.</span>
            </h1>
            <p>
              Bridging is available only for tokens that are Locked. {home.name} is the hub:
              transfers between {expansions.map((chain) => chain.name).join(' and ')} go through it
              in two steps.
            </p>
          </div>
          <BridgeWidget deployment={deployment} />
        </div>
      </main>
    </>
  );
}
