import 'server-only';

import { apiOk } from '@/lib/api-error';
import { requireCron, requireTokenService, tokenErrorResponse } from '@/lib/tokens/http';

// POST /api/cron/index-events — mengindeks token baru dan trade curve sampai blok terakhir
// (kursor blok), lalu mengisi waktu blok trade lama yang masih kosong. Hanya membaca chain dan
// menulis index; tidak pernah menandatangani transaksi.

// Jatah blok per panggilan cron: lebih besar daripada putaran yang didorong polling halaman.
const CRON_BACKFILL_BLOCKS = 200;

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;
  const service = requireTokenService();
  if (service instanceof Response) return service;
  try {
    const indexed = await service.sync();
    const blockTimes = await service.backfillTimes(undefined, CRON_BACKFILL_BLOCKS);
    return apiOk({ indexed, blockTimes, index: { backend: service.backend } });
  } catch (error) {
    return tokenErrorResponse(error);
  }
}
