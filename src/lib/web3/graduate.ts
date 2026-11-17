import type { Address } from '@/lib/chains';
import { graduatorAbi } from '@/lib/web3/abi/xofn';
import type { HomeContracts } from '@/lib/web3/addresses';
import type { TxRequest } from '@/lib/web3/tx';

// Tahap 1: siapa pun boleh memanggil `graduate(token)` setelah ambang tercapai (Flow F.1).
// Owner dan delegate token TETAP Graduator; tidak ada renounce di sini.
export function buildGraduate(home: HomeContracts, token: Address): TxRequest {
  return { chain: home.chain.chain, address: home.graduator, abi: graduatorAbi, functionName: 'graduate', args: [token] };
}
