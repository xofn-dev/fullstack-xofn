'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Nilai yang berkedip sebentar saat berubah (mint = naik, oranye = turun). `amount` hanya dipakai
 * untuk membandingkan; yang ditampilkan adalah `children`. Kedipannya dekoratif: nilainya sendiri
 * tetap teks biasa, jadi pembaca layar tidak diganggu setiap dua detik.
 */
export function LiveValue({ amount, children }: { amount: bigint | number | null; children: ReactNode }) {
  const [previous, setPrevious] = useState(amount);
  const [flash, setFlash] = useState<{ direction: 'up' | 'down'; count: number } | null>(null);
  // Pola "menyimpan nilai render sebelumnya": perbandingan dilakukan saat render, bukan di effect.
  if (amount !== previous) {
    setPrevious(amount);
    if (amount !== null && previous !== null) {
      setFlash({ direction: amount > previous ? 'up' : 'down', count: (flash?.count ?? 0) + 1 });
    }
  }
  return (
    // `key` berganti di setiap perubahan supaya animasi CSS diputar ulang.
    <span key={flash?.count ?? 0} className={cn('live-value', flash && `flash-${flash.direction}`)}>
      {children}
    </span>
  );
}
