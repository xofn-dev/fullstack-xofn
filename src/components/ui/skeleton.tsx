import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/** Blok shimmer untuk keadaan memuat. Dekoratif; teks statusnya ada di pemakai (`role="status"`). */
export function Skeleton({
  width = '100%',
  height = 14,
  className,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  const style: CSSProperties = { width, height };
  return <span className={cn('skeleton', className)} style={style} aria-hidden="true" />;
}
