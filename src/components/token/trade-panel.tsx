'use client';

import { useState } from 'react';
import { zeroAddress } from 'viem';
import { useBalance, useConnection, useReadContract, useSimulateContract } from 'wagmi';
import { getChain } from '@/lib/chains';
import { cn } from '@/lib/cn';
import { formatEth, formatTokens, parseAmount } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';
import { v4QuoterAbi } from '@/lib/web3/abi/uniswap-v4';
import { curveAbi, tokenAbi } from '@/lib/web3/abi/xofn';
import type { LocalUniswapV4 } from '@/lib/web3/addresses';
import { buildApprove, buildBuy, buildSell } from '@/lib/web3/curve-trade';
import { knownRevertMessage } from '@/lib/web3/decode-revert';
import {
  buildPoolBuy,
  buildPoolSell,
  isXofnPoolKey,
  MAX_UINT128,
  poolIdOf,
  priceFromSqrtX96,
} from '@/lib/web3/pool-trade';
import { applySlippage, DEFAULT_SLIPPAGE_BPS, type TxRequest } from '@/lib/web3/tx';
import { useTxFlow } from '@/lib/web3/use-tx-flow';
import { TxStatus } from '@/components/ui/tx-status';
import { NetworkGuard } from '@/components/wallet/network-guard';
import type { Address, TokenDetail } from '@/types/domain';
import type { ChainKey, TradeSide } from '@/types/enums';

const SLIPPAGE_CHOICES = [50, 100, 300] as const;

// Quote dibaca ulang seirama dengan data token (4 detik) dan tidak disimpan setelah tidak
// dipakai. Tanpa ini harga di panel terus diperbarui sementara quote dan batas minimum di
// sebelahnya tetap angka lama, dan mengetik ulang jumlah yang sama menampilkan quote sebelum
// trade terakhir.
const LIVE_QUOTE = { refetchInterval: 4_000, staleTime: 0, gcTime: 0 } as const;

interface TradePanelProps {
  token: TokenDetail;
  homeChain: ChainKey;
  /**
   * Uniswap v4 lokal (router uji + quoter; hanya manifest Anvil). null → trading pool belum
   * tersedia di UI untuk jaringan ini (PRD P59).
   */
  poolVenue: LocalUniswapV4 | null;
}

// Trading (USER_FLOWS Flow E): di bonding curve sebelum graduation, di pool Uniswap v4 home
// sesudahnya. Quote SELALU dibaca dari kontrak (curve atau V4Quoter); batas minimum dihitung dari
// slippage pilihan pengguna dan dipaksakan on-chain di kedua tempat.
export function TradePanel({ token, homeChain, poolVenue }: TradePanelProps) {
  const chainId = getChain(publicEnv.network, homeChain).chainId;
  const onCurve = token.graduatorStatus === 'bonding';
  // Alamat yang menerima transaksi (dan approve saat menjual): curve, atau router uji pool.
  const venue: Address | null = onCurve ? token.curve : (poolVenue?.swapRouter ?? null);
  // PoolKey datang dari respons API, yang hanya cache. Sebelum dipakai untuk mengirim dana, klien
  // mencocokkannya sendiri: pasangan ETH/token ini, PoolId yang dicatat Graduator, dan hook
  // penjaga dari manifest. Bila tidak cocok, pool dianggap tidak terbaca.
  const statedKey = token.poolState?.key ?? null;
  const poolKey =
    statedKey &&
    poolVenue &&
    isXofnPoolKey(statedKey, token.address) &&
    statedKey.hooks.toLowerCase() === poolVenue.poolGuard &&
    poolIdOf(statedKey).toLowerCase() === token.pool?.toLowerCase()
      ? statedKey
      : null;
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
    query: { enabled: onCurve && side === 'buy' && hasAmount, ...LIVE_QUOTE },
  });
  const quoteSell = useReadContract({
    address: token.curve,
    abi: curveAbi,
    functionName: 'quoteSell',
    args: hasAmount ? [amount] : undefined,
    chainId,
    query: { enabled: onCurve && side === 'sell' && hasAmount, ...LIVE_QUOTE },
  });
  // V4Quoter menjalankan swap sungguhan lalu revert, jadi dibaca lewat simulasi, bukan `view`.
  const poolQuoteReady = !onCurve && !!poolVenue && !!poolKey && hasAmount && amount <= MAX_UINT128;
  const quotePool = useSimulateContract({
    // Hook simulasi wagmi hanya berjalan bila ada akun. Quote tidak bergantung pada pemanggil,
    // jadi tanpa wallet disimulasikan dari alamat nol: harga tetap terbaca sebelum connect, sama
    // seperti quote di curve.
    account: account ?? zeroAddress,
    address: poolVenue?.quoter,
    abi: v4QuoterAbi,
    functionName: 'quoteExactInputSingle',
    // ETH adalah currency0: membeli token = zeroForOne.
    args:
      poolQuoteReady && poolKey
        ? [{ poolKey, zeroForOne: side === 'buy', exactAmount: amount, hookData: '0x' }]
        : undefined,
    chainId,
    query: { enabled: poolQuoteReady, ...LIVE_QUOTE },
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

  if (!onCurve && !poolKey) {
    return (
      <div className="app-panel">
        <h2>Trade</h2>
        <p>Pool state could not be read. No price is assumed.</p>
      </div>
    );
  }

  // Quote: curve dan pool sama-sama membacanya dari kontrak.
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
    } else {
      if (quotePool.data) expectedOut = quotePool.data.result[0];
      quoteFailed = quotePool.isError;
    }
  }
  const minOut = expectedOut !== null ? applySlippage(expectedOut, slippageBps) : null;
  // Di luar uint128 quote tidak pernah diminta: itu batas jumlah di Uniswap v4, bukan gagal baca.
  const tooLarge = !onCurve && hasAmount && amount > MAX_UINT128;
  // Jawaban kontrak (mis. likuiditas tidak cukup) dibedakan dari pembacaan yang gagal.
  const quoteRevert = !onCurve && quotePool.error ? knownRevertMessage(quotePool.error) : null;

  const balance = side === 'buy' ? ethBalance.data?.value : tokenBalance.data;
  const insufficient = hasAmount && balance !== undefined && amount > balance;
  // Allowance yang belum terbaca tidak dianggap cukup: tanpa ini tombolnya langsung "Sell" dan
  // transaksinya gagal di transferFrom dengan pesan yang tidak menjelaskan apa-apa.
  const allowanceUnread = side === 'sell' && hasAmount && !!account && allowance.data === undefined;
  const needsApproval =
    side === 'sell' && hasAmount && allowance.data !== undefined && allowance.data < amount;
  // Hasil nol tidak pernah dikirim: curve menolaknya, dan di pool itu berarti jumlahnya debu.
  const zeroOut = hasAmount && expectedOut !== null && expectedOut === 0n;

  let problem: string | null = null;
  if (amountText.trim() !== '' && !hasAmount) problem = 'Enter an amount greater than zero.';
  else if (tooLarge) problem = 'This amount is too large for the pool.';
  else if (insufficient) problem = 'Balance is too low for this amount.';
  else if (quoteFailed) problem = quoteRevert ?? 'Quote could not be read. No price is assumed.';
  else if (zeroOut) problem = 'This amount is too small to trade.';
  else if (allowanceUnread) {
    problem = allowance.isError ? 'Token allowance could not be read.' : 'Reading token allowance…';
  }

  const canSubmit = hasAmount && !problem && expectedOut !== null && minOut !== null && !tx.busy;

  const submit = async () => {
    if (!account || !hasAmount || minOut === null) return;
    let request: TxRequest;
    if (needsApproval) {
      request = buildApprove(homeChain, token.address, venue, amount);
    } else if (onCurve) {
      request = side === 'buy' ? buildBuy(homeChain, venue, amount, minOut) : buildSell(homeChain, venue, amount, minOut);
    } else {
      if (!poolKey) return;
      request =
        side === 'buy'
          ? buildPoolBuy(homeChain, venue, poolKey, amount, minOut)
          : buildPoolSell(homeChain, venue, poolKey, amount, minOut);
    }
    const receipt = await tx.run(request);
    if (!receipt) return;
    void allowance.refetch();
    void tokenBalance.refetch();
    void ethBalance.refetch();
    // Harga pool berubah oleh trade ini; quote lama tidak boleh tampil lagi.
    if (!onCurve) void quotePool.refetch();
    if (!needsApproval) setAmountText('');
  };

  const outUnit = side === 'buy' ? `$${token.symbol}` : 'ETH';
  const format = (value: bigint) => (side === 'buy' ? `${formatTokens(value)} ${outUnit}` : formatEth(value));
  const actionLabel = needsApproval ? `Approve $${token.symbol}` : side === 'buy' ? 'Buy' : 'Sell';
  // Di cabang pool `poolState` pasti ada: tanpa PoolKey yang cocok panel sudah berhenti di atas.
  const poolState = onCurve ? null : token.poolState;
  const price = poolState ? priceFromSqrtX96(BigInt(poolState.sqrtPriceX96)) : token.curveState.currentPrice;
  // Fee LP dalam pip (1e-6): 3000 → 0.30%. Fee protokol Uniswap (0 di node lokal) tidak termasuk.
  const poolFee = poolState ? `${(poolState.lpFee / 10_000).toFixed(2)}% pool fee` : 'n/a';

  return (
    <div className="app-panel">
      <h2>{onCurve ? 'Trade on the bonding curve' : 'Trade in the pool'}</h2>
      {!onCurve && (
        <p className="guard-note">
          SIMULATION · Uniswap v4 pool on a local test node, traded through a test router. The
          minimum received below is enforced on-chain.
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
          <dd>{formatEth(price, 12)} / token{onCurve ? '' : ' (pool)'}</dd>
        </div>
        <div>
          <dt>YOU RECEIVE (QUOTE)</dt>
          <dd>{expectedOut !== null ? format(expectedOut) : hasAmount && !quoteFailed ? 'Reading…' : 'n/a'}</dd>
        </div>
        <div>
          <dt>MINIMUM RECEIVED</dt>
          <dd>{minOut !== null ? format(minOut) : 'n/a'}</dd>
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
          <dd>{onCurve ? 'No curve fee' : poolFee}</dd>
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
