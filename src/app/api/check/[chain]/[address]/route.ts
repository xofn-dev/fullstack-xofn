import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { httpStatusFor, runCheck } from '@/lib/check';

// GET /api/check/[chain]/[address]?fresh=1
// Publik dan read-only. Tidak ada key, tidak ada penandatanganan. Kegagalan RPC dijawab 502
// dengan pesan jujur; hasil parsial ditandai per pathway (status "unread"), tidak pernah ditebak.

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ chain: string; address: string }> },
) {
  const { chain, address } = await context.params;
  const fresh = request.nextUrl.searchParams.get('fresh') === '1';
  const forwarded = request.headers.get('x-forwarded-for');
  const clientId = forwarded?.split(',')[0]?.trim() || 'local';

  const outcome = await runCheck({ chain, address, fresh, clientId });
  if (!outcome.ok) {
    return NextResponse.json(
      { error: { code: outcome.code, message: outcome.message } },
      { status: httpStatusFor(outcome), headers: { 'cache-control': 'no-store' } },
    );
  }
  return NextResponse.json(
    { result: outcome.result, cache: outcome.cache },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}
