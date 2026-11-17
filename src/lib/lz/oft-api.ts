import 'server-only';

// Klien OFT API LayerZero (endpoint /list, gratis tanpa key). Hanya PELENGKAP: daftar deployment
// bukan daftar peer, dan API ini tidak memuat Robinhood (proof/2026-11-17-phase0/07-oft-api-rpc.md).
// Kegagalan API tidak pernah menggagalkan Check; hasilnya null dan ditampilkan sebagai "not read".

const OFT_API_LIST = 'https://metadata.layerzero-api.com/v1/metadata/experiment/ofts/list';
const TIMEOUT_MS = 3500;

interface OftApiDeployment {
  address?: string;
}

interface OftApiEntry {
  deployments?: Record<string, OftApiDeployment | null>;
}

/**
 * Nama chain lain tempat OFT ini tercatat, di luar chain yang dibaca Check.
 * null = API tidak terbaca atau token tidak tercatat.
 */
export async function listOtherDeployments(
  address: string,
  readChainNames: readonly string[],
): Promise<string[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${OFT_API_LIST}?contractAddresses=${encodeURIComponent(address)}`;
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') return null;
    const target = address.toLowerCase();
    const names = new Set<string>();
    for (const entries of Object.values(data as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries as OftApiEntry[]) {
        const deployments = entry.deployments ?? {};
        const matches = Object.values(deployments).some(
          (deployment) => deployment?.address?.toLowerCase() === target,
        );
        if (!matches) continue;
        for (const name of Object.keys(deployments)) {
          if (deployments[name] && !readChainNames.includes(name)) names.add(name);
        }
      }
    }
    return names.size > 0 ? [...names].sort() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
