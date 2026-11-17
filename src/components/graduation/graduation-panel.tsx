'use client';

import { getChain } from '@/lib/chains';
import { formatBps, formatEth, shortAddress } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';
import { homeContracts, type Deployment } from '@/lib/web3/addresses';
import { buildGraduate } from '@/lib/web3/graduate';
import { useTxFlow } from '@/lib/web3/use-tx-flow';
import { ProgressBar } from '@/components/ui/progress-bar';
import { TxStatus } from '@/components/ui/tx-status';
import { NetworkGuard } from '@/components/wallet/network-guard';
import type { TokenDetail } from '@/types/domain';

// Panel Graduation, tahap 1 (USER_FLOWS Flow F.1). Siapa pun boleh memanggil `graduate(token)`
// setelah ambang tercapai. Graduation TIDAK mengunci: owner dan delegate tetap Graduator.
export function GraduationPanel({ token, deployment }: { token: TokenDetail; deployment: Deployment }) {
  const home = homeContracts(deployment);
  const chain = getChain(publicEnv.network, home.chain.chain);
  const tx = useTxFlow();
  const curve = token.curveState;
  const bonding = token.graduatorStatus === 'bonding';

  return (
    <div className="app-panel">
      <h2>Graduation · stage 1</h2>
      {bonding ? (
        <>
          <div className="token-info">
            <span>PROGRESS TO THRESHOLD</span>
            <strong>{formatBps(curve.progressBps)}</strong>
          </div>
          <ProgressBar bps={curve.progressBps} label="Progress to graduation threshold" />
          <dl className="quote-list">
            <div>
              <dt>RAISED</dt>
              <dd>
                {formatEth(curve.ethRaised)} of {formatEth(curve.graduationThreshold)}
              </dd>
            </div>
            <div>
              <dt>CALLER REWARD</dt>
              <dd>{formatEth(token.economics.callerReward)}</dd>
            </div>
          </dl>
          {curve.thresholdReached ? (
            <>
              <p>
                The threshold was reached. Anyone can graduate this token: it creates the{' '}
                {chain.name} pool and pays the caller reward. Expansion and locking are a separate
                step.
              </p>
              <NetworkGuard chain={chain.key}>
                <button
                  className="btn primary"
                  type="button"
                  disabled={tx.busy}
                  onClick={() => void tx.run(buildGraduate(home, token.address))}
                >
                  {tx.state.phase === 'wallet'
                    ? 'Confirm in wallet…'
                    : tx.state.phase === 'pending'
                      ? 'Pending…'
                      : 'Graduate'}{' '}
                  <span className="arr">↗</span>
                </button>
              </NetworkGuard>
              <TxStatus state={tx.state} chain={chain.key} success={`${chain.name} pool created.`} />
            </>
          ) : (
            <p>Graduation opens when the curve reaches its threshold.</p>
          )}
        </>
      ) : (
        <>
          <ul className="step-list">
            <li className="ok">
              <span>{chain.name} pool created</span>
              <span>{token.pool ? shortAddress(token.pool) : 'address not read'}</span>
            </li>
          </ul>
          <p className="step-note">
            Tier committed. Owner and delegate are still the XofN Graduator contract until
            expansion completes.
          </p>
          <TxStatus state={tx.state} chain={chain.key} success={`${chain.name} pool created.`} />
        </>
      )}
    </div>
  );
}
