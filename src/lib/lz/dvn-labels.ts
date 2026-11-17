import labels from '../../../config/dvn-labels.json';
import type { Address, DvnInfo } from '@/types/domain';
import type { ChainKey, Network } from '@/types/enums';

// Loader config/dvn-labels.json: peta (chain, alamat DVN) → operator + flag deprecated.
// Label dikunci per chain, karena alamat yang sama bisa dimiliki operator berbeda di chain lain
// (contoh Phase 0: 0xa7b5…0d99 = Horizen di Base, Twinstake di Arbitrum).

interface LabelRow {
  address: string;
  operatorId: string;
  operator: string;
  deprecated: boolean;
}

type LabelSet = Record<ChainKey, LabelRow[]>;

const SETS: Partial<Record<Network, LabelSet>> = {
  mainnet: labels.mainnet,
  testnet: labels.testnet,
};

const indexCache = new Map<string, Map<string, LabelRow>>();

function indexFor(network: Network, chain: ChainKey): Map<string, LabelRow> {
  const key = `${network}:${chain}`;
  let index = indexCache.get(key);
  if (!index) {
    index = new Map((SETS[network]?.[chain] ?? []).map((row) => [row.address.toLowerCase(), row]));
    indexCache.set(key, index);
  }
  return index;
}

export function describeDvn(
  network: Network,
  chain: ChainKey,
  address: Address,
  deadDvn: string | null,
): DvnInfo {
  const row = indexFor(network, chain).get(address.toLowerCase());
  return {
    address,
    operator: row?.operator ?? null,
    deprecated: row?.deprecated ?? false,
    isDead: deadDvn !== null && address.toLowerCase() === deadDvn.toLowerCase(),
  };
}

export const DVN_LABELS_SOURCE = {
  sourceUrl: labels.sourceUrl,
  verifiedAt: labels.verifiedAt,
} as const;

/** Alias key tiers.json versi guide → id operator metadata LayerZero (ARCHITECTURE §5.2). */
export const DVN_OPERATOR_ALIASES: Record<string, string> = labels.aliases;
