import 'server-only';

import { apiOk } from '@/lib/api-error';
import { requireCron, requireTokenService, tokenErrorResponse } from '@/lib/tokens/http';

// POST /api/cron/recheck — membaca ulang status semua token dari chain (PRD P20) dan memperbarui
// cache status. Token yang tercatat Locked tetapi verify()-nya false dilaporkan sebagai Changed.

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;
  const service = requireTokenService();
  if (service instanceof Response) return service;
  try {
    const tokens = await service.list('all');
    return apiOk({
      checked: tokens.length,
      changed: tokens.filter((token) => token.status === 'changed').map((token) => token.address),
      unread: tokens.filter((token) => token.status === 'unread').map((token) => token.address),
    });
  } catch (error) {
    return tokenErrorResponse(error);
  }
}
