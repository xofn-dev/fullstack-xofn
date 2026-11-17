import * as THREE from 'three';

import { GLYPH_INK } from './palette';
import type { ResourceBag } from './util';

// Emblem digambar di canvas (tanda asli XofN, bukan logo chain).
export type GlyphKind = 'x' | 'diamond' | 'star' | 'hex' | 'one';

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas context unavailable');
  return g;
}

export function glyphTexture(bag: ResourceBag, kind: GlyphKind): THREE.CanvasTexture {
  return bag.memo(`glyph:${kind}`, () => {
    const s = 256;
    const m = s / 2;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = context2d(c);
    g.strokeStyle = g.fillStyle = GLYPH_INK;
    g.lineWidth = 20;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (kind === 'x') {
      g.lineWidth = 27;
      g.beginPath();
      g.moveTo(74, 74);
      g.lineTo(182, 182);
      g.moveTo(182, 74);
      g.lineTo(74, 182);
      g.stroke();
    } else if (kind === 'diamond') {
      g.beginPath();
      g.moveTo(m, 50);
      g.lineTo(198, m);
      g.lineTo(m, 206);
      g.lineTo(58, m);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.arc(m, m, 11, 0, 7);
      g.fill();
    } else if (kind === 'star') {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 2;
        g.beginPath();
        g.moveTo(m + Math.cos(a) * 78, m + Math.sin(a) * 78);
        g.lineTo(m - Math.cos(a) * 78, m - Math.sin(a) * 78);
        g.stroke();
      }
    } else if (kind === 'hex') {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        const x = m + Math.cos(a) * 80;
        const y = m + Math.sin(a) * 80;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
      g.stroke();
      g.beginPath();
      g.arc(m, m, 24, 0, 7);
      g.stroke();
    } else {
      g.font = '700 96px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('1/1', m, m + 6);
    }
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
