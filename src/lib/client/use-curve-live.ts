'use client';

import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import type { Address } from '@/lib/chains';
import type { LiveCurve } from '@/lib/tokens/live';
import { curveAbi } from '@/lib/web3/abi/xofn';

// State curve dibaca langsung dari browser setiap 2 detik. Empat nilai ini satu `eth_call` lewat
// Multicall3, jadi harga dan progres di halaman token mengikuti chain tanpa menunggu polling API
// (yang juga membawa tabel security dan riwayat trade). Polling berhenti saat tab tersembunyi.
const LIVE_MS = 2_000;

export function useCurveLive(curve: Address, chainId: number, enabled: boolean): LiveCurve | null {
  const contract = { address: curve, abi: curveAbi, chainId } as const;
  const { data } = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...contract, functionName: 'ethRaised' },
      { ...contract, functionName: 'tokensSold' },
      { ...contract, functionName: 'currentPrice' },
      { ...contract, functionName: 'thresholdReached' },
    ],
    query: { enabled, refetchInterval: LIVE_MS, staleTime: 0 },
  });
  const [ethRaised, tokensSold, currentPrice, thresholdReached] = data ?? [];
  return useMemo(
    () =>
      ethRaised === undefined || tokensSold === undefined || currentPrice === undefined || thresholdReached === undefined
        ? null
        : { ethRaised, tokensSold, currentPrice, thresholdReached },
    [ethRaised, tokensSold, currentPrice, thresholdReached],
  );
}
