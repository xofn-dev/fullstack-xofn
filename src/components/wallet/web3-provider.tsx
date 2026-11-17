'use client';

import { createAppKit } from '@reown/appkit/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { publicEnv } from '@/lib/public-env';
import { web3 } from '@/lib/web3/config';

// AppKit hanya dibuat bila project ID ada (ARCHITECTURE §10.2). Dipanggil sekali di level modul,
// sesuai cara pakai AppKit, bukan di dalam render.
if (web3?.appKit) {
  createAppKit({
    adapters: [web3.appKit.adapter],
    networks: web3.appKit.networks,
    projectId: web3.appKit.projectId,
    metadata: {
      name: 'XofN',
      description: 'Building the launchpad where 1-of-1 is never allowed.',
      url: publicEnv.siteUrl,
      icons: [],
    },
    // Tidak ada login email/sosial maupun analitik: hanya wallet yang menandatangani sendiri.
    features: { analytics: false, email: false, socials: [] },
  });
}

// Provider data klien. React Query selalu ada (polling status); wagmi hanya bila wallet
// terkonfigurasi. Dipasang layout hanya di luar mode preview.
export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  const tree = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  if (!web3) return tree;
  return <WagmiProvider config={web3.config}>{tree}</WagmiProvider>;
}
