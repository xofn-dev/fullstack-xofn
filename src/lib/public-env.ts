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

export const publicEnv = {
  network: parseNetwork(process.env.NEXT_PUBLIC_XOFN_NETWORK),
  siteUrl: parseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
} as const;
