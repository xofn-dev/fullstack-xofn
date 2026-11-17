import 'server-only';

import type { NextRequest } from 'next/server';
import { apiError, apiOk } from '@/lib/api-error';
import { requireTokenService, tokenErrorResponse } from '@/lib/tokens/http';
import { isStatusFilter } from '@/lib/tokens/status';

// GET /api/tokens?status=all|bonding|graduated|locked
// Publik dan read-only. Status tiap token dibaca dari chain saat diminta; "Locked" hanya muncul
// bila verify() true di semua chain token. Tidak ada key, tidak ada penandatanganan.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status') ?? 'all';
  if (!isStatusFilter(status)) {
    return apiError('invalid_status', 'status must be one of: all, bonding, graduated, locked.', 400);
  }
  const service = requireTokenService();
  if (service instanceof Response) return service;
  try {
    return apiOk({ tokens: await service.list(status), index: { backend: service.backend } });
  } catch (error) {
    return tokenErrorResponse(error);
  }
}
