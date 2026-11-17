import * as THREE from 'three';

import { glyphTexture, type GlyphKind } from './glyphs';
import { PAL } from './palette';
import { UP, type ResourceBag } from './util';

export const COIN_R = 0.5;
export const COIN_H = 0.085;

interface CoinGeometries {
  body: THREE.LatheGeometry;
  face: THREE.CircleGeometry;
  ring: THREE.TorusGeometry;
}

function coinGeometries(bag: ResourceBag): CoinGeometries {
  return bag.memo('coin-geometries', () => {
    const h = COIN_H;
    const R = COIN_R;
    const prof = (
      [
        [0, -h * 0.6],
        [0.73, -h * 0.6],
        [0.79, -h],
        [0.93, -h],
        [1, -h * 0.5],
        [1, h * 0.5],
        [0.93, h],
        [0.79, h],
        [0.73, h * 0.6],
        [0, h * 0.6],
      ] as const
    ).map(([x, y]) => new THREE.Vector2(x * R, y));
    const body = bag.track(new THREE.LatheGeometry(prof, 72));
    body.rotateX(Math.PI / 2); // sumbu koin -> Z lokal
    return {
      body,
      face: bag.track(new THREE.CircleGeometry(R * 0.6, 48)),
      ring: bag.track(new THREE.TorusGeometry(R * 0.55, R * 0.062, 12, 72)),
    };
  });
}

export interface Coin {
  group: THREE.Group;
  spin: THREE.Group;
  kind: GlyphKind;
  plane: THREE.Plane;
  bodyMat: THREE.MeshStandardMaterial;
  glyphMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshBasicMaterial;
  setKind(kind: GlyphKind): void;
  setRing(v: number, hex?: number): void;
  setGlyph(v: number, hex?: number): void;
  clipNone(): void;
  clipAbove(n: THREE.Vector3, p: THREE.Vector3): void;
  clipBelow(n: THREE.Vector3, p: THREE.Vector3): void;
}

export function makeCoin(bag: ResourceBag, kind: GlyphKind = 'x'): Coin {
  const G = coinGeometries(bag);
  const bodyMat = bag.track(
    new THREE.MeshStandardMaterial({ color: PAL.coinBody, metalness: 1, roughness: 0.28, side: THREE.DoubleSide }),
  );
  const glyphMat = bag.track(
    new THREE.MeshStandardMaterial({
      map: glyphTexture(bag, kind),
      emissiveMap: glyphTexture(bag, kind),
      transparent: true,
      color: PAL.coinGlyph,
      emissive: PAL.white,
      emissiveIntensity: 0.42,
      metalness: 0.2,
      roughness: 0.4,
      depthWrite: false,
    }),
  );
  const ringMat = bag.track(new THREE.MeshBasicMaterial({ color: PAL.black }));
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  spin.add(new THREE.Mesh(G.body, bodyMat));
  const faces = [1, -1].map((d) => {
    const m = new THREE.Mesh(G.face, glyphMat);
    m.position.z = d * (COIN_H * 0.6 + 0.004);
    if (d < 0) m.rotation.y = Math.PI;
    spin.add(m);
    return m;
  });
  const rings = [1, -1].map((d) => {
    const m = new THREE.Mesh(G.ring, ringMat);
    m.position.z = d * COIN_H * 0.62;
    m.visible = false;
    spin.add(m);
    return m;
  });
  // Clip plane per koin (default: tidak memotong apa pun) supaya koin tampak "masuk" gate.
  const plane = new THREE.Plane(UP.clone(), 1e4);
  bodyMat.clippingPlanes = glyphMat.clippingPlanes = ringMat.clippingPlanes = [plane];
  spin.traverse((o) => {
    o.userData.coin = true;
  });
  const coin: Coin = {
    group,
    spin,
    kind,
    plane,
    bodyMat,
    glyphMat,
    ringMat,
    setKind(k) {
      coin.kind = k;
      glyphMat.map = glyphMat.emissiveMap = glyphTexture(bag, k);
    },
    setRing(v, hex = PAL.mint2) {
      for (const r of rings) r.visible = v > 0.01;
      ringMat.color.set(hex).multiplyScalar(v * 2.5);
    },
    setGlyph(v, hex = PAL.white) {
      for (const f of faces) f.visible = v > 0.01;
      glyphMat.opacity = v;
      glyphMat.emissive.set(hex);
      glyphMat.color.set(hex === PAL.white ? PAL.coinGlyph : hex);
    },
    clipNone() {
      plane.normal.copy(UP);
      plane.constant = 1e4;
    },
    clipAbove(n, p) {
      plane.normal.copy(n);
      plane.constant = -n.dot(p);
    },
    clipBelow(n, p) {
      plane.normal.copy(n).negate();
      plane.constant = n.dot(p);
    },
  };
  return coin;
}
