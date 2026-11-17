import type { Metadata } from 'next';
import { CheckForm } from '@/components/check/check-form';
import { AppBackdrop } from '@/components/landing/scene-loaders';
import { getChains } from '@/lib/chains';
import { publicEnv } from '@/lib/public-env';

export const metadata: Metadata = {
  title: 'XofN Check',
  description:
    'Read the DVN configuration, owner and delegate of an OFT directly from the chain. Preview build.',
};

// "/check" — pintu masuk XofN Check. Hanya membaca chain; tidak butuh wallet.
export default function CheckPage() {
  const chains = getChains(publicEnv.network);
  const available = chains.some((chain) => chain.lz !== null && chain.publicRpc !== null);
  const options = chains.map((chain) => ({ key: chain.key, name: chain.name }));

  return (
    <>
      <AppBackdrop />
      <main className="app-page" id="top">
        <div className="container">
          <div className="app-head">
            <div className="section-label">XOFN CHECK</div>
            <h1>
              What does a token <span className="accent">actually trust?</span>
            </h1>
            <p>
              Paste an OFT address and pick its chain. XofN Check reads the required and optional
              DVNs, the threshold, the owner and the endpoint delegate for each pathway it can
              read, and shows them as facts with the time of the read.
            </p>
          </div>
          <div className="terminal">
            <div className="terminal-head">
              <div className="window-dots">
                <i />
                <i />
                <i />
              </div>
              <span className="mono">XOFN_CHECK / CONFIG_INSPECTOR</span>
              <span className="tag">
                <i /> {available ? 'ON-CHAIN READ' : 'UNAVAILABLE'}
              </span>
            </div>
            <div className="terminal-body">
              {available ? (
                <CheckForm chains={options} defaultChain={chains[0]?.key ?? 'robinhood'} />
              ) : (
                <div className="checker-error is-visible" role="status">
                  Live check unavailable — no RPC connection is configured for this network. No
                  result will be fabricated.
                </div>
              )}
              <div className="hint">
                Reads {chains.map((chain) => chain.name).join(', ')} only. Pathways to other
                networks are not read in this version. Results are cached for 15 minutes and always
                show when they were checked.
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
