import 'server-only';

import { apiOk } from '@/lib/api-error';
import { requireCron, requireTokenService, tokenErrorResponse } from '@/lib/tokens/http';

// POST /api/cron/index-events — mengindeks token baru dan trade curve sampai blok terakhir
// (kursor blok). Hanya membaca chain dan menulis index; tidak pernah menandatangani transaksi.

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;
  const service = requireTokenService();
  if (service instanceof Response) return service;
  try {
    return apiOk({ indexed: await service.sync(), index: { backend: service.backend } });
  } catch (error) {
    return tokenErrorResponse(error);
  }
}
