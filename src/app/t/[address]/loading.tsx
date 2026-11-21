import { AppBackdrop } from '@/components/landing/scene-loaders';
import { TokenSkeleton } from '@/components/token/token-skeleton';

// Kerangka yang tampil seketika saat menuju halaman token, selagi server membaca chain.
export default function TokenLoading() {
  return (
    <>
      <AppBackdrop />
      <main className="app-page is-transactional" id="top">
        <div className="container">
          <TokenSkeleton />
        </div>
      </main>
    </>
  );
}
