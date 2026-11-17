import * as THREE from 'three';

import { flareTexture } from './glyphs';
import { PAL } from './palette';
import type { ResourceBag } from './util';

/** Partikel debu yang naik perlahan. Mengembalikan fungsi update per frame. */
export function addDust(
  bag: ResourceBag,
  scene: THREE.Scene,
  count: number,
  box: THREE.Vector3,
  center: THREE.Vector3,
): (dt: number) => void {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = center.x + (Math.random() - 0.5) * box.x;
    pos[i * 3 + 1] = center.y + (Math.random() - 0.5) * box.y;
    pos[i * 3 + 2] = center.z + (Math.random() - 0.5) * box.z;
  }
  const geo = bag.track(new THREE.BufferGeometry());
  const attr = new THREE.BufferAttribute(pos, 3);
  geo.setAttribute('position', attr);
  const mat = bag.track(
    new THREE.PointsMaterial({
      color: PAL.dust,
      size: 0.045,
      map: flareTexture(bag),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  scene.add(new THREE.Points(geo, mat));
  return (dt) => {
    for (let i = 0; i < count; i++) {
      let y = attr.getY(i) + dt * (0.05 + (i % 7) * 0.012);
      if (y > center.y + box.y / 2) y -= box.y;
      attr.setY(i, y);
    }
    attr.needsUpdate = true;
  };
}

/**
 * Beberapa bintang dan glow lembut supaya scene berbingkai (hero, arsitektur) terasa
 * berada di langit yang sama dengan halaman. HTML menggantungkannya pada kelas body
 * `v6-galaxy`; V8 selalu memakai galaxy, jadi di sini selalu aktif.
 */
export function addSky(
  bag: ResourceBag,
  scene: THREE.Scene,
  count: number,
  center: THREE.Vector3,
  rMin: number,
  rMax: number,
  glowAt: THREE.Vector3,
  glowSize: number,
): void {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const tones = [new THREE.Color(PAL.starWhite), new THREE.Color(PAL.mint2), new THREE.Color(PAL.blue)];
  for (let i = 0; i < count; i++) {
    const r = rMin + (rMax - rMin) * Math.random();
    const a = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = center.x + r * Math.sin(p) * Math.cos(a);
    pos[i * 3 + 1] = center.y + r * Math.cos(p) * 0.75;
    pos[i * 3 + 2] = center.z - Math.abs(r * Math.sin(p) * Math.sin(a));
    const q = Math.random();
    const c = q < 0.55 ? tones[0] : q < 0.88 ? tones[1] : tones[2];
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const geo = bag.track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(
    new THREE.Points(
      geo,
      bag.track(
        new THREE.PointsMaterial({
          size: 0.11,
          map: flareTexture(bag),
          vertexColors: true,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      ),
    ),
  );
  const glow = new THREE.Sprite(
    bag.track(
      new THREE.SpriteMaterial({
        map: flareTexture(bag),
        color: PAL.skyGlow,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        fog: false,
      }),
    ),
  );
  glow.position.copy(glowAt);
  glow.scale.setScalar(glowSize);
  glow.renderOrder = -2;
  scene.add(glow);
}

export function addLights(scene: THREE.Scene): void {
  const key = new THREE.DirectionalLight(PAL.keyLight, 2.9);
  key.position.set(-5, 9, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(PAL.blue, 2.6);
  rim.position.set(7, 3, -7);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(PAL.mint2, 0.55);
  fill.position.set(-6, -3, 4);
  scene.add(fill);
}
