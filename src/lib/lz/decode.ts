import { decodeAbiParameters, getAddress, type Hex } from 'viem';
import type { Address, ExecutorConfig, UlnConfig } from '@/types/domain';
import { NIL_CONFIRMATIONS, NIL_DVN_COUNT } from '@/lib/lz/config-types';

// Decoder murni untuk bytes yang dikembalikan endpoint.getConfig. Dites di tests/lz.test.ts
// dengan bytes nyata dari chain (tests/fixtures/get-config.json).

const ULN_PARAMS = [
  {
    type: 'tuple',
    components: [
      { name: 'confirmations', type: 'uint64' },
      { name: 'requiredDVNCount', type: 'uint8' },
      { name: 'optionalDVNCount', type: 'uint8' },
      { name: 'optionalDVNThreshold', type: 'uint8' },
      { name: 'requiredDVNs', type: 'address[]' },
      { name: 'optionalDVNs', type: 'address[]' },
    ],
  },
] as const;

const EXECUTOR_PARAMS = [
  {
    type: 'tuple',
    components: [
      { name: 'maxMessageSize', type: 'uint32' },
      { name: 'executor', type: 'address' },
    ],
  },
] as const;

interface RawUln {
  confirmations: bigint;
  requiredDVNCount: number;
  optionalDVNCount: number;
  optionalDVNThreshold: number;
  requiredDVNs: readonly string[];
  optionalDVNs: readonly string[];
}

const lower = (address: string): Address => getAddress(address).toLowerCase() as Address;

/** Menormalkan struct UlnConfig (dari decode maupun dari getAppUlnConfig) ke tipe domain. */
export function normalizeUln(raw: RawUln): UlnConfig {
  return {
    confirmations: raw.confirmations.toString(),
    requiredDvnCount: raw.requiredDVNCount,
    optionalDvnCount: raw.optionalDVNCount,
    optionalDvnThreshold: raw.optionalDVNThreshold,
    requiredDvns: raw.requiredDVNs.map(lower),
    optionalDvns: raw.optionalDVNs.map(lower),
  };
}

export function decodeUlnConfig(bytes: Hex): UlnConfig {
  const [raw] = decodeAbiParameters(ULN_PARAMS, bytes);
  return normalizeUln(raw);
}

export function decodeExecutorConfig(bytes: Hex): ExecutorConfig {
  const [raw] = decodeAbiParameters(EXECUTOR_PARAMS, bytes);
  return { maxMessageSize: raw.maxMessageSize, executor: lower(raw.executor) };
}

/**
 * Field konfigurasi MENTAH yang bernilai 0, artinya nilai efektifnya berasal dari default
 * LayerZero dan bisa berubah tanpa tindakan pemilik token. NIL (255 / uint64 max) bukan default.
 */
export function fieldsUsingDefault(raw: UlnConfig): string[] {
  const fields: string[] = [];
  if (raw.confirmations === '0') fields.push('confirmations');
  if (raw.requiredDvnCount === 0) fields.push('required DVNs');
  if (raw.optionalDvnCount === 0) fields.push('optional DVNs');
  return fields;
}

export function isNilConfirmations(value: string): boolean {
  return value === NIL_CONFIRMATIONS;
}

export function isNilCount(value: number): boolean {
  return value === NIL_DVN_COUNT;
}

/** bytes32 peer → alamat EVM bila 12 byte teratas nol; selain itu dikembalikan apa adanya. */
export function peerToAddress(peer: Hex): string {
  if (/^0x0{24}[0-9a-fA-F]{40}$/.test(peer)) return `0x${peer.slice(26)}`.toLowerCase();
  return peer.toLowerCase();
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
export const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const;

export function isZeroAddress(address: string | null | undefined): boolean {
  return !address || /^0x0{40}$/i.test(address);
}

/** Slot storage 32 byte → alamat (20 byte terbawah), atau null bila slot kosong. */
export function slotToAddress(slot: Hex | undefined): Address | null {
  if (!slot || /^0x0*$/.test(slot)) return null;
  const hex = slot.slice(2).padStart(64, '0');
  const address = `0x${hex.slice(24)}`;
  return isZeroAddress(address) ? null : (address.toLowerCase() as Address);
}
