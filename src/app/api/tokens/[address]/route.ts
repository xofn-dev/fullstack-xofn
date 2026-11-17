import 'server-only';

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
    return apiOk({ token: await service.detail(parseTokenAddress(address)) });
  } catch (error) {
    return tokenErrorResponse(error);
  }
}
