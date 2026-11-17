'use client';

import { explorerTxUrl, getChain } from '@/lib/chains';
import { shortAddress } from '@/lib/format';
import { publicEnv } from '@/lib/public-env';
import { TX_PHASE_LABEL, type TxState } from '@/lib/web3/use-tx-flow';
import type { ChainKey } from '@/types/enums';

// Status transaksi berupa teks (DESIGN_SYSTEM §5.1): "Confirm in wallet…", "Pending…" + tautan tx.
// Di simulasi lokal tidak ada explorer, jadi hash ditampilkan tanpa tautan.
export function TxStatus({ state, chain, success }: { state: TxState; chain: ChainKey; success?: string }) {
  const url = state.hash ? explorerTxUrl(getChain(publicEnv.network, chain), state.hash) : null;
  const label = TX_PHASE_LABEL[state.phase];
  return (
    <div className="tx-status" aria-live="polite">
      {label && <span className="tx-phase">{label}</span>}
      {state.phase === 'success' && <span className="tx-phase ok">{success ?? 'Confirmed.'}</span>}
      {state.phase === 'error' && state.error && <span className="error-msg">{state.error}</span>}
      {state.hash &&
        (url ? (
          <a href={url} target="_blank" rel="noreferrer noopener">
            TX {shortAddress(state.hash, 10, 6)} ↗
          </a>
        ) : (
          <span className="mono">TX {shortAddress(state.hash, 10, 6)} · LOCAL NODE</span>
        ))}
    </div>
  );
}
