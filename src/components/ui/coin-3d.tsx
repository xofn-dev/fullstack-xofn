import Image from 'next/image';
import type { CSSProperties } from 'react';

import { cn } from '@/lib/cn';

const EDGES = 10;

// Koin logo XofN dengan CSS 3D (tanpa WebGL, jadi tidak memakan jatah konteks WebGL halaman).
// Dekoratif: label teks panel ada di luar komponen ini. Ukuran lewat `--c3d-size` di kelas pemakai.
export function Coin3D({ className }: { className?: string }) {
  return (
    <div className={cn('c3d', className)} aria-hidden="true">
      <div className="c3d-tilt">
        <div className="c3d-spin">
          {Array.from({ length: EDGES }, (_, i) => (
            <i key={i} className="c3d-layer c3d-edge" style={{ '--i': i } as CSSProperties} />
          ))}
          <div className="c3d-layer c3d-face back">
            <Image src="/logo.jpeg" alt="" width={256} height={256} />
          </div>
          <div className="c3d-layer c3d-face front">
            <Image src="/logo.jpeg" alt="" width={256} height={256} />
          </div>
        </div>
      </div>
    </div>
  );
}
