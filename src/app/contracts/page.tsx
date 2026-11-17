import type { Metadata } from 'next';
import { AppBackdrop } from '@/components/landing/scene-loaders';
import { ContractTable } from '@/components/proof/contract-table';
import { publicEnv } from '@/lib/public-env';
import { getDeployment } from '@/lib/web3/addresses';

export const metadata: Metadata = {
  title: 'Contracts',
  description: 'XofN contract addresses per chain, read from the deployment manifest. Preview build.',
};

// "/contracts" — USER_FLOWS Flow I. Alamat hanya berasal dari `deployments/<network>.json`.
export default function ContractsPage() {
  const network = publicEnv.network;
  const deployment = getDeployment(network);
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
                ? 'These addresses exist only on a local test node, next to mock LayerZero endpoints, mock DVNs and a mock AMM. Nothing is deployed to a public network, and no source is verified on an explorer.'
                : 'No XofN contract is deployed on a public network yet. Addresses appear here only after they are published in the deployment manifest.'}
            </p>
          </div>
          <div className="app-stack">
            <ContractTable network={network} deployment={deployment} />
            <p className="preview-note">
              The three linked libraries (pool seeding, tier recipe, token deployer) are not listed:
              whether they belong in the manifest is an open decision. Contracts are unaudited.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
