'use client';

import { useSyncExternalStore } from 'react';

// Satu detak per detik untuk semua label "N s ago" di halaman.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => listeners.forEach((notify) => notify()), 1_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const nowSeconds = () => Math.floor(Date.now() / 1_000);

/** Umur sebuah pembacaan dalam detik; null di server dan saat hidrasi (jam server ≠ jam klien). */
export function useAgeSeconds(iso: string | null): number | null {
  const now = useSyncExternalStore(subscribe, nowSeconds, () => null);
  if (now === null || iso === null) return null;
  return Math.max(0, now - Math.floor(Date.parse(iso) / 1_000));
}

/** "CHECKED 3s AGO" yang terus berjalan; sebelum hidrasi menampilkan jam UTC-nya. */
export function Ago({ iso, prefix = 'CHECKED' }: { iso: string; prefix?: string }) {
  const age = useAgeSeconds(iso);
  if (age === null) return <>{`${prefix} ${iso.replace('T', ' ').slice(11, 19)} UTC`}</>;
  const text = age < 60 ? `${age}s` : `${Math.floor(age / 60)}m ${age % 60}s`;
  return <>{`${prefix} ${text} AGO`}</>;
}
