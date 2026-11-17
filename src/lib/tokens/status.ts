import type { VerifyReading } from '@/types/domain';
import type { DisplayStatus, GraduatorStatus } from '@/types/enums';

// Aturan status tampilan (PRD §4.1, §5.6; CLAUDE.md §3 butir 4). Murni, tanpa jaringan.

/**
 * - Bonding / Graduated / Expanding mengikuti status Graduator apa adanya.
 * - **Locked hanya bila `verify()` terbaca dan bernilai true di SEMUA chain token**, dan
 *   Registry-nya dipegang kontrak yang dikenal manifest.
 * - Graduator berkata Locked tetapi ada `verify()` false → Changed.
 * - Ada chain yang tidak terbaca → `unread`: tidak ditebak Locked maupun Changed.
 */
export function deriveStatus(graduatorStatus: GraduatorStatus, verify: VerifyReading[]): DisplayStatus {
  switch (graduatorStatus) {
    case 'bonding':
      return 'bonding';
    case 'graduated':
      return 'graduated';
    case 'expanding':
      return 'expanding';
    case 'locked': {
      if (verify.length === 0 || verify.some((reading) => reading.status === 'unread')) return 'unread';
      const allLocked = verify.every(
        (reading) => reading.status === 'read' && reading.locked === true && reading.registrarKnown === true,
      );
      return allLocked ? 'locked' : 'changed';
    }
    case 'none':
      return 'unread';
  }
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  bonding: 'Bonding',
  graduated: 'Graduated · awaiting expansion',
  expanding: 'Expanding',
  locked: 'Locked',
  changed: 'Changed',
  unread: 'Not read',
};

/** Label ringkas untuk kartu (DESIGN_SYSTEM §12). */
export const STATUS_SHORT: Record<DisplayStatus, string> = {
  bonding: 'BONDING',
  graduated: 'GRADUATED',
  expanding: 'EXPANDING',
  locked: 'LOCKED',
  changed: 'CHANGED',
  unread: 'NOT READ',
};

/** Kelas warna `.status` yang sudah ada di baseline CSS. Locked memakai warna dasar (mint). */
export const STATUS_CLASS: Record<DisplayStatus, string> = {
  bonding: 'orange',
  graduated: 'blue',
  expanding: 'blue',
  locked: '',
  changed: 'danger',
  unread: 'muted',
};

/** Filter Explore: "Graduated" mencakup token yang sedang Expanding (D16). */
export type StatusFilter = 'all' | 'bonding' | 'graduated' | 'locked';

export function matchesFilter(status: DisplayStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'graduated') return status === 'graduated' || status === 'expanding';
  return status === filter;
}

export function isStatusFilter(value: string): value is StatusFilter {
  return value === 'all' || value === 'bonding' || value === 'graduated' || value === 'locked';
}
