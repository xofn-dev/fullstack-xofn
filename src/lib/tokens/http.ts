import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { apiError } from '@/lib/api-error';
import { serverEnv } from '@/lib/env';
import { getTokenService, TokenServiceError, tokenHttpStatus, type TokenService } from '@/lib/tokens';

// Pembantu bersama route token dan cron.

const PREVIEW_MESSAGE =
  'No XofN deployment manifest exists for this network. Token data is not available in preview.';

/** Layanan token, atau respons 503 bila jaringan aktif belum punya manifest. */
export function requireTokenService(): TokenService | Response {
  return getTokenService() ?? apiError('network_unavailable', PREVIEW_MESSAGE, 503);
}

export function tokenErrorResponse(error: unknown): Response {
  if (error instanceof TokenServiceError) {
    return apiError(error.code, error.message, tokenHttpStatus(error.code));
  }
  return apiError('rpc_failed', 'The chain could not be read right now. No token data is assumed.', 502);
}

/**
 * Otorisasi route cron: `Authorization: Bearer <CRON_SECRET>` (ARCHITECTURE §8). Tanpa secret
 * terpasang, route menolak semua panggilan. Otorisasi dilakukan di route, bukan di proxy.ts.
 */
export function requireCron(request: Request): Response | null {
  const secret = serverEnv.cronSecret;
  if (secret === null) {
    return apiError('not_configured', 'CRON_SECRET is not set. Cron routes are disabled.', 503);
  }
  const header = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return apiError('unauthorized', 'Missing or invalid cron authorization.', 401);
  }
  return null;
}
