'use client';

import { useState } from 'react';
import { useBalance, useConnection, useReadContract } from 'wagmi';
import { getChain } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { formatEth, formatTokens, parseAmount } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';
import { curveAbi, tokenAbi } from '@/lib/web3/abi/xofn';
import { buildApprove, buildBuy, buildSell } from '@/lib/web3/curve-trade';
import { buildPoolBuy, buildPoolSell, getAmountOut } from '@/lib/web3/pool-trade';
import { applySlippage, DEFAULT_SLIPPAGE_BPS, type TxRequest } from '@/lib/web3/tx';
import { useTxFlow } from '@/lib/web3/use-tx-flow';
import { TxStatus } from '@/components/ui/tx-status';
import { NetworkGuard } from '@/components/wallet/network-guard';
import type { Address, TokenDetail } from '@/types/domain';
import type { ChainKey, TradeSide } from '@/types/enums';

const SLIPPAGE_CHOICES = [50, 100, 300] as const;

interface TradePanelProps {
  token: TokenDetail;
  homeChain: ChainKey;
  /** Router AMM tiruan (hanya manifest lokal); null → trading pool belum tersedia di UI. */
  mockRouter: Address | null;
}

// Trading (USER_FLOWS Flow E): di bonding curve sebelum graduation, di pool home sesudahnya.
// Quote dibaca dari kontrak; batas minimum dihitung dari slippage pilihan pengguna.
export function TradePanel({ token, homeChain, mockRouter }: TradePanelProps) {
  const chainId = getChain(publicEnv.network, homeChain).chainId;
  const onCurve = token.graduatorStatus === 'bonding';
  const venue: Address | null = onCurve ? token.curve : mockRouter;
  const { address: account } = useConnection();
  const tx = useTxFlow();
  const [side, setSide] = useState<TradeSide>('buy');
  const [amountText, setAmountText] = useState('');
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);

  const amount = parseAmount(amountText);
  const hasAmount = amount !== null && amount > 0n;

  const ethBalance = useBalance({ address: account, chainId, query: { enabled: !!account } });
  const tokenBalance = useReadContract({
    address: token.address,
    abi: tokenAbi,
    functionName: 'balanceOf',
    args: account ? [account] : undefined,
    chainId,
    query: { enabled: !!account },
  });
  const allowance = useReadContract({
    address: token.address,
    abi: tokenAbi,
    functionName: 'allowance',
    args: account && venue ? [account, venue] : undefined,
    chainId,
    query: { enabled: !!account && !!venue && side === 'sell' },
  });
  const quoteBuy = useReadContract({
    address: token.curve,
    abi: curveAbi,
    functionName: 'quoteBuy',
    args: hasAmount ? [amount] : undefined,
    chainId,
    query: { enabled: onCurve && side === 'buy' && hasAmount },
  });
  const quoteSell = useReadContract({
    address: token.curve,
    abi: curveAbi,
    functionName: 'quoteSell',
    args: hasAmount ? [amount] : undefined,
    chainId,
    query: { enabled: onCurve && side === 'sell' && hasAmount },
  });

  if (token.curveState.thresholdReached && onCurve) {
    return (
      <div className="app-panel">
        <h2>Trade</h2>
        <p>The graduation threshold was reached. Curve trading is closed until the token graduates.</p>
      </div>
    );
  }
  if (!venue) {
    return (
      <div className="app-panel">
        <h2>Trade</h2>
        <p>
          Trading moved to the {getChain(publicEnv.network, homeChain).name} pool. Pool trading is
          not available in this interface for this network yet.
        </p>
      </div>
    );
  }

  // Quote: curve membacanya dari kontrak; pool tiruan dihitung dari cadangan dengan rumus v2.
  let expectedOut: bigint | null = null;
  let ethUsed: bigint | null = null;
  let quoteFailed = false;
  if (hasAmount) {
    if (onCurve && side === 'buy') {
      if (quoteBuy.data) [expectedOut, ethUsed] = quoteBuy.data;
      quoteFailed = quoteBuy.isError;
    } else if (onCurve) {
      if (quoteSell.data !== undefined) expectedOut = quoteSell.data;
      quoteFailed = quoteSell.isError;
    } else if (token.poolReserves) {
      const reserveToken = BigInt(token.poolReserves.token);
      const reserveEth = BigInt(token.poolReserves.eth);
      expectedOut =
        side === 'buy'
          ? getAmountOut(amount, reserveEth, reserveToken)
          : getAmountOut(amount, reserveToken, reserveEth);
    } else {
      quoteFailed = true;
    }
  }
  const minOut = expectedOut !== null ? applySlippage(expectedOut, slippageBps) : null;

  const balance = side === 'buy' ? ethBalance.data?.value : tokenBalance.data;
  const insufficient = hasAmount && balance !== undefined && amount > balance;
  const needsApproval =
    side === 'sell' && hasAmount && allowance.data !== undefined && allowance.data < amount;
  // Curve menolak penjualan yang hasilnya nol; pool tiruan tidak punya batas minimum on-chain.
  const zeroOut = hasAmount && expectedOut !== null && expectedOut === 0n;

  let problem: string | null = null;
  if (amountText.trim() !== '' && !hasAmount) problem = 'Enter an amount greater than zero.';
  else if (insufficient) problem = 'Balance is too low for this amount.';
  else if (quoteFailed) problem = 'Quote could not be read. No price is assumed.';
  else if (zeroOut) problem = 'This amount is too small to trade.';

  const canSubmit = hasAmount && !problem && expectedOut !== null && minOut !== null && !tx.busy;

  const submit = async () => {
    if (!account || !hasAmount || minOut === null) return;
    let request: TxRequest;
    if (needsApproval) {
      request = buildApprove(homeChain, token.address, venue, amount);
    } else if (onCurve) {
      request = side === 'buy' ? buildBuy(homeChain, venue, amount, minOut) : buildSell(homeChain, venue, amount, minOut);
    } else {
      request =
        side === 'buy'
          ? buildPoolBuy(homeChain, venue, token.address, account, amount)
          : buildPoolSell(homeChain, venue, token.address, account, amount);
    }
    const receipt = await tx.run(request);
    if (!receipt) return;
    void allowance.refetch();
    void tokenBalance.refetch();
    void ethBalance.refetch();
    if (!needsApproval) setAmountText('');
  };

  const outUnit = side === 'buy' ? `$${token.symbol}` : 'ETH';
  const format = (value: bigint) => (side === 'buy' ? `${formatTokens(value)} ${outUnit}` : formatEth(value));
  const actionLabel = needsApproval ? `Approve $${token.symbol}` : side === 'buy' ? 'Buy' : 'Sell';

  return (
    <div className="app-panel">
      <h2>{onCurve ? 'Trade on the bonding curve' : 'Trade in the pool'}</h2>
      {!onCurve && (
        <p className="guard-note">
          SIMULATION · mock AMM. It has no on-chain slippage limit, so the minimum below is an
          estimate only.
        </p>
      )}
      <div className="trade-toggle" role="group" aria-label="Trade side">
        {(['buy', 'sell'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={cn(side === item && 'active')}
            aria-pressed={side === item}
            onClick={() => {
              setSide(item);
              setAmountText('');
              tx.reset();
            }}
          >
            {item === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor="tradeAmount">
        AMOUNT · {side === 'buy' ? 'ETH' : `$${token.symbol}`}
      </label>
      <input
        id="tradeAmount"
        className="form-control"
        inputMode="decimal"
        placeholder="0.0"
        value={amountText}
        onChange={(event) => setAmountText(event.target.value)}
        aria-describedby="tradeProblem"
      />
      <div className="trade-toggle three" role="group" aria-label="Slippage tolerance">
        {SLIPPAGE_CHOICES.map((bps) => (
          <button
            key={bps}
            type="button"
            className={cn(slippageBps === bps && 'active')}
            aria-pressed={slippageBps === bps}
            onClick={() => setSlippageBps(bps)}
          >
            {(bps / 100).toFixed(1)}% slippage
          </button>
        ))}
      </div>
      <dl className="quote-list">
        <div>
          <dt>PRICE</dt>
          <dd>{formatEth(token.curveState.currentPrice, 12)} / token{onCurve ? '' : ' (last curve price)'}</dd>
        </div>
        <div>
          <dt>YOU RECEIVE (QUOTE)</dt>
          <dd>{expectedOut !== null ? format(expectedOut) : hasAmount && !quoteFailed ? 'Reading…' : '—'}</dd>
        </div>
        <div>
          <dt>MINIMUM RECEIVED</dt>
          <dd>{minOut !== null ? format(minOut) : '—'}</dd>
        </div>
        {ethUsed !== null && hasAmount && ethUsed < amount && (
          <div>
            <dt>ETH USED</dt>
            <dd>{formatEth(ethUsed)} · rest is refunded at the threshold</dd>
          </div>
        )}
        <div>
          <dt>YOUR BALANCE</dt>
          <dd>
            {balance === undefined
              ? account
                ? 'Reading…'
                : 'Wallet not connected'
              : side === 'buy'
                ? formatEth(balance)
                : `${formatTokens(balance)} $${token.symbol}`}
          </dd>
        </div>
        <div>
          <dt>FEE</dt>
          <dd>{onCurve ? 'No curve fee' : '0.3% pool fee'}</dd>
        </div>
      </dl>
      <div id="tradeProblem" className="error-msg" aria-live="polite">
        {problem}
      </div>
      <NetworkGuard chain={homeChain}>
        <button className="btn primary" type="button" onClick={submit} disabled={!canSubmit}>
          {tx.state.phase === 'wallet' ? 'Confirm in wallet…' : tx.state.phase === 'pending' ? 'Pending…' : actionLabel}{' '}
          <span className="arr">↗</span>
        </button>
      </NetworkGuard>
      <TxStatus state={tx.state} chain={homeChain} />
    </div>
  );
}
