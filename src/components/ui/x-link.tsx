import { cn } from '@/lib/cn';
import { X_PROFILE_URL } from '@/lib/links';

// Logo X (Twitter) sebagai SVG inline; warna mengikuti currentColor supaya ikut gaya tombol/tautan induk.
function XGlyph() {
  return (
    <svg className="x-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

export function XLink({ className, label }: { className?: string; label?: string }) {
  return (
    <a
      className={cn(className)}
      href={X_PROFILE_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="XofN on X (opens in a new tab)"
    >
      <XGlyph />
      {label ? <span>{label}</span> : null}
    </a>
  );
}
