import type { DirectionReading, PathwayLabel, UlnConfig } from '@/types/domain';
import { isZeroAddress } from '@/lib/lz/decode';

// Algoritma label pathway (ARCHITECTURE §7). Semua fungsi murni dan dites di tests/lz.test.ts.
// Label menyatakan FAKTA konfigurasi, bukan penilaian terhadap token (PRD §4.3).

type DirectionLabel = Exclude<PathwayLabel, 'two-plus-locked'>;

/** Jumlah verifikator yang benar-benar harus setuju: DVN wajib + threshold opsional. */
export function effectiveVerifierCount(config: UlnConfig): number {
  return config.requiredDvnCount + config.optionalDvnThreshold;
}

export function labelDirection(config: UlnConfig, deadDvn: string): Exclude<DirectionLabel, 'unread'> {
  const dead = deadDvn.toLowerCase();
  const usesDead = [...config.requiredDvns, ...config.optionalDvns].some(
    (dvn) => dvn.toLowerCase() === dead,
  );
  // Dead DVN = placeholder tanpa verifikator; pesan tidak akan pernah terkirim.
  if (usesDead) return 'blocked';
  return effectiveVerifierCount(config) <= 1 ? 'one-of-one' : 'two-plus';
}

// Urutan "terburuk dulu" untuk menggabungkan dua arah atau beberapa pathway.
const SEVERITY: Record<PathwayLabel, number> = {
  'one-of-one': 4,
  blocked: 3,
  unread: 2,
  'two-plus': 1,
  'two-plus-locked': 0,
};

export function worstLabel<T extends PathwayLabel>(labels: T[]): T | null {
  let worst: T | null = null;
  for (const label of labels) {
    if (worst === null || SEVERITY[label] > SEVERITY[worst]) worst = label;
  }
  return worst;
}

export interface LockContext {
  owner: string | null;
  ownerReadable: boolean;
  delegate: string | null;
  proxyAdmin: string | null;
}

/**
 * Alasan sebuah pathway 2+ BELUM bisa disebut terkunci. Daftar kosong = terkunci.
 * Syarat: owner = 0, delegate = 0, library eksplisit di kedua arah, tidak ada grace period
 * library lama, tidak ada field yang masih bergantung pada default, dan bukan proxy beradmin.
 */
export function lockBlockers(
  context: LockContext,
  send: DirectionReading,
  receive: DirectionReading,
): string[] {
  const reasons: string[] = [];
  if (!context.ownerReadable) reasons.push('Owner is not readable');
  else if (!isZeroAddress(context.owner)) reasons.push('Owner is not zero');
  if (context.delegate === null) reasons.push('Delegate is not readable');
  else if (!isZeroAddress(context.delegate)) reasons.push('Delegate is not zero');
  if (context.proxyAdmin) reasons.push('Contract is a proxy with an admin');
  if (send.libraryIsDefault) reasons.push('Send library is the default (can change)');
  if (receive.libraryIsDefault) reasons.push('Receive library is the default (can change)');
  if (receive.receiveTimeoutSet) reasons.push('A previous receive library is still within its grace period');
  if (send.raw === null) reasons.push('Send app config is not readable');
  if (receive.raw === null) reasons.push('Receive app config is not readable');
  for (const field of send.dependsOnDefault ?? []) reasons.push(`Send ${field} use the default config (can change)`);
  for (const field of receive.dependsOnDefault ?? []) reasons.push(`Receive ${field} use the default config (can change)`);
  return reasons;
}

/** Label pathway = arah terburuk; naik ke `two-plus-locked` hanya bila tidak ada penghalang. */
export function labelPathway(
  context: LockContext,
  send: DirectionReading,
  receive: DirectionReading,
): { label: PathwayLabel; notLockedBecause: string[] } {
  const worst = worstLabel<DirectionLabel>([send.label, receive.label]) ?? 'unread';
  if (worst !== 'two-plus') return { label: worst, notLockedBecause: [] };
  const blockers = lockBlockers(context, send, receive);
  return blockers.length === 0
    ? { label: 'two-plus-locked', notLockedBecause: [] }
    : { label: 'two-plus', notLockedBecause: blockers };
}

export interface LabelCopy {
  /** Teks label (mono uppercase). */
  text: string;
  /** Kelas status dari stylesheet. */
  tone: 'danger' | 'caution' | 'ok' | 'muted';
  /** Penjelasan netral satu kalimat. */
  note: string;
}

// Copy netral (PRD §4.3): tidak ada kata "unsafe"; status tidak hanya lewat warna.
export const LABEL_COPY: Record<PathwayLabel, LabelCopy> = {
  'one-of-one': {
    text: '1-OF-1',
    tone: 'danger',
    note: 'One verifier is enough to approve a message on this pathway.',
  },
  'two-plus': {
    text: '2+',
    tone: 'caution',
    note: 'Two or more verifiers must agree. The configuration can still be changed.',
  },
  'two-plus-locked': {
    text: '2+ · LOCKED',
    tone: 'ok',
    note: 'Two or more verifiers must agree, and owner and delegate are zero with pinned libraries.',
  },
  blocked: {
    text: 'BLOCKED',
    tone: 'muted',
    note: 'No verifier configured; messages cannot be delivered.',
  },
  unread: {
    text: 'NOT READ',
    tone: 'muted',
    note: 'This pathway could not be read. No value is shown instead of a guess.',
  },
};
