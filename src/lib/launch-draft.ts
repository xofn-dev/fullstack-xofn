import { CHAIN_KEYS, type ChainKey, type Tier } from '@/types/enums';

/**
 * Draft launch yang dibawa dari form pratinjau di landing ke halaman /launch lewat query string,
 * supaya pengguna tidak mengisi ulang. Draft hanya mengisi nilai awal form: validasi tetap
 * dilakukan form /launch dan kontrak, jadi nilai di sini tidak pernah dipercaya.
 */
export interface LaunchDraft {
  name?: string;
  ticker?: string;
  tier?: Tier;
  /** undefined = parameter tidak ada (form memakai default: semua chain ekspansi). */
  chains?: ChainKey[];
}

// Batas panjang hanya agar URL buatan tangan tidak membengkakkan form; aturan sebenarnya
// (nama ≤ 32 byte, ticker 2–12 alfanumerik) tetap diperiksa form /launch.
const MAX_NAME_CHARS = 64;
const MAX_TICKER_CHARS = 12;

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function launchDraftQuery(draft: Required<LaunchDraft>): string {
  const params = new URLSearchParams({
    name: draft.name,
    ticker: draft.ticker,
    tier: draft.tier,
    chains: draft.chains.join(','),
  });
  return params.toString();
}

/** Membaca draft dari searchParams. Nilai yang tidak dikenal dibuang, bukan ditebak. */
export function parseLaunchDraft(params: SearchParams, allowedChains: readonly ChainKey[]): LaunchDraft {
  const draft: LaunchDraft = {};
  const name = first(params.name)?.trim();
  if (name) draft.name = name.slice(0, MAX_NAME_CHARS);
  const ticker = first(params.ticker)?.trim();
  if (ticker) draft.ticker = ticker.slice(0, MAX_TICKER_CHARS);
  const tier = first(params.tier);
  if (tier === 'standard' || tier === 'fortress') draft.tier = tier;
  const chains = first(params.chains);
  if (chains !== undefined) {
    const known = new Set<string>(CHAIN_KEYS);
    draft.chains = [
      ...new Set(
        chains
          .split(',')
          .filter((key): key is ChainKey => known.has(key) && allowedChains.includes(key as ChainKey)),
      ),
    ];
  }
  return draft;
}
