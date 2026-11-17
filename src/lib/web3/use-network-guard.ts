'use client';

import { useConnection, useSwitchChain } from 'wagmi';
import { getChain, type ChainInfo } from '@/lib/chains';
import { publicEnv } from '@/lib/public-env';
import type { ChainKey } from '@/types/enums';

export interface NetworkGuardState {
  chain: ChainInfo;
  connected: boolean;
  /** Wallet berada di chain yang dibutuhkan aksi. */
  ready: boolean;
  switching: boolean;
  switchToChain: () => void;
}

/**
 * Chain yang dibutuhkan satu aksi (USER_FLOWS Flow B). Di simulasi lokal ketiga chain berbagi
 * chain ID Anvil, jadi wallet yang tersambung selalu "di chain yang benar"; yang membedakan
 * chain di sana adalah alamat kontrak dari manifest.
 */
export function useNetworkGuard(chainKey: ChainKey): NetworkGuardState {
  const chain = getChain(publicEnv.network, chainKey);
  const { isConnected, chainId } = useConnection();
  const { mutate: switchChain, isPending } = useSwitchChain();
  return {
    chain,
    connected: isConnected,
    ready: isConnected && chainId === chain.chainId,
    switching: isPending,
    switchToChain: () => switchChain({ chainId: chain.chainId }),
  };
}
