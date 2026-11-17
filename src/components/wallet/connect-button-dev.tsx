'use client';

import { useConnect, useConnection, useConnectors, useDisconnect } from 'wagmi';
import { useOverlay } from '@/components/ui/overlay-provider';
import { shortAddress } from '@/lib/format';
import { DEV_CONNECTOR_ID } from '@/lib/web3/dev-account';

// Tombol wallet untuk simulasi lokal: menyambungkan akun dev Anvil yang sudah ter-unlock.
// Tidak ada key di browser; node Anvil yang menandatangani. Selalu berlabel DEV.
export function ConnectButtonDev({ className, onDone }: { className: string; onDone?: () => void }) {
  const { address, isConnected } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { toast } = useOverlay();
  const dev = connectors.find((connector) => connector.id === DEV_CONNECTOR_ID);

  const onClick = () => {
    onDone?.();
    if (isConnected) {
      disconnect();
      return;
    }
    if (!dev) {
      toast('Anvil dev account is not available.');
      return;
    }
    connect(
      { connector: dev },
      { onError: () => toast('Could not reach the local Anvil node. Is it running?') },
    );
  };

  return (
    <button className={className} type="button" onClick={onClick} disabled={isPending}>
      {isConnected && address ? `DEV ${shortAddress(address)}` : 'Connect Anvil dev account'}{' '}
      <span className="arr">↗</span>
    </button>
  );
}
