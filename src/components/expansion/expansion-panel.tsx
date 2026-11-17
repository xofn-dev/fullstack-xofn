'use client';

import { useReadContract } from 'wagmi';
import { getChain } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { formatEth } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';
import { expansionView } from '@/lib/tokens/steps';
import { graduatorAbi, remoteAbi } from '@/lib/web3/abi/xofn';
import { homeContracts, type ChainDeployment, type Deployment } from '@/lib/web3/addresses';
import { buildExpandAndLock, expandValue } from '@/lib/web3/expand-and-lock';
import { buildReAck, buildRetryRemote } from '@/lib/web3/retry-remote';
import { useTxFlow } from '@/lib/web3/use-tx-flow';
import { TxStatus } from '@/components/ui/tx-status';
import { NetworkGuard } from '@/components/wallet/network-guard';
import { SimulationRelay } from '@/components/expansion/simulation-relay';
import type { ExpansionChainState, TokenDetail } from '@/types/domain';

const STEP_MARK = { pending: '○ PENDING', ok: '● OK', failed: '✕ FAILED' } as const;

function ChainSteps({
  token,
  state,
  deployment,
  remote,
}: {
  token: TokenDetail;
  state: ExpansionChainState;
  deployment: Deployment;
  remote: ChainDeployment;
}) {
  const home = homeContracts(deployment);
  const chain = getChain(publicEnv.network, state.chain);
  const tx = useTxFlow();
  const verify = token.verify.find((reading) => reading.chain === state.chain);
  const view = expansionView(state, verify, token.relayPending);
  const retryFee = BigInt(state.retryQuote);

  // Fee ack dibaca dari Remote chain tujuan, hanya saat ack memang perlu dikirim ulang.
  const ackQuote = useReadContract({
    address: remote.remote ?? undefined,
    abi: remoteAbi,
    functionName: 'quoteAck',
    args: [token.address],
    chainId: chain.chainId,
    query: { enabled: view.action === 're-ack' && remote.remote !== null },
  });

  return (
    <div className="step-chain">
      <h4>
        <span>{chain.shortName}</span>
        <span>EID {state.eid}</span>
      </h4>
      <ul className="step-list">
        {view.steps.map((step) => (
          <li key={step.key} className={cn(step.state)}>
            <span>{step.label}</span>
            <span>{STEP_MARK[step.state]}</span>
          </li>
        ))}
      </ul>
      <p className="step-note">{view.note}</p>
      {view.action === 'retry-remote' && retryFee > 0n && (
        <NetworkGuard chain={home.chain.chain}>
          <button
            className="btn secondary"
            type="button"
            disabled={tx.busy}
            onClick={() => void tx.run(buildRetryRemote(home, token.address, state.eid, retryFee))}
          >
            Retry {chain.name} · {formatEth(retryFee)} <span className="arr">↗</span>
          </button>
        </NetworkGuard>
      )}
      {view.action === 're-ack' && (
        <NetworkGuard chain={state.chain}>
          <button
            className="btn secondary"
            type="button"
            disabled={tx.busy || ackQuote.data === undefined}
            onClick={() => {
              const request = ackQuote.data !== undefined ? buildReAck(remote, token.address, ackQuote.data) : null;
              if (request) void tx.run(request);
            }}
          >
            Re-send acknowledgement
            {ackQuote.data !== undefined ? ` · ${formatEth(ackQuote.data)}` : ' · fee not read'}{' '}
            <span className="arr">↗</span>
          </button>
        </NetworkGuard>
      )}
      <TxStatus state={tx.state} chain={state.chain} success="Retry sent." />
    </div>
  );
}

// Panel Expand & lock, tahap 2 (USER_FLOWS Flow F.2). Siapa pun boleh memanggil; pemanggil
// membayar fee LayerZero. Token baru tampil Locked setelah verify() true di SEMUA chain.
export function ExpansionPanel({ token, deployment }: { token: TokenDetail; deployment: Deployment }) {
  const home = homeContracts(deployment);
  const homeInfo = getChain(publicEnv.network, home.chain.chain);
  const tx = useTxFlow();
  const status = token.graduatorStatus;
  const destinations = token.expansion.map((item) => getChain(publicEnv.network, item.chain).name);

  const quote = useReadContract({
    address: home.graduator,
    abi: graduatorAbi,
    functionName: 'quoteExpandAndLock',
    args: [token.address],
    chainId: homeInfo.chainId,
    query: { enabled: status === 'graduated' },
  });
  const total = quote.data ? expandValue({ deployFees: quote.data[0], liquidityFees: quote.data[1] }) : null;
  const simulation = publicEnv.network === 'local';

  if (status === 'bonding') {
    return (
      <div className="app-panel">
        <h2>Expansion &amp; lock · stage 2</h2>
        <p>
          Opens after graduation. Planned chains: {destinations.join(', ') || 'none'}. Until then the
          tier is committed and its DVN configuration is not applied yet.
        </p>
      </div>
    );
  }

  return (
    <div className="app-panel">
      <h2>Expansion &amp; lock · stage 2</h2>
      {status === 'graduated' && (
        <>
          <p>
            Deploys the token to {destinations.join(' and ')}, sends liquidity, applies the tier DVN
            configuration and then locks every chain: owner 0, delegate 0. Anyone can start it; the
            caller pays the cross-chain fee.
          </p>
          <dl className="quote-list">
            <div>
              <dt>{simulation ? 'FEE · SIMULATION QUOTE (MOCK ENDPOINTS)' : 'FEE · LAYERZERO QUOTE'}</dt>
              <dd>{total !== null ? formatEth(total) : quote.isError ? 'NOT AVAILABLE' : 'Reading…'}</dd>
            </div>
          </dl>
          {quote.isError ? (
            <p>Expansion opens in a later release: the expansion infrastructure is not active yet.</p>
          ) : (
            <NetworkGuard chain={home.chain.chain}>
              <button
                className="btn primary"
                type="button"
                disabled={tx.busy || total === null}
                onClick={() => {
                  if (total !== null) void tx.run(buildExpandAndLock(home, token.address, total));
                }}
              >
                {tx.state.phase === 'wallet'
                  ? 'Confirm in wallet…'
                  : tx.state.phase === 'pending'
                    ? 'Pending…'
                    : 'Expand & lock'}{' '}
                <span className="arr">↗</span>
              </button>
            </NetworkGuard>
          )}
          <TxStatus state={tx.state} chain={home.chain.chain} success="Expansion started." />
        </>
      )}
      {(status === 'expanding' || status === 'locked') && (
        <>
          {token.expansion.map((state) => {
            const remote = deployment.chains[state.chain];
            return <ChainSteps key={state.eid} token={token} state={state} deployment={deployment} remote={remote} />;
          })}
          <div className="step-chain">
            <ul className="step-list">
              <li className={cn(token.status === 'locked' ? 'ok' : token.status === 'changed' ? 'failed' : undefined)}>
                <span>All chains verified</span>
                <span>
                  {token.status === 'locked'
                    ? '● LOCKED'
                    : token.status === 'changed'
                      ? '✕ VERIFY FALSE'
                      : token.status === 'unread'
                        ? '◌ NOT READ'
                        : '○ PENDING'}
                </span>
              </li>
            </ul>
            {status === 'expanding' && (
              <p className="step-note">Cross-chain delivery can take several minutes.</p>
            )}
          </div>
        </>
      )}
      {deployment.localRelay && status !== 'graduated' && (
        <SimulationRelay relay={deployment.localRelay} pending={token.relayPending} homeChain={home.chain.chain} />
      )}
    </div>
  );
}
