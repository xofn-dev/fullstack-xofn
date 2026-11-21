'use client';

import { useEffect, useState } from 'react';

/**
 * Nilai yang baru berubah setelah masukan diam selama `delayMs`. Dipakai supaya mengetik jumlah
 * tidak mengirim satu pembacaan quote per ketukan ke RPC yang dibatasi rate.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
