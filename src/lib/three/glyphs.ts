import * as THREE from 'three';

import { GLYPH_INK, LOGO_BADGE } from './palette';
import type { ResourceBag } from './util';

// Muka koin: logo brand XofN (`/logo.jpeg`), logo chain (`/chains/*.svg`) dan plat teks "1/1" yang selalu ditolak.
export type GlyphKind = 'brand' | 'robinhood' | 'base' | 'arbitrum' | 'one';

/** Kind yang berupa gambar berwarna penuh; sisanya ("1/1") adalah tinta putih yang diwarnai material. */
export const isImageGlyph = (kind: GlyphKind): boolean => kind !== 'one';

const LOGO_SRC = {
  brand: '/logo.jpeg',
  robinhood: '/chains/robinhood.svg',
  base: '/chains/base.svg',
  arbitrum: '/chains/arbitrum.svg',
} as const;

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas context unavailable');
  return g;
}

// Gambar dimuat async: canvas diisi alas dulu (tidak ada kilatan kosong), logo digambar saat siap.
function imageGlyph(bag: ResourceBag, kind: keyof typeof LOGO_SRC): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = context2d(c);
  // Alas berbentuk cakram (luar cakram transparan) supaya logo tidak tampil sebagai kotak hitam di galaxy.
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = LOGO_BADGE[kind];
  g.fillRect(0, 0, s, s);
  const t = bag.track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    // Logo brand mengisi penuh (sudah berlatar hitam); logo chain diberi ruang di dalam cakram.
    const pad = kind === 'brand' ? 0 : s * 0.17;
    g.drawImage(img, pad, pad, s - pad * 2, s - pad * 2);
    t.needsUpdate = true;
  };
  img.src = LOGO_SRC[kind];
  return t;
}

export function glyphTexture(bag: ResourceBag, kind: GlyphKind): THREE.CanvasTexture {
  return bag.memo(`glyph:${kind}`, () => {
    if (kind !== 'one') return imageGlyph(bag, kind);
    const s = 256;
    const m = s / 2;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = context2d(c);
    g.fillStyle = GLYPH_INK;
    g.font = '700 96px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('1/1', m, m + 6);
    const t = bag.track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

// Titik cahaya lembut: dipakai dust, bintang, flare gate, halo koin.
export function flareTexture(bag: ResourceBag): THREE.CanvasTexture {
  return bag.memo('flare', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = context2d(c);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.22, 'rgba(255,255,255,.55)');
    r.addColorStop(0.55, 'rgba(255,255,255,.12)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return bag.track(new THREE.CanvasTexture(c));
  });
}
