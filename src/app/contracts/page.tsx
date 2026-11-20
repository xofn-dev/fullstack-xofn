import type { Metadata } from 'next';
import { currentBuildNote } from '@/lib/web3/app-mode';
import { AppBackdrop } from '@/components/landing/scene-loaders';
import { ContractTable } from '@/components/proof/contract-table';
import { publicEnv } from '@/lib/public-env';
import { getHomeChain } from '@/lib/chains';
import { getDeployment, getHomeOnlyDeployment } from '@/lib/web3/addresses';

export const metadata: Metadata = {
  title: 'Contracts',
  description: `XofN contract addresses per chain, read from the deployment manifest. ${currentBuildNote()}`,
};

// "/contracts" — USER_FLOWS Flow I. Alamat hanya berasal dari `deployments/<network>.json`.
export default function ContractsPage() {
  const network = publicEnv.network;
  const deployment = getDeployment(network);
  const homeOnly = getHomeOnlyDeployment(network);
  const homeName = getHomeChain(network).name;
  return (
    <>
      <AppBackdrop />
      <main className="app-page" id="top">
        <div className="container">
          <div className="app-head">
            <div className="section-label">CONTRACTS</div>
            <h1>
              Transparent <span className="accent">by design.</span>
            </h1>
            <p>
              {deployment?.status === 'local'
                ? 'These addresses exist only on a local test node, next to mock LayerZero endpoints, mock DVNs and a local Uniswap v4 deployment with a test swap router. Nothing is deployed to a public network, and no source is verified on an explorer.'
                : homeOnly?.status === 'deployed-dormant'
                  ? `The home-chain contracts are deployed on ${homeName} in a dormant state: launching is closed until the 2-of-3 Safe opens it. Expansion chains are not deployed yet. Testnet only, no real funds.`
                  : homeOnly?.status === 'live'
                    ? `The home-chain contracts are live on ${homeName}: the 2-of-3 Safe has opened launching, and anyone can launch a token. Expansion chains are not deployed yet, so no token can expand or lock. Testnet only, no real funds.`
                    : 'No XofN contract is deployed on a public network yet. Addresses appear here only after they are published in the deployment manifest.'}
            </p>
          </div>
          <div className="app-stack">
            <ContractTable network={network} deployment={deployment} homeOnly={homeOnly} />
            <p className="preview-note">
              {homeOnly
                ? 'Contracts are unaudited. Source verification on the explorer is pending.'
                : 'The three linked libraries (pool seeding, tier recipe, token deployer) and the pool guard hook that each Graduator and Remote uses on Uniswap v4 are not listed: whether they belong in the manifest is an open decision. Contracts are unaudited.'}
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
