import type { Metadata } from 'next';
import { currentBuildNote } from '@/lib/web3/app-mode';
import { notFound, redirect } from 'next/navigation';
import { isAddress } from 'viem';
import { AppBackdrop } from '@/components/landing/scene-loaders';
import { TokenView } from '@/components/token/token-view';
import { EmptyState } from '@/components/ui/empty-state';
import { getHomeChain } from '@/lib/chains';
import { publicEnv } from '@/lib/public-env';
import { getTokenService, TokenServiceError } from '@/lib/tokens';
import { getDeployment, lc } from '@/lib/web3/addresses';
import type { TokenDetail } from '@/types/domain';

export const metadata: Metadata = {
  title: 'Token',
  description: `Token status, security tier and verify() reads for an XofN token. ${currentBuildNote()}`,
};

export const dynamic = 'force-dynamic';

// Batas tunggu pembacaan chain di server sebelum halaman dikirim tanpa data awal.
const SSR_BUDGET_MS = 1_200;

// "/t/[address]" — USER_FLOWS Flow G. Alamat divalidasi dan di-lowercase di batas input.
// Alamat yang bukan token XofN diarahkan ke XofN Check.
export default async function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  if (!isAddress(raw)) notFound();
  const address = lc(raw);
  const network = publicEnv.network;
  const deployment = getDeployment(network);
  const service = getTokenService();

  let initial: TokenDetail | undefined;
  if (service) {
    // Pembacaan server dibatasi waktu: bila chain lambat, halaman dikirim dengan kerangka dan
    // klien melanjutkan pembacaan yang SAMA (layanan membagi promise-nya selama dua detik).
    const read = service.detail(address).then(
      (token) => ({ token, error: null }),
      (error: unknown) => ({ token: undefined, error }),
    );
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), SSR_BUDGET_MS));
    const outcome = await Promise.race([read, timeout]);
    if (outcome?.error instanceof TokenServiceError && outcome.error.code === 'not_found') {
      redirect(`/check/${getHomeChain(network).key}/${address}`);
    }
    // Kegagalan RPC atau waktu habis: halaman tetap tampil dan klien membaca; tidak ada data
    // yang dikarang. Alamat yang ternyata bukan token XofN diarahkan klien ke XofN Check.
    initial = outcome?.token;
  }

  return (
    <>
      <AppBackdrop />
      <main className="app-page is-transactional" id="top">
        <div className="container">
          {deployment && service ? (
            <TokenView address={address} initial={initial} deployment={deployment} />
          ) : (
            <EmptyState title="TOKEN PAGES ARE NOT LIVE">
              No XofN deployment exists on this network yet, so there is no token to read. This is a
              preview build.
            </EmptyState>
          )}
        </div>
      </main>
    </>
  );
}
