'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { isAddress } from 'viem';
import { cn } from '@/lib/cn';
import type { ChainKey } from '@/types/enums';

export interface ChainOption {
  key: ChainKey;
  name: string;
}

/**
 * Form XofN Check: alamat OFT + chain → /check/[chain]/[address].
 * Validasi bentuk di klien hanya untuk umpan balik cepat; validasi sebenarnya terjadi di server.
 */
export function CheckForm({
  chains,
  defaultChain,
  defaultAddress = '',
  idPrefix = 'check',
}: {
  chains: ChainOption[];
  defaultChain: ChainKey;
  defaultAddress?: string;
  idPrefix?: string;
}) {
  const router = useRouter();
  const [address, setAddress] = useState(defaultAddress);
  const [chain, setChain] = useState<ChainKey>(defaultChain);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = address.trim();
    if (!isAddress(value, { strict: false })) {
      setError('Enter a valid EVM address (0x + 40 hex characters).');
      return;
    }
    setError('');
    setPending(true);
    router.push(`/check/${chain}/${value.toLowerCase()}`);
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <label className="field-label" htmlFor={`${idPrefix}Addr`}>
        TOKEN CONTRACT ADDRESS
      </label>
      <div className="check-form-row">
        <input
          id={`${idPrefix}Addr`}
          className="field"
          placeholder="0x... Paste an OFT address"
          autoComplete="off"
          spellCheck={false}
          value={address}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${idPrefix}Error`}
          onChange={(event) => setAddress(event.target.value)}
        />
        <select
          className="field"
          aria-label="Chain"
          value={chain}
          onChange={(event) => setChain(event.target.value as ChainKey)}
        >
          {chains.map((option) => (
            <option key={option.key} value={option.key}>
              {option.name}
            </option>
          ))}
        </select>
        <button className="btn primary small" type="submit" disabled={pending}>
          {pending ? 'Reading chain…' : 'Inspect'} <span className="arr">↗</span>
        </button>
      </div>
      <div id={`${idPrefix}Error`} className={cn('checker-error', error && 'is-visible')} role="alert">
        {error}
      </div>
    </form>
  );
}
