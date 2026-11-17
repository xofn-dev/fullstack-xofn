import type { Address } from '@/lib/chains';
import { curveAbi, tokenAbi } from '@/lib/web3/abi/xofn';
import type { TxRequest } from '@/lib/web3/tx';
import type { ChainKey } from '@/types/enums';

// Trading di bonding curve (USER_FLOWS Flow E). Pembayaran memakai ETH native; curve tidak punya
// fee maupun deadline, hanya batas minimum yang diterima.

export function buildBuy(chain: ChainKey, curve: Address, ethIn: bigint, minTokensOut: bigint): TxRequest {
  return { chain, address: curve, abi: curveAbi, functionName: 'buy', args: [minTokensOut], value: ethIn };
}

export function buildSell(chain: ChainKey, curve: Address, tokensIn: bigint, minEthOut: bigint): TxRequest {
  return { chain, address: curve, abi: curveAbi, functionName: 'sell', args: [tokensIn, minEthOut] };
}

/** `sell` menarik token lewat transferFrom, jadi butuh approve lebih dulu. */
export function buildApprove(chain: ChainKey, token: Address, spender: Address, amount: bigint): TxRequest {
  return { chain, address: token, abi: tokenAbi, functionName: 'approve', args: [spender, amount] };
}

/**
 * Harga curve (wei per token) setelah `ethRaised` tertentu, dihitung dari cadangan virtual.
 * Sama dengan `XofNCurve.currentPrice()`: (V0 + raised) * 1e18 / (Y0 - sold), dengan
 * sold = Y0 - ceil(V0*Y0 / (V0 + raised)) dibatasi saleSupply.
 */
export function priceAtRaised(params: {
  virtualEth: bigint;
  virtualTokens: bigint;
  saleSupply: bigint;
  ethRaised: bigint;
}): bigint {
  const { virtualEth, virtualTokens, saleSupply, ethRaised } = params;
  const reserveEth = virtualEth + ethRaised;
  if (reserveEth === 0n) return 0n;
  const k = virtualEth * virtualTokens;
  const remaining = (k + reserveEth - 1n) / reserveEth;
  let sold = virtualTokens - remaining;
  if (sold > saleSupply) sold = saleSupply;
  const left = virtualTokens - sold;
  return left === 0n ? 0n : (reserveEth * 10n ** 18n) / left;
}

export function progressBps(ethRaised: bigint, threshold: bigint): number {
  if (threshold === 0n) return 0;
  const bps = (ethRaised * 10_000n) / threshold;
  return Number(bps > 10_000n ? 10_000n : bps);
}
