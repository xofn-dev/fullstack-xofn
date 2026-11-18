'use client';

import { useState } from 'react';
import { buildDeliverNext } from '@/lib/web3/local-relay';
import { useTxFlow } from '@/lib/web3/use-tx-flow';
import { TxStatus } from '@/components/ui/tx-status';
import { NetworkGuard } from '@/components/wallet/network-guard';
import type { Address } from '@/types/domain';
import type { ChainKey } from '@/types/enums';

// HANYA simulasi lokal. Di Anvil tidak ada DVN atau executor sungguhan: pesan lintas chain
// menunggu di kontrak `LocalRelay` sampai seseorang memanggil `deliverNext()`. Kontrol ini
// menggantikan peran itu dan selalu berlabel SIMULATION; di jaringan nyata ia tidak ada.
export function SimulationRelay({
  relay,
  pending,
  homeChain,
}: {
  relay: Address;
  pending: number | null;
  homeChain: ChainKey;
}) {
  const tx = useTxFlow();
  const [delivering, setDelivering] = useState(false);

  const deliver = async (count: number) => {
    setDelivering(true);
    for (let index = 0; index < count; index += 1) {
      // Pengantaran yang gagal menghentikan antrean: pesan itu tetap di kepala antrean.
      if (!(await tx.run(buildDeliverNext(homeChain, relay)))) break;
    }
    setDelivering(false);
  };

  return (
    <div className="sim-relay">
      <p>
        SIMULATION · LOCAL RELAY: cross-chain messages on this test node are delivered only when
        someone asks the local relay to deliver them. On a real network DVNs and executors do this.
      </p>
      <dl className="quote-list">
        <div>
          <dt>MESSAGES WAITING</dt>
          <dd>{pending === null ? 'NOT READ' : pending}</dd>
        </div>
      </dl>
      {pending !== null && pending > 0 ? (
        <NetworkGuard chain={homeChain}>
          <button className="btn secondary" type="button" disabled={delivering} onClick={() => void deliver(1)}>
            Deliver next message <span className="arr">↗</span>
          </button>
          <button className="btn secondary" type="button" disabled={delivering} onClick={() => void deliver(pending)}>
            Deliver all {pending} waiting <span className="arr">↗</span>
          </button>
        </NetworkGuard>
      ) : (
        <p>No message is waiting.</p>
      )}
      <TxStatus state={tx.state} chain={homeChain} success="Message delivered." />
    </div>
  );
}
