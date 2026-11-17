'use client';

import { readContract } from '@wagmi/core';
import { useState } from 'react';
import { useConfig, useConnection, useReadContract } from 'wagmi';
import { getChain } from '@/lib/chains';
import { formatEth, formatTokens, parseAmount, shortAddress } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';
import { useTokenDetail, useTokenList } from '@/lib/client/use-tokens';
import { tokenAbi } from '@/lib/web3/abi/xofn';
import { homeContracts, type Deployment } from '@/lib/web3/addresses';
import { bridgeRoute, buildBridgeSend, buildSendParam, splitDust } from '@/lib/web3/bridge-send';
import { useTxFlow } from '@/lib/web3/use-tx-flow';
import { SimulationRelay } from '@/components/expansion/simulation-relay';
import { EmptyState } from '@/components/ui/empty-state';
import { TxStatus } from '@/components/ui/tx-status';
import { NetworkGuard } from '@/components/wallet/network-guard';
import type { ChainKey } from '@/types/enums';

// Fee yang naik lebih dari ini sejak quote terakhir yang dilihat pengguna harus dikonfirmasi ulang.
const FEE_RECONFIRM_BPS = 1_000n;

// Bridge OFT (USER_FLOWS Flow H). Hanya untuk token Locked. Topologi hub: antar chain ekspansi
// selalu dua langkah lewat home. `quoteSend` dibaca ulang tepat sebelum `send`.
export function BridgeWidget({ deployment }: { deployment: Deployment }) {
  const home = homeContracts(deployment);
  const homeKey = home.chain.chain;
  const config = useConfig();
  const { address: account } = useConnection();
  const tx = useTxFlow();
  const locked = useTokenList('locked');
  const [picked, setPicked] = useState<string | null>(null);
  const tokenAddress = picked ?? locked.data?.[0]?.address ?? null;
  const detail = useTokenDetail(tokenAddress ?? '', undefined, tokenAddress !== null);
  const token = detail.data;

  const chains = token ? token.verify.filter((reading) => reading.token !== null) : [];
  const [fromPick, setFrom] = useState<ChainKey | null>(null);
  const [toPick, setTo] = useState<ChainKey | null>(null);
  const from = fromPick ?? homeKey;
  const to = toPick ?? chains.find((reading) => reading.chain !== from)?.chain ?? homeKey;
  const [amountText, setAmountText] = useState('');
  const [notice, setNotice] = useState('');
  const [seenFee, setSeenFee] = useState<bigint | null>(null);

  const route = bridgeRoute(from, to, homeKey);
  const hop = route[0];
  const source = chains.find((reading) => reading.chain === from);
  const hopTarget = hop ? chains.find((reading) => reading.chain === hop.to) : undefined;
  const sourceChainId = getChain(publicEnv.network, from).chainId;
  const amount = parseAmount(amountText);

  const balance = useReadContract({
    address: source?.token ?? undefined,
    abi: tokenAbi,
    functionName: 'balanceOf',
    args: account ? [account] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!account && !!source?.token, refetchInterval: 4_000 },
  });
  const targetBalance = useReadContract({
    address: hopTarget?.token ?? undefined,
    abi: tokenAbi,
    functionName: 'balanceOf',
    args: account ? [account] : undefined,
    chainId: hop ? getChain(publicEnv.network, hop.to).chainId : sourceChainId,
    query: { enabled: !!account && !!hopTarget?.token, refetchInterval: 4_000 },
  });
  const rate = useReadContract({
    address: source?.token ?? undefined,
    abi: tokenAbi,
    functionName: 'decimalConversionRate',
    chainId: sourceChainId,
    query: { enabled: !!source?.token },
  });

  const split = amount !== null && rate.data !== undefined ? splitDust(amount, rate.data) : null;
  const param =
    split && split.sendable > 0n && account && hopTarget ? buildSendParam(hopTarget.eid, account, split.sendable) : null;
  const quote = useReadContract({
    address: source?.token ?? undefined,
    abi: tokenAbi,
    functionName: 'quoteSend',
    args: param ? [param, false] : undefined,
    chainId: sourceChainId,
    query: { enabled: param !== null && !!source?.token },
  });

  if (locked.isPending) return <EmptyState title="READING TOKENS…">Reading locked tokens from the chain.</EmptyState>;
  if (!locked.data || locked.data.length === 0) {
    return (
      <EmptyState title="Bridging opens after expansion is locked.">
        {locked.isError
          ? 'The chain could not be read. No token is assumed.'
          : 'No token on this network is Locked yet. A token can be bridged only after verify() is true on every chain.'}
      </EmptyState>
    );
  }

  let problem: string | null = null;
  if (from === to) problem = 'Choose two different chains.';
  else if (amountText.trim() !== '' && (amount === null || amount <= 0n)) problem = 'Enter an amount greater than zero.';
  else if (split && split.sendable === 0n) problem = 'Amount is below 0.000001 and cannot be bridged.';
  else if (amount !== null && balance.data !== undefined && amount > balance.data) problem = 'Balance is too low for this amount.';
  else if (quote.isError) problem = 'Fee quote could not be read. No fee is assumed.';

  const send = async () => {
    if (!source?.token || !param || !account || !hop) return;
    setNotice('');
    // quoteSend tepat sebelum send: fee yang dipakai selalu yang terbaru.
    let fresh: bigint;
    try {
      const fee = await readContract(config, {
        address: source.token,
        abi: tokenAbi,
        functionName: 'quoteSend',
        args: [param, false],
        chainId: sourceChainId,
      });
      fresh = fee.nativeFee;
    } catch {
      setNotice('Fee quote could not be refreshed. Nothing was sent.');
      return;
    }
    const shown = seenFee ?? quote.data?.nativeFee ?? null;
    if (shown !== null && fresh > shown + (shown * FEE_RECONFIRM_BPS) / 10_000n) {
      setSeenFee(fresh);
      setNotice(`The fee changed to ${formatEth(fresh)}. Review it and send again to confirm.`);
      return;
    }
    const receipt = await tx.run(buildBridgeSend(hop.from, source.token, param, fresh, account));
    if (receipt) {
      setAmountText('');
      setSeenFee(null);
    }
  };

  const chainName = (key: ChainKey) => getChain(publicEnv.network, key).name;
  const fee = seenFee ?? quote.data?.nativeFee ?? null;
  const symbol = token?.symbol ?? '';

  return (
    <div className="app-grid">
      <div className="app-panel">
        <h2>Bridge a locked token</h2>
        <label className="field-label" htmlFor="bridgeToken">
          TOKEN · LOCKED ONLY
        </label>
        <select
          id="bridgeToken"
          className="form-control"
          value={tokenAddress ?? ''}
          onChange={(event) => {
            setPicked(event.target.value);
            setFrom(null);
            setTo(null);
          }}
        >
          {locked.data.map((item) => (
            <option key={item.address} value={item.address}>
              {item.name} (${item.symbol})
            </option>
          ))}
        </select>
        <div className="bridge-row" style={{ marginTop: 14 }}>
          <div>
            <label className="field-label" htmlFor="bridgeFrom">
              FROM
            </label>
            <select id="bridgeFrom" className="form-control" value={from} onChange={(event) => setFrom(event.target.value as ChainKey)}>
              {chains.map((reading) => (
                <option key={reading.chain} value={reading.chain}>
                  {chainName(reading.chain)}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn secondary iconOnly"
            type="button"
            aria-label="Swap source and destination"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            ↕
          </button>
          <div>
            <label className="field-label" htmlFor="bridgeTo">
              TO
            </label>
            <select id="bridgeTo" className="form-control" value={to} onChange={(event) => setTo(event.target.value as ChainKey)}>
              {chains.map((reading) => (
                <option key={reading.chain} value={reading.chain}>
                  {chainName(reading.chain)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {route.length === 2 && hop && (
          <p className="step-note">
            {chainName(from)} to {chainName(to)} takes two steps through {chainName(homeKey)}. This
            sends step 1: {chainName(hop.from)} → {chainName(hop.to)}. Then bridge again from{' '}
            {chainName(homeKey)}.
          </p>
        )}
        <label className="field-label" htmlFor="bridgeAmount" style={{ marginTop: 14, display: 'block' }}>
          AMOUNT · ${symbol}
        </label>
        <input
          id="bridgeAmount"
          className="form-control"
          inputMode="decimal"
          placeholder="0.0"
          value={amountText}
          onChange={(event) => {
            setAmountText(event.target.value);
            setSeenFee(null);
          }}
          aria-describedby="bridgeProblem"
        />
        <dl className="quote-list">
          <div>
            <dt>BALANCE ON {getChain(publicEnv.network, from).shortName}</dt>
            <dd>{balance.data !== undefined ? `${formatTokens(balance.data, 6)} $${symbol}` : account ? 'Reading…' : 'Wallet not connected'}</dd>
          </div>
          <div>
            <dt>RECEIVED ON {hop ? getChain(publicEnv.network, hop.to).shortName : '—'}</dt>
            <dd>{split ? `${formatTokens(split.sendable, 6)} $${symbol}` : '—'}</dd>
          </div>
          <div>
            <dt>DUST · STAYS IN YOUR WALLET</dt>
            <dd>{split ? `${formatTokens(split.dust, 18)} $${symbol}` : '—'}</dd>
          </div>
          <div>
            <dt>{publicEnv.network === 'local' ? 'FEE · SIMULATION QUOTE' : 'FEE · LAYERZERO QUOTE'}</dt>
            <dd>{fee !== null ? formatEth(fee, 8) : param ? 'Reading…' : '—'}</dd>
          </div>
        </dl>
        <p className="step-note">Amounts below 0.000001 stay in your wallet.</p>
        <div id="bridgeProblem" className="error-msg" aria-live="polite">
          {problem ?? notice}
        </div>
        <NetworkGuard chain={from}>
          <button className="btn primary" type="button" onClick={send} disabled={!!problem || !param || tx.busy}>
            {tx.state.phase === 'wallet' ? 'Confirm in wallet…' : tx.state.phase === 'pending' ? 'Pending…' : 'Bridge'}{' '}
            <span className="arr">↗</span>
          </button>
        </NetworkGuard>
        <TxStatus state={tx.state} chain={from} success="Sent. Waiting for delivery on the destination chain." />
      </div>
      <div className="app-panel">
        <h2>Delivery</h2>
        <dl className="quote-list">
          <div>
            <dt>YOUR BALANCE ON {hop ? getChain(publicEnv.network, hop.to).shortName : '—'}</dt>
            <dd>{targetBalance.data !== undefined ? `${formatTokens(targetBalance.data, 6)} $${symbol}` : '—'}</dd>
          </div>
          <div>
            <dt>TOKEN ON DESTINATION</dt>
            <dd>{hopTarget?.token ? shortAddress(hopTarget.token) : '—'}</dd>
          </div>
          <div>
            <dt>MESSAGE TRACKING</dt>
            <dd>{deployment.localRelay ? 'LOCAL RELAY · no LayerZero Scan on a test node' : 'LayerZero Scan link not available yet'}</dd>
          </div>
        </dl>
        <p className="step-note">The destination balance updates when the message is delivered.</p>
        {deployment.localRelay && token && (
          <SimulationRelay relay={deployment.localRelay} pending={token.relayPending} homeChain={homeKey} />
        )}
      </div>
    </div>
  );
}
