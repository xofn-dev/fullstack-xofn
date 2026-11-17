import type { Abi } from 'viem';
import type { Address } from '@/lib/chains';
import type { ChainKey } from '@/types/enums';

/**
 * Satu transaksi yang akan ditandatangani di wallet pengguna. Builder di folder ini murni
 * (tanpa wallet, tanpa jaringan) supaya bisa diuji; server tidak pernah menandatangani apa pun.
 */
export interface TxRequest {
  /** Chain tempat transaksi dikirim; NetworkGuard memakai ini (USER_FLOWS Flow B). */
  chain: ChainKey;
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
  /**
   * Batas gas eksplisit. Diisi hanya bila estimasi otomatis tidak bisa dipercaya: kontrak yang
   * menelan kegagalan internal dengan try/catch membuat estimasi memilih batas yang terlalu ketat.
   */
  gas?: bigint;
}

const BPS = 10_000n;

/** Batas bawah yang diterima setelah slippage (basis poin). */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(slippageBps))));
  return (amount * (BPS - bps)) / BPS;
}

export const DEFAULT_SLIPPAGE_BPS = 100;
