import type { Address } from '@/lib/chains';
import { localRelayAbi } from '@/lib/web3/abi/local';
import type { TxRequest } from '@/lib/web3/tx';
import type { ChainKey } from '@/types/enums';

// HANYA simulasi lokal: pesan lintas chain di Anvil menunggu di `LocalRelay` sampai seseorang
// memanggil `deliverNext()`. Di jaringan nyata DVN dan executor yang mengantar pesan.
//
// Batas gas ditetapkan eksplisit. Pengantaran menjalankan `lzReceive`/`lzCompose` kontrak XofN,
// yang mengirim ack atau likuiditas di dalam try/catch. Estimasi gas otomatis mencari batas
// terendah yang tidak revert, dan batas itu tercapai justru saat langkah di dalam try/catch
// kehabisan gas dan ditelan (`AckDeferred` / `LiquidityDeferred`). Dengan batas longgar langkah
// itu berjalan penuh. Di jaringan nyata executor memakai gas dari opsi pesan, bukan estimasi.
export const RELAY_DELIVERY_GAS = 15_000_000n;

export function buildDeliverNext(chain: ChainKey, relay: Address): TxRequest {
  return {
    chain,
    address: relay,
    abi: localRelayAbi,
    functionName: 'deliverNext',
    args: [],
    gas: RELAY_DELIVERY_GAS,
  };
}
