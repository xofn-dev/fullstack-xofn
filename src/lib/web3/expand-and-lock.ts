import type { Address } from '@/lib/chains';
import { graduatorAbi } from '@/lib/web3/abi/xofn';
import type { HomeContracts } from '@/lib/web3/addresses';
import type { TxRequest } from '@/lib/web3/tx';

// Tahap 2: `expandAndLock(token)` (Flow F.2). Pemanggil membayar fee LayerZero dari quote.
// `msg.value` wajib menutup pesan DEPLOY; sisanya menjadi escrow kirim likuiditas per chain.
export function buildExpandAndLock(home: HomeContracts, token: Address, value: bigint): TxRequest {
  return {
    chain: home.chain.chain,
    address: home.graduator,
    abi: graduatorAbi,
    functionName: 'expandAndLock',
    args: [token],
    value,
  };
}

/** Nilai yang dikirim: fee deploy + perkiraan fee likuiditas (sama dengan tes Phase 3). */
export function expandValue(quote: { deployFees: bigint; liquidityFees: bigint }): bigint {
  return quote.deployFees + quote.liquidityFees;
}
