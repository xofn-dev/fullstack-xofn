import type { Address } from '@/lib/chains';
import { mockRouterAbi } from '@/lib/web3/abi/local';
import type { TxRequest } from '@/lib/web3/tx';
import type { ChainKey } from '@/types/enums';

// Trading di pool home setelah graduation (USER_FLOWS Flow E). Di Anvil pool-nya AMM TIRUAN
// (`MockV2Router`) yang tidak punya `amountOutMin` maupun deadline, jadi tidak ada batas slippage
// on-chain di mode simulation. Adapter Uniswap Router02 untuk jaringan publik belum ada.

const FEE_NUMERATOR = 997n;
const FEE_DENOMINATOR = 1000n;

/** Rumus Uniswap v2 (fee 0,3%), sama dengan `MockV2Router.getAmountOut`. */
export function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const withFee = amountIn * FEE_NUMERATOR;
  return (withFee * reserveOut) / (reserveIn * FEE_DENOMINATOR + withFee);
}

export function buildPoolBuy(chain: ChainKey, router: Address, token: Address, to: Address, ethIn: bigint): TxRequest {
  return {
    chain,
    address: router,
    abi: mockRouterAbi,
    functionName: 'swapExactETHForTokens',
    args: [token, to],
    value: ethIn,
  };
}

export function buildPoolSell(chain: ChainKey, router: Address, token: Address, to: Address, tokensIn: bigint): TxRequest {
  return {
    chain,
    address: router,
    abi: mockRouterAbi,
    functionName: 'swapExactTokensForETH',
    args: [token, tokensIn, to],
  };
}
