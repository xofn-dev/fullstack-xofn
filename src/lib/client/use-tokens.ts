'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { historyCursor, mergeHistory, type HistoryState } from '@/lib/tokens/history';
import type { LaunchConfig } from '@/lib/tokens/read';
import type { StatusFilter } from '@/lib/tokens/status';
import type { EthUsdRate, TokenDetail, TokenSummary, Trade, TradeHistory } from '@/types/domain';

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

export const tradeHistoryKey = (address: string) => ['token-history', address] as const;

// Selama masih ada trade yang waktu bloknya belum terisi, riwayat diambil ulang dengan jeda ini.
const HISTORY_CATCH_UP_MS = 15_000;

/**
 * Riwayat trade curve untuk chart candle. Tidak punya interval sendiri: diambil ulang saat `tip`
 * (trade terakhir menurut detail) berubah, dan hanya trade sesudah kursor yang diminta. Selama
 * waktu blok trade lama masih diisi server, riwayat diambil ulang sesekali.
 */
export function useTradeHistory(address: string, tip: string, enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery<HistoryState>({
    queryKey: tradeHistoryKey(address),
    queryFn: async () => {
      const previous = queryClient.getQueryData<HistoryState>(tradeHistoryKey(address)) ?? null;
      const sent = historyCursor(previous);
      const params = sent.after === null ? '' : `?after=${encodeURIComponent(sent.after)}&timed=${sent.timed}`;
      const body = await getJson<{ history: TradeHistory }>(`/api/tokens/${address}/trades${params}`);
      return mergeHistory(previous, body.history, sent);
    },
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    // `mergeHistory` sendiri yang menjaga objek lama bila tidak ada yang berubah.
    structuralSharing: false,
    refetchInterval: (current) => {
      const data = current.state.data;
      return data && data.timed < data.total ? HISTORY_CATCH_UP_MS : false;
    },
    retry: 1,
  });
  const seenTip = useRef(tip);
  useEffect(() => {
    if (seenTip.current === tip) return;
    seenTip.current = tip;
    void queryClient.invalidateQueries({ queryKey: tradeHistoryKey(address) });
  }, [tip, address, queryClient]);
  return query;
}

const ETH_USD_POLL_MS = 60_000;

/** Kurs ETH/USD dari feed on-chain; `null` = tidak terbaca (tampilan USD dinonaktifkan). */
export function useEthUsd(enabled = true) {
  return useQuery<EthUsdRate | null>({
    queryKey: ['eth-usd'],
    queryFn: () => getJson<{ rate: EthUsdRate | null }>('/api/tokens/eth-usd').then((body) => body.rate),
    refetchInterval: ETH_USD_POLL_MS,
    staleTime: ETH_USD_POLL_MS / 2,
    enabled,
    retry: 1,
  });
}
