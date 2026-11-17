import { pad } from 'viem';
import type { Address } from '@/lib/chains';
import { tokenAbi } from '@/lib/web3/abi/xofn';
import type { TxRequest } from '@/lib/web3/tx';
import type { ChainKey } from '@/types/enums';

// Bridge OFT (USER_FLOWS Flow H). Shared decimals 6: jumlah di bawah 0,000001 token tidak ikut
// terkirim dan tetap di wallet pengirim (PRD §5.8).

/** Memisahkan jumlah yang bisa dikirim dari dust. `rate` = `decimalConversionRate()` (1e12). */
export function splitDust(amount: bigint, rate: bigint): { sendable: bigint; dust: bigint } {
  if (rate <= 0n) return { sendable: amount, dust: 0n };
  const dust = amount % rate;
  return { sendable: amount - dust, dust };
}

export interface BridgeHop {
  from: ChainKey;
  to: ChainKey;
}

/** Topologi hub (PRD P29): antar chain ekspansi selalu dua langkah lewat home. */
export function bridgeRoute(from: ChainKey, to: ChainKey, home: ChainKey): BridgeHop[] {
  if (from === to) return [];
  if (from === home || to === home) return [{ from, to }];
  return [
    { from, to: home },
    { from: home, to },
  ];
}

export interface SendParam {
  dstEid: number;
  to: `0x${string}`;
  amountLD: bigint;
  minAmountLD: bigint;
  extraOptions: `0x${string}`;
  composeMsg: `0x${string}`;
  oftCmd: `0x${string}`;
}

/** Enforced options sudah terpasang oleh recipe tier, jadi `extraOptions` kosong. */
export function buildSendParam(dstEid: number, recipient: Address, sendable: bigint): SendParam {
  return {
    dstEid,
    to: pad(recipient, { size: 32 }),
    amountLD: sendable,
    minAmountLD: sendable,
    extraOptions: '0x',
    composeMsg: '0x',
    oftCmd: '0x',
  };
}

export function buildBridgeSend(
  chain: ChainKey,
  token: Address,
  param: SendParam,
  nativeFee: bigint,
  refundTo: Address,
): TxRequest {
  return {
    chain,
    address: token,
    abi: tokenAbi,
    functionName: 'send',
    args: [param, { nativeFee, lzTokenFee: 0n }, refundTo],
    value: nativeFee,
  };
}
