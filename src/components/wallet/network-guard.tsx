'use client';

import type { ReactNode } from 'react';
import { ConnectButton } from '@/components/wallet/connect-button';
import { currentAppMode } from '@/lib/web3/app-mode';
import { useNetworkGuard } from '@/lib/web3/use-network-guard';
import type { ChainKey } from '@/types/enums';

// Membungkus tombol aksi: belum tersambung → tombol Connect; chain salah → "Switch to <chain>";
// selain itu aksi ditampilkan. Ini hanya memilih tombol; validasi tetap di kontrak.
export function NetworkGuard({ chain, children }: { chain: ChainKey; children: ReactNode }) {
  const guard = useNetworkGuard(chain);
  if (!guard.connected) {
    return (
      <div className="guard">
        <p className="guard-note">Connect a wallet to continue. Never share a seed phrase or private key.</p>
        <ConnectButton mode={currentAppMode()} className="btn primary" />
      </div>
    );
  }
  if (!guard.ready) {
    return (
      <div className="guard">
        <p className="guard-note">This action is signed on {guard.chain.name}.</p>
        <button className="btn primary" type="button" onClick={guard.switchToChain} disabled={guard.switching}>
          {guard.switching ? 'Switching…' : `Switch to ${guard.chain.name}`} <span className="arr">↗</span>
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
