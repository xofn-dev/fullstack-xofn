import type { Metadata } from 'next';
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
  description: 'Token status, security tier and verify() reads for an XofN token. Preview build.',
};

export const dynamic = 'force-dynamic';

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
    try {
      initial = await service.detail(address);
    } catch (error) {
      if (error instanceof TokenServiceError && error.code === 'not_found') {
        redirect(`/check/${getHomeChain(network).key}/${address}`);
      }
      // Kegagalan RPC: halaman tetap tampil dan klien mencoba lagi; tidak ada data yang dikarang.
    }
  }

  return (
    <>
      <AppBackdrop />
      <main className="app-page" id="top">
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
