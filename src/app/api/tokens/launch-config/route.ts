import 'server-only';

import { apiError, apiOk } from '@/lib/api-error';
import { getLaunchConfig } from '@/lib/tokens';
import { requireTokenService } from '@/lib/tokens/http';

// GET /api/tokens/launch-config
// Yang dibutuhkan form launch: gerbang registrar, ketersediaan tier per chain, ambang graduation.
// Publik dan read-only; dibaca dari chain saat diminta. Form memakainya untuk tetap mutakhir
// tanpa memuat ulang halaman.

export const dynamic = 'force-dynamic';

export async function GET() {
  const service = requireTokenService();
  if (service instanceof Response) return service;
  const config = await getLaunchConfig();
  if (!config) {
    return apiError('rpc_failed', 'Launch settings could not be read from the chain. Nothing is assumed.', 502);
  }
  return apiOk({ config });
}
