import { mock } from '@wagmi/core';
import type { Address } from '@/lib/chains';

// "Anvil dev account": pilihan wallet yang HANYA ada saat jaringan aktif = local (PRD P56).
// Transaksi dikirim sebagai `eth_sendTransaction` ke node Anvil, yang menandatanganinya dengan
// akun dev bawaan yang sudah ter-unlock. Tidak ada private key di browser maupun di server, dan
// konektor ini tidak pernah dibuat untuk testnet/mainnet.

/** Akun dev Anvil ke-2 (indeks 1). Alamat publik bawaan Anvil; bukan akun pemilik kontrak. */
export const ANVIL_DEV_ACCOUNT: Address = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';

export const DEV_CONNECTOR_ID = 'mock';

export function devAccountConnector() {
  return mock({ accounts: [ANVIL_DEV_ACCOUNT], features: { reconnect: true } });
}
