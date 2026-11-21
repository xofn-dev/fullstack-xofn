import { AppBackdrop } from '@/components/landing/scene-loaders';
import { Skeleton } from '@/components/ui/skeleton';

// Kerangka yang tampil seketika saat menuju /launch.
export default function LaunchLoading() {
  return (
    <>
      <AppBackdrop />
      <main className="app-page is-transactional" id="top">
        <div className="container launch-layout" role="status" aria-busy="true">
          <span className="sr-only">Loading the launch form.</span>
          <div className="skeleton-stack" aria-hidden="true">
            <Skeleton width={140} height={10} />
            <Skeleton width="min(460px, 90%)" height={96} />
            <Skeleton height={64} />
            {/* Tempat kartu pratinjau "On the board". */}
            <Skeleton width="min(490px, 100%)" height={380} />
            <Skeleton height={120} />
          </div>
          <div className="launch-form" aria-hidden="true">
            <div className="skeleton-stack">
              <Skeleton width={160} height={16} />
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={110} />
              <Skeleton height={64} />
              <Skeleton height={48} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
