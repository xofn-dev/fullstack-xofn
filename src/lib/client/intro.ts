'use client';

// Sinyal kecil antara scene hero (chunk dinamis three.js), intro loader, dan koreografi landing.
// Modul singleton dipakai bersama oleh semua chunk klien, jadi tidak perlu event global.

export type HeroSceneState = 'idle' | 'mounting' | 'ok' | 'fail';

let heroState: HeroSceneState = 'idle';
const heroListeners = new Set<(state: HeroSceneState) => void>();

/** Dipanggil komponen hero: chunk termuat (`mounting`), frame pertama tampil (`ok`), atau WebGL gagal (`fail`). */
export function reportHeroState(state: HeroSceneState): void {
  heroState = state;
  for (const fn of heroListeners) fn(state);
}

export function getHeroState(): HeroSceneState {
  return heroState;
}

/** Berlangganan perubahan status scene hero. Mengembalikan fungsi untuk berhenti. */
export function subscribeHeroState(fn: (state: HeroSceneState) => void): () => void {
  heroListeners.add(fn);
  return () => heroListeners.delete(fn);
}

let introDone = false;
const introListeners = new Set<() => void>();

/** Loader memanggil ini tepat saat landing mulai terlihat (iris terbuka). */
export function markIntroDone(): void {
  if (introDone) return;
  introDone = true;
  for (const fn of [...introListeners]) fn();
  introListeners.clear();
}

/**
 * Jalankan `fn` setelah intro loader selesai. Bila tidak ada loader di DOM (halaman lain,
 * navigasi klien, atau intro sudah lewat), `fn` langsung dijalankan.
 * Mengembalikan fungsi pembatal untuk cleanup effect.
 */
export function whenIntroDone(fn: () => void): () => void {
  if (introDone || !document.querySelector('[data-intro-loader]')) {
    fn();
    return () => {};
  }
  introListeners.add(fn);
  return () => introListeners.delete(fn);
}

// Loader penuh hanya pada pemuatan dokumen pertama. Navigasi klien kembali ke `/` tidak memutarnya lagi.
let booted = false;

export function hasIntroBooted(): boolean {
  return booted;
}

export function markIntroBooted(): void {
  booted = true;
}
