import * as THREE from 'three';

import { PAL } from './palette';
import { UP, V, clamp, hdr, type ResourceBag } from './util';

export interface Frame {
  p: THREE.Vector3;
  t: THREE.Vector3;
  b: THREE.Vector3;
  n: THREE.Vector3;
}

export function frameAt(curve: THREE.Curve<THREE.Vector3>, u: number): Frame {
  const p = curve.getPointAt(u);
  const t = curve.getTangentAt(u).normalize();
  const b = V().crossVectors(t, UP).normalize();
  const n = V().crossVectors(b, t).normalize();
  return { p, t, b, n };
}

// Pita berpenampang kotak yang disapu sepanjang frame (slab, rail, strip glow).
function ribbon(frames: Frame[], x0: number, x1: number, y0: number, y1: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const pt = (f: Frame, x: number, y: number) => f.p.clone().addScaledVector(f.b, x).addScaledVector(f.n, y);
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    for (const v of [a, b, c, a, c, d]) pos.push(v.x, v.y, v.z);
  };
  const ring = (f: Frame) => [pt(f, x0, y1), pt(f, x1, y1), pt(f, x1, y0), pt(f, x0, y0)] as const;
  let prev = ring(frames[0]);
  quad(...prev);
  for (let i = 1; i < frames.length; i++) {
    const cur = ring(frames[i]);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      quad(prev[k], cur[k], cur[k2], prev[k2]);
    }
    prev = cur;
  }
  quad(...prev);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

interface TrackMaterials {
  tile: THREE.MeshStandardMaterial;
  slab: THREE.MeshStandardMaterial;
  rail: THREE.MeshStandardMaterial;
}

function trackMaterials(bag: ResourceBag): TrackMaterials {
  return bag.memo('track-materials', () => ({
    tile: bag.track(
      new THREE.MeshStandardMaterial({ color: PAL.trackTile, metalness: 0.55, roughness: 0.4, flatShading: true }),
    ),
    slab: bag.track(
      new THREE.MeshStandardMaterial({ color: PAL.trackSlab, metalness: 0.85, roughness: 0.5, side: THREE.DoubleSide }),
    ),
    rail: bag.track(
      new THREE.MeshStandardMaterial({ color: PAL.trackRail, metalness: 1, roughness: 0.3, side: THREE.DoubleSide }),
    ),
  }));
}

export interface TrackOptions {
  width?: number;
  tile?: number;
  glow?: number;
  seed?: number;
}

export interface Track {
  group: THREE.Group;
  curve: THREE.Curve<THREE.Vector3>;
  len: number;
  width: number;
  tiles: THREE.InstancedMesh;
  /** Frame pada jarak `s` (satuan dunia) dari awal track. */
  at(s: number): Frame;
}

export function makeTrack(
  bag: ResourceBag,
  curve: THREE.Curve<THREE.Vector3>,
  { width = 1.7, tile = 0.3, glow = PAL.mint2, seed = 7 }: TrackOptions = {},
): Track {
  const len = curve.getLength();
  const rows = Math.max(6, Math.round(len / tile));
  const cols = Math.max(3, Math.round(width / tile));
  const tw = width / cols;
  const rl = len / rows;
  const mats = trackMaterials(bag);
  const group = new THREE.Group();
  const tileGeo = bag.track(new THREE.ConeGeometry(tw * 0.655, tw * 0.34, 4, 1));
  tileGeo.rotateY(Math.PI / 4);
  tileGeo.translate(0, tw * 0.17, 0);
  const tiles = bag.track(new THREE.InstancedMesh(tileGeo, mats.tile, rows * cols));
  // mulberry32 (konstanta = 0x6D2B79F5): variasi terang tile harus sama di setiap muat.
  let rnd = seed >>> 0;
  const rand = () => {
    rnd = (rnd + 1831565813) >>> 0;
    let x = Math.imul(rnd ^ (rnd >>> 15), 1 | rnd);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const col = new THREE.Color();
  const tz = V();
  const m4 = new THREE.Matrix4();
  for (let i = 0, k = 0; i < rows; i++) {
    const f = frameAt(curve, (i + 0.5) / rows);
    tz.copy(f.t).multiplyScalar(rl / tw);
    for (let j = 0; j < cols; j++, k++) {
      const off = (j - (cols - 1) / 2) * tw;
      m4.makeBasis(f.b, f.n, tz);
      m4.setPosition(f.p.x + f.b.x * off, f.p.y + f.b.y * off, f.p.z + f.b.z * off);
      tiles.setMatrixAt(k, m4);
      const r = rand();
      tiles.setColorAt(k, col.setScalar(r < 0.1 ? 2.6 : r < 0.34 ? 0.38 : 0.75 + r * 0.6));
    }
  }
  tiles.instanceMatrix.needsUpdate = true;
  if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
  group.add(tiles);
  const frames: Frame[] = [];
  for (let i = 0; i <= rows; i++) frames.push(frameAt(curve, i / rows));
  const hw = width / 2;
  group.add(new THREE.Mesh(bag.track(ribbon(frames, -hw - 0.04, hw + 0.04, -0.22, -0.025)), mats.slab));
  for (const d of [-1, 1]) {
    group.add(new THREE.Mesh(bag.track(ribbon(frames, d * (hw + 0.03), d * (hw + 0.14), -0.22, 0.11)), mats.rail));
    group.add(
      new THREE.Mesh(
        bag.track(ribbon(frames, d * (hw + 0.065), d * (hw + 0.105), 0.11, 0.122)),
        bag.track(new THREE.MeshBasicMaterial({ color: hdr(glow, 0.3), side: THREE.DoubleSide })),
      ),
    );
  }
  return { group, curve, len, width, tiles, at: (s) => frameAt(curve, clamp(s / len)) };
}
