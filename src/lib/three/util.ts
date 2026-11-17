import * as THREE from 'three';

export const UP: Readonly<THREE.Vector3> = new THREE.Vector3(0, 1, 0);
export const V = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (t: number): number => {
  const u = clamp(t);
  return u * u * (3 - 2 * u);
};
export const damp = (a: number, b: number, k: number, dt: number): number => lerp(a, b, 1 - Math.exp(-k * dt));
// Warna di atas 1.0 supaya lolos threshold bloom.
export const hdr = (hex: number, k: number): THREE.Color => new THREE.Color(hex).multiplyScalar(k);

// Dibaca saat mount, bukan saat modul dimuat: modul ini bisa ter-import sebelum ada window.
export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const hasFinePointer = (): boolean => window.matchMedia('(pointer:fine)').matches;

export interface Disposable {
  dispose(): void;
}

/**
 * Kantong resource GPU milik SATU scene. HTML asli memakai cache tingkat modul
 * (glyph, flare, geometri koin, material track); di sini cache hidup per scene
 * supaya dispose satu scene tidak mencabut resource scene lain.
 */
export class ResourceBag {
  private readonly items = new Set<Disposable>();
  private readonly cache = new Map<string, unknown>();

  track<T extends Disposable>(item: T): T {
    this.items.add(item);
    return item;
  }

  memo<T>(key: string, make: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, make());
    return this.cache.get(key) as T;
  }

  dispose(): void {
    for (const item of this.items) item.dispose();
    this.items.clear();
    this.cache.clear();
  }
}

/**
 * Jaring pengaman: dispose geometri + material semua objek di bawah `root`.
 * Resource yang tidak ada di scene graph (material x-ray, env map) tetap lewat ResourceBag.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) {
      (o.geometry as THREE.BufferGeometry).dispose();
      const mats = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.Material[];
      for (const m of mats) m.dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
    } else if (o instanceof THREE.Sprite) {
      // Geometri Sprite dibagi lintas renderer oleh three; cukup materialnya.
      o.material.dispose();
    }
  });
}
