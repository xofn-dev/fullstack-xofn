'use client';

import { useOverlay } from '@/components/ui/overlay-provider';

/**
 * Tombol salin. Clipboard API hanya ada di konteks aman (HTTPS/localhost); bila tidak ada atau
 * ditolak, pengguna diberi tahu alih-alih tombolnya diam.
 */
export function CopyButton({ value, label = 'copy', what = 'Address' }: { value: string; label?: string; what?: string }) {
  const { toast } = useOverlay();
  const copy = () => {
    const failed = () => toast(`Could not copy. Select the ${what.toLowerCase()} and copy it manually.`);
    if (!navigator.clipboard) {
      failed();
      return;
    }
    void navigator.clipboard.writeText(value).then(() => toast(`${what} copied.`), failed);
  };
  return (
    <button type="button" className="copy-btn" onClick={copy} aria-label={`Copy ${what.toLowerCase()} ${value}`}>
      {label}
    </button>
  );
}
