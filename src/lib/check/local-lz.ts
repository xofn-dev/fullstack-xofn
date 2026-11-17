import { getChain, type ChainInfo, type LzAddresses } from '@/lib/chains';
import { getDeployment } from '@/lib/web3/addresses';
import type { ChainKey, Network } from '@/types/enums';

const NO_DEAD_DVN = '0x0000000000000000000000000000000000000000';

/**
 * Alamat LayerZero untuk Check. Jaringan publik: dari registry chain (terverifikasi Phase 0).
 * Jaringan lokal: endpoint TIRUAN dari manifest Anvil; di sana tidak ada Dead DVN.
 */
export function checkLzAddresses(network: Network, chain: ChainKey): LzAddresses | null {
  const info = getChain(network, chain);
  if (info.lz) return info.lz;
  if (network !== 'local') return null;
  const deployment = getDeployment(network);
  if (!deployment) return null;
  return { endpointV2: deployment.chains[chain].endpointV2, deadDvn: NO_DEAD_DVN };
}

/** ChainInfo dengan `lz` terisi untuk dibaca Check; null bila chain ini tidak bisa dibaca. */
export function checkChain(network: Network, chain: ChainKey): ChainInfo | null {
  const lz = checkLzAddresses(network, chain);
  return lz ? { ...getChain(network, chain), lz } : null;
}
