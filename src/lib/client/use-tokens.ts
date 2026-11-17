'use client';

import { useQuery } from '@tanstack/react-query';
import type { StatusFilter } from '@/lib/tokens/status';
import type { TokenDetail, TokenSummary } from '@/types/domain';

// Polling data token dari API (ARCHITECTURE §11.4). API membaca chain; klien tidak menebak status.

const POLL_MS = 4_000;

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

export function useTokenList(filter: StatusFilter, enabled = true) {
  return useQuery({
    queryKey: ['tokens', filter],
    queryFn: () => getJson<{ tokens: TokenSummary[] }>(`/api/tokens?status=${filter}`).then((body) => body.tokens),
    refetchInterval: POLL_MS,
    enabled,
  });
}

export function useTokenDetail(address: string, initial?: TokenDetail, enabled = true) {
  return useQuery({
    queryKey: ['token', address],
    queryFn: () => getJson<{ token: TokenDetail }>(`/api/tokens/${address}`).then((body) => body.token),
    refetchInterval: POLL_MS,
    initialData: initial,
    enabled,
  });
}
