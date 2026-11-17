import { NETWORKS, type Network } from '@/types/enums';

// Satu-satunya pembaca env publik. Next hanya meng-inline `process.env.NEXT_PUBLIC_*`
// yang ditulis literal, jadi setiap variabel dibaca eksplisit di sini (bukan lewat nama dinamis).

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

// Diekspor untuk tes: validasi murni tanpa menyentuh process.env.
export function parseNetwork(value: string | undefined): Network {
  if (value === undefined || value === '') {
    throw new EnvError(
      'NEXT_PUBLIC_XOFN_NETWORK belum diisi. Nilai yang sah: local | testnet | mainnet.',
    );
  }
  if (!(NETWORKS as readonly string[]).includes(value)) {
    throw new EnvError(
      `NEXT_PUBLIC_XOFN_NETWORK="${value}" tidak dikenal. Nilai yang sah: local | testnet | mainnet.`,
    );
  }
  return value as Network;
}

export function parseSiteUrl(value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new EnvError('NEXT_PUBLIC_SITE_URL belum diisi (URL absolut, mis. http://localhost:3000).');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EnvError(`NEXT_PUBLIC_SITE_URL="${value}" bukan URL absolut yang sah.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EnvError('NEXT_PUBLIC_SITE_URL harus memakai http atau https.');
  }
  return url.origin;
}

/** Variabel opsional: kosong berarti null, dan pemanggil memutuskan secara eksplisit. */
export function parseOptional(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

/** RPC opsional per chain. Bila diisi harus URL http(s); nilai rusak melempar error, tidak diabaikan. */
export function parseOptionalRpc(name: string, value: string | undefined): string | null {
  const raw = parseOptional(value);
  if (raw === null) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EnvError(`${name} bukan URL yang sah.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EnvError(`${name} harus memakai http atau https.`);
  }
  return raw;
}

export const publicEnv = {
  network: parseNetwork(process.env.NEXT_PUBLIC_XOFN_NETWORK),
  siteUrl: parseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  /** Project ID WalletConnect untuk AppKit. Kosong → AppKit tidak dibuat (ARCHITECTURE §10.2). */
  walletConnectProjectId: parseOptional(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID),
  /** RPC aplikasi per chain (opsional). Bila kosong dipakai `publicRpc` dari registry chain. */
  rpc: {
    robinhood: parseOptionalRpc('NEXT_PUBLIC_RPC_ROBINHOOD', process.env.NEXT_PUBLIC_RPC_ROBINHOOD),
    base: parseOptionalRpc('NEXT_PUBLIC_RPC_BASE', process.env.NEXT_PUBLIC_RPC_BASE),
    arbitrum: parseOptionalRpc('NEXT_PUBLIC_RPC_ARBITRUM', process.env.NEXT_PUBLIC_RPC_ARBITRUM),
  },
} as const;
