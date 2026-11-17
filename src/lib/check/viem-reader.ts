import 'server-only';

import { createPublicClient, http, type ContractFunctionParameters } from 'viem';
import { MULTICALL3_ADDRESS } from '@/lib/lz/abi';
import type { CallResult, ChainReader, ContractCall } from '@/lib/check/read';

const RPC_TIMEOUT_MS = 12_000;

// Pembaca chain berbasis viem. Hanya eth_call / eth_getCode / eth_getStorageAt:
// tidak ada wallet client, tidak ada key, tidak ada transaksi.
export function createViemReader(rpcUrl: string): ChainReader {
  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: 1 }),
  });
  return {
    getCode: (address) => client.getCode({ address }),
    getStorageAt: (address, slot) => client.getStorageAt({ address, slot }),
    getBlockNumber: () => client.getBlockNumber(),
    async multicall(calls: ContractCall[]): Promise<CallResult[]> {
      const results = await client.multicall({
        contracts: calls as unknown as readonly ContractFunctionParameters[],
        allowFailure: true,
        multicallAddress: MULTICALL3_ADDRESS,
      });
      return results.map((item) =>
        item.status === 'success'
          ? { status: 'success', result: item.result }
          : { status: 'failure', error: item.error.message.split('\n')[0] ?? 'call failed' },
      );
    },
  };
}
