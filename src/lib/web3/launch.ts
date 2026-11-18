import { parseEventLogs, type Hex, type Log } from 'viem';
import type { Address } from '@/lib/chains';
import { tierId } from '@/lib/tiers';
import { graduatorAbi } from '@/lib/web3/abi/xofn';
import type { HomeContracts } from '@/lib/web3/addresses';
import type { TxRequest } from '@/lib/web3/tx';
import type { Tier } from '@/types/enums';

export interface LaunchInput {
  name: string;
  symbol: string;
  tier: Tier;
  /** EID chain ekspansi yang dipilih (minimal satu). */
  eids: number[];
  /** Hash metadata/logo; nol bila tidak ada gambar (PRD P26 masih terbuka). */
  metadataHash: Hex;
}

export const ZERO_HASH: Hex = `0x${'0'.repeat(64)}`;

const byteLength = (value: string) => new TextEncoder().encode(value).length;
const TICKER = /^[A-Za-z0-9]{2,12}$/;

/**
 * Validasi sebelum tanda tangan, sama dengan aturan kontrak (nama 1–32 byte, simbol 2–12 byte,
 * tier hanya Standard/Fortress, minimal satu chain). Mengembalikan pesan error atau null.
 */
export function validateLaunchInput(input: LaunchInput, supportedEids: number[]): string | null {
  const name = input.name.trim();
  if (name.length === 0) return 'Enter a token name.';
  if (byteLength(name) > 32) return 'Token name must be at most 32 bytes.';
  if (!TICKER.test(input.symbol.trim())) return 'Ticker should contain 2 to 12 letters or numbers.';
  if (input.eids.length === 0) return 'Choose at least one expansion chain.';
  if (new Set(input.eids).size !== input.eids.length) return 'An expansion chain was selected twice.';
  if (input.eids.some((eid) => !supportedEids.includes(eid))) {
    return 'One of the selected expansion chains is not supported.';
  }
  return null;
}

export function buildLaunch(home: HomeContracts, input: LaunchInput): TxRequest {
  return {
    chain: home.chain.chain,
    address: home.graduator,
    abi: graduatorAbi,
    functionName: 'launch',
    args: [input.name.trim(), input.symbol.trim().toUpperCase(), tierId(input.tier), input.eids, input.metadataHash],
  };
}

/** Alamat token dan curve dari event `Launched` di receipt; null bila event tidak ada. */
export function parseLaunchLogs(logs: Log[]): { token: Address; curve: Address } | null {
  const [launched] = parseEventLogs({ abi: graduatorAbi, eventName: 'Launched', logs });
  if (!launched) return null;
  return {
    token: launched.args.token.toLowerCase() as Address,
    curve: launched.args.curve.toLowerCase() as Address,
  };
}
