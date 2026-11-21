import { AppBackdrop } from '@/components/landing/scene-loaders';
import { Skeleton } from '@/components/ui/skeleton';

// Kerangka yang tampil seketika selagi XofN Check membaca konfigurasi OFT dari chain.
export default function CheckResultLoading() {
  return (
    <>
      <AppBackdrop />
      <main className="app-page" id="top">
        <div className="container">
          <div className="app-head">
            <div className="section-label">XOFN CHECK / RESULT</div>
          </div>
          <div className="terminal" role="status" aria-busy="true">
            <div className="terminal-head">
              <div className="window-dots">
                <i />
                <i />
                <i />
              </div>
              <span className="mono">XOFN_CHECK / CONFIG_INSPECTOR</span>
              <span className="tag">
                <i /> READING
              </span>
            </div>
            <div className="terminal-body">
              <span className="sr-only">Reading the on-chain configuration. No result is assumed.</span>
              <div className="skeleton-stack" aria-hidden="true">
                <Skeleton width="min(360px, 80%)" height={34} />
                <Skeleton height={88} />
                <Skeleton height={150} />
                <Skeleton height={150} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
