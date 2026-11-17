import { getModeCopy } from '@/lib/mode';
import type { AppMode } from '@/types/enums';

// D4: NoticeBar selalu ada; teksnya mengikuti mode, bukan label versi konsep (D10).
export function NoticeBar({ mode }: { mode: AppMode }) {
  const copy = getModeCopy(mode);
  return (
    <div className="notice">
      <span>{copy.noticeChip}</span> {copy.noticeText}
    </div>
  );
}
