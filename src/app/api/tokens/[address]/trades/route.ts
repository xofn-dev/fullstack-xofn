import 'server-only';

import { after } from 'next/server';
import { apiOk } from '@/lib/api-error';
import { parseTokenAddress } from '@/lib/tokens';
import { parseHistoryQuery } from '@/lib/tokens/history';
import { requireTokenService, tokenErrorResponse } from '@/lib/tokens/http';

// GET /api/tokens/[address]/trades?after=<blok>:<indeks log>&timed=<n>
// Riwayat trade curve untuk chart: waktu blok, sisi, ETH, dan `ethRaised` sesudah trade. Tanpa
// `after` seluruh riwayat dikirim; dengan `after` hanya trade sesudah kursor itu. Trade yang
// waktu bloknya belum terbaca dikirim dengan `time: null` dan tidak pernah diberi perkiraan.

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  const { address } = await context.params;
  const service = requireTokenService();
  if (service instanceof Response) return service;
  try {
    const token = parseTokenAddress(address);
    const history = await service.history(token, parseHistoryQuery(new URL(request.url).searchParams));
    // Waktu blok riwayat lama diisi setelah respons dikirim, sedikit demi sedikit.
    if (history.timed < history.total) after(() => service.backfillTimes(token));
    return apiOk({ history });
  } catch (error) {
    return tokenErrorResponse(error);
  }
}
