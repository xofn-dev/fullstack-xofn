'use client';

import { useAppKit } from '@reown/appkit/react';
import { useConnection } from 'wagmi';
import { shortAddress } from '@/lib/format';

// Hook AppKit HANYA dipanggil di komponen *Active, yang dirender saat AppKit terkonfigurasi
// (CLAUDE.md §6, ARCHITECTURE §10.2).
export function ConnectButtonActive({ className, onDone }: { className: string; onDone?: () => void }) {
  const { open } = useAppKit();
  const { address, isConnected } = useConnection();
  return (
    <button
      className={className}
      type="button"
      onClick={() => {
        onDone?.();
        void open();
      }}
    >
      {isConnected && address ? shortAddress(address) : 'Connect Wallet'} <span className="arr">↗</span>
    </button>
  );
}
