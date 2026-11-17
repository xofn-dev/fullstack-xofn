import type { Address } from '@/lib/chains';
import { graduatorAbi, remoteAbi, endpointComposeAbi } from '@/lib/web3/abi/xofn';
import type { ChainDeployment, HomeContracts } from '@/lib/web3/addresses';
import type { TxRequest } from '@/lib/web3/tx';

// Pengulangan langkah ekspansi per chain (PRD P14: siapa pun boleh, pemanggil membayar).

/** Dari home: kirim ulang DEPLOY (langkah DeploySent) atau likuiditas (langkah Configured). */
export function buildRetryRemote(home: HomeContracts, token: Address, eid: number, value: bigint): TxRequest {
  return {
    chain: home.chain.chain,
    address: home.graduator,
    abi: graduatorAbi,
    functionName: 'retryRemote',
    args: [token, eid],
    value,
  };
}

/** Dari chain ekspansi: kirim ulang ack ke home bila ack otomatis tertunda. */
export function buildReAck(remote: ChainDeployment, homeToken: Address, value: bigint): TxRequest | null {
  if (!remote.remote) return null;
  return {
    chain: remote.chain,
    address: remote.remote,
    abi: remoteAbi,
    functionName: 'reAck',
    args: [homeToken],
    value,
  };
}

export interface PendingCompose {
  from: Address;
  to: Address;
  guid: `0x${string}`;
  index: number;
  message: `0x${string}`;
}

/**
 * "retryCompose": menjalankan ulang `lzCompose` di endpoint chain tujuan. `value` harus menutup
 * ETH pasangan pool yang diminta pesan compose (`XofNRemote.lzCompose`).
 */
export function buildRetryCompose(remote: ChainDeployment, compose: PendingCompose, value: bigint): TxRequest {
  return {
    chain: remote.chain,
    address: remote.endpointV2,
    abi: endpointComposeAbi,
    functionName: 'lzCompose',
    args: [compose.from, compose.to, compose.guid, compose.index, compose.message, '0x'],
    value,
  };
}
