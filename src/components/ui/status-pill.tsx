import { cn } from '@/lib/cn';
import { STATUS_CLASS, STATUS_LABEL, STATUS_SHORT } from '@/lib/tokens/status';
import type { DisplayStatus } from '@/types/enums';

// Status tidak pernah dikomunikasikan dengan warna saja: teksnya selalu ada (DESIGN_SYSTEM §5.2).
export function StatusPill({ status, short = false }: { status: DisplayStatus; short?: boolean }) {
  return (
    <span className={cn('status', STATUS_CLASS[status])}>
      {short ? STATUS_SHORT[status] : STATUS_LABEL[status].toUpperCase()}
    </span>
  );
}
