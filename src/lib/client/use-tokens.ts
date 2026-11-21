'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { LaunchConfig } from '@/lib/tokens/read';
import type { StatusFilter } from '@/lib/tokens/status';
import type { TokenDetail, TokenSummary, Trade } from '@/types/domain';

// Polling data token dari API (ARCHITECTURE §11.4). API membaca chain; klien tidak menebak status.

const POLL_MS = 4_000;
// Data yang baru saja dirender server tidak diambil ulang saat hidrasi; polling berikutnya cukup.
const FRESH_MS = 2_000;
const MAX_LOCAL_TRADES = 20;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(error?.code ?? 'request_failed', error?.message ?? 'The request failed.');
  }
  return body as T;
}

export const tokenDetailKey = (address: string) => ['token', address] as const;
const localTradesKey = (address: string) => ['token-local-trades', address] as const;

export function useTokenList(filter: StatusFilter, enabled = true) {
  return useQuery({
    queryKey: ['tokens', filter],
    queryFn: () => getJson<{ tokens: TokenSummary[] }>(`/api/tokens?status=${filter}`).then((body) => body.tokens),
    refetchInterval: POLL_MS,
    staleTime: FRESH_MS,
    enabled,
  });
}

export function useTokenDetail(address: string, initial?: TokenDetail, enabled = true) {
  return useQuery({
    queryKey: tokenDetailKey(address),
    queryFn: () => getJson<{ token: TokenDetail }>(`/api/tokens/${address}`).then((body) => body.token),
    refetchInterval: POLL_MS,
    staleTime: FRESH_MS,
    initialData: initial,
    enabled,
    // Alamat yang bukan token XofN tidak akan menjadi token di percobaan berikutnya.
    retry: (count, error) => !(error instanceof ApiError && error.code === 'not_found') && count < 1,
  });
}

/**
 * Trade dari receipt transaksi pengguna sendiri, disimpan sampai index server memuatnya.
 * Disimpan terpisah dari detail supaya respons API yang dibaca sebelum trade masuk blok tidak
 * menghapusnya lagi dari layar.
 */
export function useLocalTrades(address: string) {
  const queryClient = useQueryClient();
  const { data } = useQuery<Trade[]>({
    queryKey: localTradesKey(address),
    queryFn: () => [],
    enabled: false,
    initialData: [],
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  const add = useCallback(
    (trades: Trade[]) => {
      if (trades.length === 0) return;
      queryClient.setQueryData<Trade[]>(localTradesKey(address), (current = []) =>
        [...current, ...trades].slice(-MAX_LOCAL_TRADES),
      );
    },
    [address, queryClient],
  );
  const replace = useCallback(
    (trades: Trade[]) => queryClient.setQueryData<Trade[]>(localTradesKey(address), trades),
    [address, queryClient],
  );
  return { trades: data, add, replace };
}

// Ketersediaan tier dan gerbang launch jarang berubah; cukup dibaca ulang sesekali.
const LAUNCH_CONFIG_POLL_MS = 15_000;

/**
 * Konfigurasi form launch. `initial` dari server bila pembacaannya selesai tepat waktu; selain
 * itu klien membacanya sendiri, dan form tetap bisa diisi selagi menunggu.
 */
export function useLaunchConfig(initial: LaunchConfig | null) {
  return useQuery({
    queryKey: ['launch-config'],
    queryFn: () => getJson<{ config: LaunchConfig }>('/api/tokens/launch-config').then((body) => body.config),
    refetchInterval: LAUNCH_CONFIG_POLL_MS,
    staleTime: FRESH_MS,
    initialData: initial ?? undefined,
  });
}
