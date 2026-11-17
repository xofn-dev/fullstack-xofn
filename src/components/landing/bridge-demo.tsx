'use client';

import { useState } from 'react';
import type { ChainInfo } from '@/lib/chains';
import { formatInt } from '@/lib/format';
import type { ChainKey } from '@/types/enums';
import { useOverlay } from '@/components/ui/overlay-provider';
import { SplitHeading } from '@/components/landing/split-heading';

// Section 13 — widget bridge versi pratinjau (D8). Topologi hub: rute langsung hanya
// home ↔ ekspansi. Ekspansi ↔ ekspansi harus lewat home (dua langkah).
export function BridgeDemo({ home, expansions }: { home: ChainInfo; expansions: ChainInfo[] }) {
  const chains = [home, ...expansions];
  const firstExpansion = expansions[0] ?? home;
  const [from, setFrom] = useState<ChainKey>(home.key);
  const [to, setTo] = useState<ChainKey>(firstExpansion.key);
  const [amount, setAmount] = useState('1000');
  const { openModal, toast } = useOverlay();
  const nameOf = (key: ChainKey) => chains.find((chain) => chain.key === key)?.name ?? key;

  const swap = () => {
    setFrom(to);
    setTo(from);
    toast('Source and destination switched (preview only).');
  };

  const preview = () => {
    const value = Number(amount);
    if (from === to) {
      toast('Choose two different chains.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast('Enter a positive token amount.');
      return;
    }
    const direct = from === home.key || to === home.key;
    openModal({
      eyebrow: 'LAYERZERO / DEMONSTRATION',
      title: 'Bridge route — preview only',
      copy: 'This token and route are a visual demonstration. Actual bridging is only possible after a token has been expanded and locked, and only on configured pathways.',
      detail: [
        `FROM: ${nameOf(from)}`,
        `TO: ${nameOf(to)}`,
        `ROUTE: ${direct ? 'Direct pathway' : `Two steps via ${home.name} (hub)`}`,
        `AMOUNT: ${formatInt(value)} DEMO TOKEN`,
        'ESTIMATED FEE: Unavailable (quoteSend required)',
        'ESTIMATED RECEIPT: Unavailable',
        'DUST: Amounts below 0.000001 stay in your wallet',
        'WALLET TRANSACTION: Not available',
      ].join('\n'),
    });
  };

  return (
    <section className="section" id="bridge">
      <div className="container bridge-layout">
        <div>
          <div className="section-label">
            08 / OMNICHAIN TRANSFER<span className="planned-chip">PLANNED</span>
          </div>
          <SplitHeading
            className="h2"
            lines={[
              'One token.',
              <span className="accent" key="a">
                Multiple horizons.
              </span>,
            ]}
          />
          <p className="bridge-desc">
            Once a token has been expanded and locked, holders can transfer its OFT between{' '}
            {home.name} and each expansion chain. Every send should be quoted before signing.
          </p>
          <div className="bridge-callouts">
            <div>
              <b>↗</b> Real-time `quoteSend` before transactions
            </div>
            <div>
              <b>↗</b> LayerZero Scan link for delivery tracking
            </div>
            <div>
              <b>↗</b> Clear fees, dust and destination warnings
            </div>
            <div>
              <b>↗</b> No server custody of wallet private keys
            </div>
          </div>
        </div>
        <div className="bridge-widget">
          <div className="widget-head">
            <h3>Bridge tokens</h3>
            <span className="tag warn">
              <i /> UI PREVIEW
            </span>
          </div>
          <div className="transfer-box">
            <div className="transfer-top">
              <span>FROM / SOURCE CHAIN</span>
              <span>Wallet not connected</span>
            </div>
            <div className="transfer-main">
              <input
                type="number"
                id="bridgeAmount"
                min="0"
                step="any"
                value={amount}
                aria-label="Amount of tokens to bridge"
                onChange={(event) => setAmount(event.target.value)}
              />
              <select
                id="bridgeFrom"
                aria-label="Source chain"
                value={from}
                onChange={(event) => setFrom(event.target.value as ChainKey)}
              >
                {chains.map((chain) => (
                  <option key={chain.key} value={chain.key}>
                    {chain.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="transfer-hint">DEMO TOKEN / OFT</div>
          </div>
          <button
            type="button"
            className="btn swap-btn"
            aria-label="Swap source and destination chains"
            onClick={swap}
          >
            ↕
          </button>
          <div className="transfer-box">
            <div className="transfer-top">
              <span>TO / DESTINATION CHAIN</span>
              <span>Estimated receipt unavailable</span>
            </div>
            <div className="transfer-main">
              <div className="transfer-dash">—</div>
              <select
                id="bridgeTo"
                aria-label="Destination chain"
                value={to}
                onChange={(event) => setTo(event.target.value as ChainKey)}
              >
                {chains.map((chain) => (
                  <option key={chain.key} value={chain.key}>
                    {chain.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="transfer-hint">QUOTE REQUIRED BEFORE SEND</div>
          </div>
          <div className="bridge-summary">
            <div>
              <span>Messaging / execution fee</span>
              <strong>Awaiting live quote</strong>
            </div>
            <div>
              <span>Bridge availability</span>
              <strong>After expansion is locked</strong>
            </div>
            <div>
              <span>Expected transaction</span>
              <strong>Wallet-signed</strong>
            </div>
          </div>
          <button className="btn primary" type="button" onClick={preview}>
            Preview route <span className="arr">↗</span>
          </button>
        </div>
      </div>
    </section>
  );
}
