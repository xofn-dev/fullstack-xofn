import type { AppMode, Network } from '@/types/enums';

// Mode aplikasi (ARCHITECTURE §10.4). Ditentukan dari jaringan aktif dan ada-tidaknya manifest
// deployment yang sah. Klien hanya memakai mode untuk memilih tombol; validasi tetap di kontrak.
export function resolveMode(input: { network: Network; hasManifest: boolean }): AppMode {
  if (!input.hasManifest) return 'preview';
  return input.network === 'local' ? 'simulation' : 'live';
}

export interface ModeCopy {
  /** Chip gelap di NoticeBar. */
  noticeChip: string;
  /** Teks NoticeBar setelah chip. */
  noticeText: string;
  /** Tag pada aksi/form. */
  actionTag: string;
}

// Teks per mode (DESIGN_SYSTEM §10.2). Mode `live` FROZEN (Phase 6–7): sengaja tanpa copy,
// supaya tidak ada klaim "live" yang lolos sebelum PM membuka phase itu.
export function getModeCopy(mode: AppMode): ModeCopy {
  switch (mode) {
    case 'preview':
      return {
        noticeChip: 'PREVIEW / NOT LIVE',
        noticeText: 'NO TOKEN SALE OR LIVE VERIFICATION',
        actionTag: 'PREVIEW',
      };
    case 'simulation':
      return {
        noticeChip: 'LOCAL SIMULATION',
        noticeText: 'NO REAL FUNDS',
        actionTag: 'SIMULATION',
      };
    case 'live':
      throw new Error('Mode "live" belum dibuka (Phase 6–7 FROZEN).');
  }
}
