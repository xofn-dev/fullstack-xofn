import type { AppMode, Network } from '@/types/enums';

/**
 * Status manifest deployment untuk jaringan aktif (PRD P52, ARCHITECTURE §5.6.1):
 * - `none`: belum ada manifest;
 * - `local`: manifest Anvil (`deployments/local.json`);
 * - `deployed-dormant`: kontrak publik sudah ada tetapi `registrar` Registry masih kosong;
 * - `live`: Safe sudah memanggil `setRegistrar`.
 */
export type ManifestState = 'none' | 'local' | 'deployed-dormant' | 'live';

// Mode aplikasi (ARCHITECTURE §10.4). Klien hanya memakai mode untuk memilih tombol; validasi
// tetap di kontrak. Alamat yang Deployed (dorman) belum Live, jadi tetap `preview` (P52).
//
// `walletConfigured = false` (build tanpa konfigurasi wallet, mis. Project ID WalletConnect kosong)
// juga berarti preview: komponen transaksi butuh provider wallet, dan build seperti itu memang
// tidak bisa menandatangani apa pun.
export function resolveMode(input: {
  network: Network;
  manifest: ManifestState;
  walletConfigured?: boolean;
}): AppMode {
  if (input.manifest === 'none' || input.manifest === 'deployed-dormant') return 'preview';
  if (input.walletConfigured === false) return 'preview';
  if (input.manifest === 'local') {
    // Manifest lokal hanya sah untuk jaringan lokal; di jaringan lain ia diabaikan.
    return input.network === 'local' ? 'simulation' : 'preview';
  }
  return input.network === 'local' ? 'preview' : 'live';
}

export interface ModeCopy {
  /** Chip gelap di NoticeBar. */
  noticeChip: string;
  /** Teks NoticeBar setelah chip. */
  noticeText: string;
  /** Tag pada aksi/form. */
  actionTag: string;
}

// Teks per mode (DESIGN_SYSTEM §10.2). `live` hanya punya copy untuk TESTNET: go-live Robinhood
// testnet dibuka PM 20 Nov 2026. Mainnet (Fase 1b) masih FROZEN, jadi sengaja tetap tanpa copy,
// supaya tidak ada klaim "live" di mainnet yang lolos sebelum PM membukanya.
export function getModeCopy(mode: AppMode, network: Network): ModeCopy {
  switch (mode) {
    case 'preview':
      return {
        noticeChip: 'PREVIEW / NOT LIVE',
        // D18: sejak Check nyata ada (Phase 2), teks tidak lagi berbunyi "no live verification".
        noticeText: 'NO TOKEN SALE · CHECK READS PUBLIC CHAIN DATA',
        actionTag: 'PREVIEW',
      };
    case 'simulation':
      return {
        noticeChip: 'LOCAL SIMULATION',
        noticeText: 'NO REAL FUNDS',
        actionTag: 'SIMULATION',
      };
    case 'live':
      if (network === 'testnet') {
        return {
          noticeChip: 'TESTNET',
          noticeText: 'LAUNCHPAD OPEN ON TESTNET · NO REAL FUNDS · UNAUDITED',
          actionTag: 'TESTNET',
        };
      }
      throw new Error('Mode "live" di mainnet belum dibuka (Fase 1b FROZEN).');
  }
}
