import * as THREE from 'three';

import { flareTexture } from './glyphs';
import { PAL } from './palette';
import { V, damp, hdr, type ResourceBag } from './util';

export interface Gate {
  group: THREE.Group;
  R: number;
  flash: number;
  bad: number;
  power: number;
  lightScale: number;
  /** Kilat mint: koin lolos. */
  pulse(): void;
  /** Kilat merah: koin 1/1 ditolak. */
  reject(): void;
  update(dt: number, t: number): void;
}

// Gate XofN: pelat bercahaya yang ditembus koin.
export function makeGate(bag: ResourceBag, R = 1.2, markYaw = 0, markAngle = Math.PI / 4): Gate {
  const group = new THREE.Group();
  const dark = bag.track(new THREE.MeshStandardMaterial({ color: PAL.gateDark, metalness: 1, roughness: 0.3 }));
  const base = new THREE.Mesh(bag.track(new THREE.CylinderGeometry(R, R * 0.93, 0.1, 80)), dark);
  base.position.y = -0.055;
  group.add(base);
  const rimMat = bag.track(new THREE.MeshBasicMaterial({ color: hdr(PAL.mint, 1.15) }));
  const rim = new THREE.Mesh(bag.track(new THREE.TorusGeometry(R * 1.17, 0.011, 8, 140)), rimMat);
  rim.rotation.x = Math.PI / 2;
  group.add(rim);
  const rr = R * 0.76;
  const shape = new THREE.Shape();
  const corners: THREE.Vector2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + 0.18;
    const k = rr * (1 + 0.07 * Math.sin(i * 2.4 + 0.6));
    corners.push(new THREE.Vector2(Math.cos(a) * k, Math.sin(a) * k));
  }
  corners.forEach((c, i) => {
    const p = corners[(i + 5) % 6];
    const q = corners[(i + 1) % 6];
    const a = c.clone().lerp(p, 0.3);
    const b = c.clone().lerp(q, 0.3);
    if (i) shape.lineTo(a.x, a.y);
    else shape.moveTo(a.x, a.y);
    shape.quadraticCurveTo(c.x, c.y, b.x, b.y);
  });
  shape.closePath();
  const plateMat = bag.track(new THREE.MeshBasicMaterial({ color: PAL.white, side: THREE.DoubleSide }));
  const plateGeo = bag.track(new THREE.ShapeGeometry(shape, 20));
  plateGeo.rotateX(-Math.PI / 2);
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.y = 0.004;
  group.add(plate);
  const edgeMat = bag.track(new THREE.MeshBasicMaterial({ color: PAL.white }));
  const loop = new THREE.CatmullRomCurve3(
    shape
      .getPoints(18)
      .slice(0, -1)
      .map((p) => V(p.x, 0, -p.y)),
    true,
  );
  const edge = new THREE.Mesh(bag.track(new THREE.TubeGeometry(loop, 180, 0.026, 8, true)), edgeMat);
  edge.position.y = 0.012;
  group.add(edge);
  const markMat = bag.track(new THREE.MeshBasicMaterial({ color: PAL.gateMark }));
  // Tanda X dimiringkan lebih dulu supaya dari kamera terbaca sebagai X.
  const mark = new THREE.Group();
  mark.rotation.y = markYaw;
  mark.position.y = 0.014;
  group.add(mark);
  const markGeo = bag.track(new THREE.BoxGeometry(R * 0.6, 0.012, R * 0.1));
  for (const a of [markAngle, -markAngle]) {
    const m = new THREE.Mesh(markGeo, markMat);
    m.rotation.y = a;
    mark.add(m);
  }
  const lightUp = new THREE.PointLight(PAL.mint2, 26, 9, 2);
  lightUp.position.y = 0.7;
  group.add(lightUp);
  const lightDown = new THREE.PointLight(PAL.mint2, 40, 11, 2);
  lightDown.position.y = -0.9;
  group.add(lightDown);
  const flareMat = bag.track(
    new THREE.SpriteMaterial({
      map: flareTexture(bag),
      color: PAL.mint,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  const flare = new THREE.Sprite(flareMat);
  flare.position.y = 0.15;
  group.add(flare);
  const cMint = new THREE.Color(PAL.mint2);
  const cPlate = new THREE.Color(PAL.gatePlate);
  const cBad = new THREE.Color(PAL.danger);
  const tmp = new THREE.Color();
  const gate: Gate = {
    group,
    R,
    flash: 0,
    bad: 0,
    power: 1,
    lightScale: 1,
    pulse() {
      gate.flash = 1;
    },
    reject() {
      gate.flash = 1;
      gate.bad = 1;
    },
    update(dt, t) {
      gate.flash = damp(gate.flash, 0, 4.2, dt);
      gate.bad = damp(gate.bad, 0, 2.2, dt);
      const breathe = 1 + 0.1 * Math.sin(t * 1.9);
      const p = gate.power;
      plateMat.color.copy(tmp.copy(cPlate).lerp(cBad, gate.bad)).multiplyScalar((0.84 * breathe + gate.flash * 0.45) * p);
      edgeMat.color.copy(tmp.copy(cMint).lerp(cBad, gate.bad)).multiplyScalar((2.5 * breathe + gate.flash * 1.6) * p);
      rimMat.color.copy(tmp.set(PAL.mint).lerp(cBad, gate.bad)).multiplyScalar((0.9 + gate.flash) * p);
      lightUp.color.copy(tmp.copy(cMint).lerp(cBad, gate.bad));
      lightDown.color.copy(lightUp.color);
      lightUp.intensity = (22 + gate.flash * 40) * p * gate.lightScale;
      lightDown.intensity = (34 + gate.flash * 46) * p * gate.lightScale;
      flareMat.opacity = gate.flash * 0.5;
      flareMat.color.copy(lightUp.color);
      flare.scale.setScalar(1.4 + (1 - gate.flash) * 4.2);
      rim.rotation.z = t * 0.12;
    },
  };
  return gate;
}
