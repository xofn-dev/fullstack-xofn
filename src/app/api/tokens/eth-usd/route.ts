import 'server-only';

import { apiOk } from '@/lib/api-error';
import { getEthUsd } from '@/lib/tokens';

// GET /api/tokens/eth-usd
// Kurs ETH/USD dari feed Chainlink on-chain, beserta sumber dan waktu bacanya. Publik dan
// read-only. `rate: null` berarti feed tidak terbaca atau jawabannya basi: UI lalu menonaktifkan
// tampilan USD, bukan memakai kurs lama.

export const dynamic = 'force-dynamic';

export async function GET() {
  return apiOk({ rate: await getEthUsd() });
}
