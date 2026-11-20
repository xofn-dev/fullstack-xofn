import { getModeCopy } from '@/lib/mode';
import { publicEnv } from '@/lib/public-env';
import type { AppMode } from '@/types/enums';

// D4: NoticeBar selalu ada; teksnya mengikuti mode, bukan label versi konsep (D10).
export function NoticeBar({ mode }: { mode: AppMode }) {
  const copy = getModeCopy(mode, publicEnv.network);
  return (
    <div className="notice">
      <span>{copy.noticeChip}</span> {copy.noticeText}
    </div>
  );
}
