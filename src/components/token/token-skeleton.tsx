import { Skeleton } from '@/components/ui/skeleton';

/**
 * Kerangka halaman token selagi chain dibaca. Bentuknya mengikuti tata letak asli supaya tidak
 * ada lompatan saat data datang. Teks statusnya untuk pembaca layar; tidak ada angka karangan.
 */
export function TokenSkeleton({ note = 'Reading the token from the chain.' }: { note?: string }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{note}</span>
      <div className="token-head" aria-hidden="true">
        <div className="skeleton-stack" style={{ flex: 1, minWidth: 0 }}>
          <Skeleton width={150} height={10} />
          <Skeleton width="min(420px, 80%)" height={44} />
          <Skeleton width="min(520px, 100%)" height={22} />
        </div>
        <Skeleton width={190} height={38} />
      </div>
      <div className="stage-rail" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} height={74} />
        ))}
      </div>
      <div className="token-layout" aria-hidden="true">
        <div className="app-panel area-chart">
          <div className="skeleton-stack">
            <Skeleton width={130} height={11} />
            <Skeleton height={250} />
            <Skeleton height={62} />
          </div>
        </div>
        <div className="app-panel area-trade">
          <div className="skeleton-stack">
            <Skeleton width={170} height={11} />
            <Skeleton height={52} />
            <Skeleton height={56} />
            <Skeleton height={34} />
            <Skeleton height={76} />
            <Skeleton height={48} />
          </div>
        </div>
        <div className="app-panel area-security">
          <div className="skeleton-stack">
            <Skeleton width={210} height={11} />
            <Skeleton height={84} />
          </div>
        </div>
      </div>
    </div>
  );
}
