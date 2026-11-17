'use client';

import { useOverlay } from '@/components/ui/overlay-provider';
import { ConnectButtonActive } from '@/components/wallet/connect-button-active';
import { ConnectButtonDev } from '@/components/wallet/connect-button-dev';
import { isAppKitConfigured, isWeb3Configured, web3 } from '@/lib/web3/config';
import type { AppMode } from '@/types/enums';

interface ConnectButtonProps {
  mode: AppMode;
  className?: string;
  /** Dipanggil setelah klik, mis. untuk menutup menu mobile. */
  onDone?: () => void;
}

// USER_FLOWS Flow B: mode preview atau wallet tidak terkonfigurasi → modal penjelasan;
// selain itu AppKit, dan di jaringan lokal juga akun dev Anvil.
export function ConnectButton({ mode, className = 'btn secondary small', onDone }: ConnectButtonProps) {
  const { openModal } = useOverlay();

  if (mode === 'preview' || !isWeb3Configured) {
    const explain = () => {
      onDone?.();
      openModal({
        title: 'Wallet connection — preview only',
        copy: 'This build is a preview. It deliberately does not request signatures, connect to wallet providers, or process transfers.',
        detail:
          'Production integration: wallet client + supported EVM chains + quote simulation + user-signed transactions. Never enter a seed phrase or private key on any website.',
      });
    };
    return (
      <button className={className} type="button" onClick={explain}>
        Connect Wallet <span className="arr">↗</span>
      </button>
    );
  }

  return (
    <>
      {isAppKitConfigured && <ConnectButtonActive className={className} onDone={onDone} />}
      {web3?.hasDevAccount && <ConnectButtonDev className={className} onDone={onDone} />}
    </>
  );
}
