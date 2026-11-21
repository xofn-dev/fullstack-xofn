import 'server-only';

import { after } from 'next/server';
import { apiOk } from '@/lib/api-error';
import { parseTokenAddress } from '@/lib/tokens';
import { requireTokenService, tokenErrorResponse } from '@/lib/tokens/http';

// GET /api/tokens/[address]
// Status lifecycle, tier, langkah ekspansi per EID, supply per chain, dan verify() per chain
// untuk satu token XofN. Semuanya pembacaan chain; yang gagal dibaca ditandai `unread`.

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }) {
  const { address } = await context.params;
  const service = requireTokenService();
  if (service instanceof Response) return service;
  try {
    const parsed = parseTokenAddress(address);
    const token = await service.detail(parsed);
    // Waktu blok trade lama diisi SETELAH respons dikirim; polling halaman token yang
    // mendorongnya maju. Tidak pernah menunda jawaban ini.
    after(() => service.backfillTimes(parsed));
    return apiOk({ token });
  } catch (error) {
    return tokenErrorResponse(error);
  }
}
