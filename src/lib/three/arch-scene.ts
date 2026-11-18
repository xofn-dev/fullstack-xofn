import * as THREE from 'three';

import { ARCH_STATIONS, type ArchMode, type ArchStation, type Tier } from '@/types/enums';

import { addDust, addLights, addSky } from './atmosphere';
import { COIN_H, COIN_R, makeCoin, type Coin } from './coin';
import { makeGate } from './gate';
import { PAL } from './palette';
import { createStage, type Stage } from './stage';
import { makeTrack, type Frame, type Track } from './track';
import { UP, V, clamp, damp, hasFinePointer, hdr, lerp, prefersReducedMotion, smooth } from './util';

export interface ArchOptions {
  /** `#archCoinCanvas`, di dalam `#archStage` (yang juga memuat pod `#archHotspots [data-arch]`). */
  canvas: HTMLCanvasElement;
  active: ArchStation;
  mode: ArchMode;
  tier: Tier;
}

export interface ArchController {
  setActive(station: ArchStation): void;
  setMode(mode: ArchMode): void;
  setTier(tier: Tier): void;
  /** Minta satu frame ulang (mis. setelah React merender ulang pod dan menimpa className). */
  invalidate(): void;
  dispose(): void;
}

interface GlowMesh {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  hex: number;
}

interface Pad {
  g: THREE.Group;
  ring: GlowMesh;
  inner: GlowMesh;
  light: THREE.PointLight;
  top: THREE.Vector3;
}

interface Hoop {
  glow: GlowMesh;
  s: number;
  req: boolean;
  idx: number;
  level: number;
  target: number;
}

type CamShot = readonly [look: THREE.Vector3, offset: THREE.Vector3];

/**
 * SECTION 02 "coin run": satu koin melewati enam stasiun protokol.
 * Key stasiun berbasis peran (HTML: base→home, arb→expA, robin→expB); geometri,
 * posisi, dan warna tiap stasiun sama persis dengan HTML.
 * Mengembalikan `null` bila markup tidak lengkap atau WebGL tidak tersedia.
 */
export function mountArch(opts: ArchOptions): ArchController | null {
  const { canvas } = opts;
  const stageEl = canvas.closest<HTMLElement>('#archStage') ?? canvas.parentElement;
  if (!stageEl) return null;

  const reduced = prefersReducedMotion();
  const fine = hasFinePointer();
  let st: Stage | null = null;
  const cleanups: (() => void)[] = [];
  const dispose = () => {
    for (const fn of cleanups.splice(0).reverse()) fn();
    st?.dispose();
    st = null;
  };

  try {
    const stage = createStage(canvas, { fov: 30, bloom: [0.5, 0.5, 0.92], reduced });
    st = stage;
    const { scene, camera, bag } = stage;
    const fog = new THREE.Fog(PAL.bg, 27, 60);
    scene.fog = fog;
    addLights(scene);
    const curve = (pts: [number, number, number][]) => new THREE.CatmullRomCurve3(pts.map((p) => V(...p)));
    const A = makeTrack(
      bag,
      curve([
        [-10.4, 4.25, 0.5],
        [-9, 4.2, 0.2],
        [-7.6, 3.7, 0],
        [-6.4, 2.8, 0],
        [-5.3, 2.15, 0],
      ]),
      { width: 1.5, seed: 5 },
    );
    const B = makeTrack(
      bag,
      curve([
        [-3.3, -1.75, 0.15],
        [-1.7, -2.15, 0.05],
        [0.4, -2.45, 0],
        [2.3, -2.7, 0],
      ]),
      { width: 1.5, seed: 17 },
    );
    const C1 = makeTrack(
      bag,
      curve([
        [2.75, -2.95, -0.62],
        [4, -3.2, -1.3],
        [5.3, -3.5, -2.3],
        [6.2, -3.72, -2.95],
      ]),
      { width: 1.1, seed: 23, glow: PAL.blue },
    );
    const C2 = makeTrack(
      bag,
      curve([
        [2.75, -2.95, 0.62],
        [4, -3.2, 1.3],
        [5.3, -3.5, 2.3],
        [6.2, -3.72, 2.95],
      ]),
      { width: 1.1, seed: 31, glow: PAL.violet },
    );
    const D1 = makeTrack(
      bag,
      curve([
        [7.75, -4.15, -2.75],
        [8.5, -4.3, -2],
        [9.1, -4.45, -1.2],
      ]),
      { width: 1.1, seed: 41 },
    );
    const D2 = makeTrack(
      bag,
      curve([
        [7.75, -4.15, 2.75],
        [8.5, -4.3, 2],
        [9.1, -4.45, 1.2],
      ]),
      { width: 1.1, seed: 47 },
    );
    const gate = makeGate(bag, 1.12, -0.22);
    gate.group.position.set(-3.95, 0.3, 0);
    gate.group.rotation.set(0.05, 0, -0.03);
    scene.add(A.group, B.group, C1.group, C2.group, D1.group, D2.group, gate.group);
    gate.group.updateMatrixWorld();
    const gP = gate.group.position.clone();
    const gN = UP.clone().applyQuaternion(gate.group.quaternion);
    const lift = COIN_R + 0.085;
    const dust = addDust(bag, scene, 170, V(30, 16, 14), V(0, -0.5, 0));
    addSky(bag, scene, 700, V(0, 0, -6), 16, 42, V(0, -1, -14), 44);
    const m4 = new THREE.Matrix4();

    /* properti stasiun */
    const dark = bag.track(new THREE.MeshStandardMaterial({ color: PAL.archDark, metalness: 1, roughness: 0.3 }));
    const glowMesh = (geo: THREE.BufferGeometry, hex: number): GlowMesh => {
      const mat = bag.track(new THREE.MeshBasicMaterial({ color: PAL.black }));
      return { mesh: new THREE.Mesh(bag.track(geo), mat), mat, hex };
    };
    const setGlow = (m: GlowMesh, k: number) => m.mat.color.set(m.hex).multiplyScalar(k);
    const hoopAt = (tr: Track, s: number, R: number, tube: number, hex: number): GlowMesh => {
      const f = tr.at(s);
      const m = glowMesh(new THREE.TorusGeometry(R, tube, 10, 72), hex);
      m.mesh.position.copy(f.p).addScaledVector(f.n, lift);
      m.mesh.quaternion.setFromRotationMatrix(m4.makeBasis(f.b, f.n, f.t));
      scene.add(m.mesh);
      return m;
    };
    const homeHoop = hoopAt(A, 0.5, 0.98, 0.042, PAL.blue);
    // 5 hoop DVN: 3 wajib (mint) + 2 opsional (biru).
    const hoops: Hoop[] = [0.3, 0.46, 0.62, 0.79, 0.93].map((k, i) => {
      const req = i < 3;
      const glow = hoopAt(B, k * B.len, 0.98, req ? 0.042 : 0.026, req ? PAL.mint2 : PAL.blue);
      return { glow, s: k * B.len, req, idx: i, level: 0, target: 0 };
    });
    const makePad = (pos: THREE.Vector3, hex: number): Pad => {
      const g = new THREE.Group();
      g.position.copy(pos);
      const body = new THREE.Mesh(bag.track(new THREE.CylinderGeometry(0.95, 0.86, 0.16, 64)), dark);
      body.position.y = -0.08;
      g.add(body);
      const ring = glowMesh(new THREE.TorusGeometry(0.95, 0.028, 10, 72), hex);
      ring.mesh.rotation.x = Math.PI / 2;
      g.add(ring.mesh);
      const inner = glowMesh(new THREE.TorusGeometry(0.55, 0.012, 8, 64), hex);
      inner.mesh.rotation.x = Math.PI / 2;
      inner.mesh.position.y = 0.01;
      g.add(inner.mesh);
      const light = new THREE.PointLight(hex, 0, 7, 2);
      light.position.y = 0.8;
      g.add(light);
      scene.add(g);
      return { g, ring, inner, light, top: pos.clone() };
    };
    const padA = makePad(V(6.95, -3.95, -3.3), PAL.blue); // expA
    const padB = makePad(V(6.95, -3.95, 3.3), PAL.violet); // expB
    const reg = (() => {
      const pos = V(10.35, -4.75, 0);
      const g = new THREE.Group();
      g.position.copy(pos);
      const body = new THREE.Mesh(bag.track(new THREE.CylinderGeometry(1.2, 1.05, 0.34, 72)), dark);
      body.position.y = -0.17;
      g.add(body);
      const ring = glowMesh(new THREE.TorusGeometry(1.2, 0.03, 10, 90), PAL.mint2);
      ring.mesh.rotation.x = Math.PI / 2;
      g.add(ring.mesh);
      const stack: Coin[] = [];
      for (let i = 0; i < 3; i++) {
        const c = makeCoin(bag, 'brand');
        c.group.position.set(0, COIN_H + i * COIN_H * 2.15, 0);
        c.group.rotation.set(-Math.PI / 2, 0, i * 0.7);
        c.setGlyph(0);
        c.setRing(0.5);
        g.add(c.group);
        stack.push(c);
      }
      const lock = glowMesh(new THREE.TorusGeometry(0.78, 0.03, 10, 80), PAL.mint);
      lock.mesh.rotation.x = Math.PI / 2;
      g.add(lock.mesh);
      const light = new THREE.PointLight(PAL.mint2, 0, 8, 2);
      light.position.y = 1.2;
      g.add(light);
      scene.add(g);
      return {
        g,
        ring,
        lock,
        light,
        stack,
        slot: (i: number) => pos.clone().add(V(0, COIN_H + (3 + i) * COIN_H * 2.15, 0)),
      };
    })();
    const grid = new THREE.GridHelper(64, 64, PAL.gridMajor, PAL.gridMinor);
    grid.position.y = -5.9;
    grid.visible = false;
    scene.add(grid);
    const wire = bag.track(
      new THREE.MeshBasicMaterial({ color: hdr(PAL.mint2, 0.7), wireframe: true, transparent: true, opacity: 0.55 }),
    );

    /* koin pengembara (+ salinan remote-nya setelah percabangan) */
    const c1 = makeCoin(bag, 'brand');
    const c2 = makeCoin(bag, 'brand');
    scene.add(c1.group, c2.group);
    const AEND = A.at(A.len);
    const BSTART = B.at(0);
    const BEND = B.at(B.len);
    const HOVER = gP.clone().add(V(0.18, -1.3, 0.1));
    const p0 = V();
    const p1 = V();
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion();
    const QFLAT = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2);
    const fPos = (f: Frame, v: THREE.Vector3) => v.copy(f.p).addScaledVector(f.n, lift);
    const fQuat = (f: Frame, q: THREE.Quaternion) => q.setFromRotationMatrix(m4.makeBasis(f.t, f.n, f.b));
    const along = (c: Coin, tr: Track, s: number) => {
      const f = tr.at(s);
      fPos(f, c.group.position);
      fQuat(f, c.group.quaternion);
      c.spin.rotation.z = -s / COIN_R;
    };
    const fall = (c: Coin, from: THREE.Vector3, to: THREE.Vector3, u: number) =>
      c.group.position.set(lerp(from.x, to.x, u), lerp(from.y, to.y, 0.3 * u + 0.7 * u * u), lerp(from.z, to.z, u));
    const hopTo = (c: Coin, from: THREE.Vector3, to: THREE.Vector3, u: number, h = 0.45) =>
      c.group.position.set(
        lerp(from.x, to.x, u),
        lerp(from.y, to.y, u) + Math.sin(u * Math.PI) * h,
        lerp(from.z, to.z, u),
      );
    const stand = (c: Coin, pad: Pad, spin: number) => {
      c.group.position.copy(pad.top).y += COIN_R + 0.02;
      c.group.quaternion.setFromAxisAngle(UP, spin);
      c.spin.rotation.z = 0;
    };
    const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));

    let fortress = opts.tier === 'fortress';
    let lockLevel = 0;
    let lockTarget = 0;
    let lockFlash = 0;
    const returning: readonly [Coin, Pad, Track, number][] = [
      [c1, padA, D1, 0],
      [c2, padB, D2, 0.07],
    ];
    // Pose deterministik untuk stasiun `k` pada progres p (0..1) ditambah waktu idle setelah tiba.
    const pose = (k: ArchStation, p: number, prevP: number, idleT: number) => {
      c1.group.visible = true;
      c2.group.visible = false;
      c1.clipNone();
      c2.clipNone();
      c1.setGlyph(1);
      c1.setRing(0);
      let hoopS = -1;
      let lock = 0;
      if (k === 'home') {
        along(c1, A, lerp(0.35, A.len * 0.4, smooth(p)) + Math.sin(idleT * 1.3) * 0.1);
        c1.group.position.y += (1 - smooth(seg(p, 0, 0.32))) * 2.5;
      } else if (k === 'core') {
        if (p < 0.5) along(c1, A, lerp(A.len * 0.4, A.len, Math.pow(p / 0.5, 1.35)));
        else if (p < 0.78) {
          const u = seg(p, 0.5, 0.78);
          fPos(AEND, p0);
          fall(c1, p0, p1.copy(gP).addScaledVector(gN, -0.95), u);
          fQuat(AEND, c1.group.quaternion);
          c1.spin.rotation.z = -A.len / COIN_R - u * 4;
          c1.clipAbove(gN, gP);
        } else {
          const u = seg(p, 0.78, 1);
          fall(c1, p0.copy(gP).addScaledVector(gN, -0.15), HOVER, u);
          c1.group.position.y += Math.sin(idleT * 1.7) * 0.07;
          fQuat(BSTART, c1.group.quaternion);
          c1.spin.rotation.z = -idleT * 0.9;
          c1.clipBelow(gN, gP);
          c1.setGlyph(0);
          c1.setRing(smooth(u * 1.6));
        }
        if (prevP < 0.7 && p >= 0.7) gate.pulse();
      } else if (k === 'dvn') {
        c1.setGlyph(0);
        c1.setRing(1);
        if (p < 0.16) {
          fall(c1, HOVER, fPos(BSTART, p1), seg(p, 0, 0.16));
          fQuat(BSTART, c1.group.quaternion);
        } else {
          hoopS = lerp(0, B.len * 0.985, seg(p, 0.16, 1));
          along(c1, B, hoopS + Math.sin(idleT * 1.3) * 0.06);
        }
        if (p >= 1) hoopS = 1e3;
      } else {
        hoopS = 1e3;
        c1.setGlyph(0);
        c1.setRing(1, PAL.blue);
        c2.group.visible = true;
        c2.setGlyph(0);
        c2.setRing(1, PAL.violet);
        if (k === 'expA' || k === 'expB') {
          const isA = k === 'expA';
          const mover = isA ? c1 : c2;
          const tr = isA ? C1 : C2;
          const pad = isA ? padA : padB;
          if (isA) {
            along(c2, C2, 0.05);
            c2.setRing(0.4, PAL.violet);
          } else stand(c1, padA, idleT * 0.7);
          if (p < 0.14) {
            fPos(BEND, p0);
            hopTo(mover, p0, fPos(tr.at(0), p1), seg(p, 0, 0.14));
            fQuat(tr.at(0), mover.group.quaternion);
          } else if (p < 0.8) along(mover, tr, lerp(0, tr.len, seg(p, 0.14, 0.8)));
          else {
            const u = smooth(seg(p, 0.8, 1));
            fPos(tr.at(tr.len), p0);
            p1.copy(pad.top).y += COIN_R + 0.02;
            hopTo(mover, p0, p1, u, 0.3);
            fQuat(tr.at(tr.len), q0);
            mover.group.quaternion.slerpQuaternions(q0, q1.setFromAxisAngle(UP, idleT * 0.7), u);
          }
        } else {
          // registry: kedua salinan kembali lalu dikunci
          returning.forEach(([c, pad, tr, lag], i) => {
            const q = clamp(p - lag);
            if (q < 0.14) {
              p0.copy(pad.top).y += COIN_R + 0.02;
              hopTo(c, p0, fPos(tr.at(0), p1), seg(q, 0, 0.14), 0.3);
              fQuat(tr.at(0), c.group.quaternion);
            } else if (q < 0.58) along(c, tr, lerp(0, tr.len, seg(q, 0.14, 0.58)));
            else {
              const u = smooth(seg(q, 0.58, 0.84));
              fPos(tr.at(tr.len), p0);
              hopTo(c, p0, reg.slot(i), u, 1.1);
              fQuat(tr.at(tr.len), q0);
              c.group.quaternion.slerpQuaternions(q0, QFLAT, u);
              c.spin.rotation.z = idleT * 0.25;
            }
          });
          c1.setRing(1, PAL.mint2);
          c2.setRing(1, PAL.mint2);
          lock = seg(p, 0.8, 1);
          if (prevP < 0.9 && p >= 0.9) lockFlash = 1;
        }
      }
      // Makna data: Standard menyalakan 2 hoop wajib, Fortress 3; ditambah 1 hoop opsional.
      for (const h of hoops) {
        const allowed = h.req ? h.idx < (fortress ? 3 : 2) : h.idx === 3;
        h.target = allowed && hoopS >= h.s - 0.15 ? 1 : 0;
      }
      lockTarget = lock;
    };

    /* state digerakkan oleh props React (HTML: MutationObserver pada data-active / data-mode) */
    // X-RAY hanya mengganti struktur padat menjadi wireframe; koin dan bagian glow tetap.
    const solids: { mesh: THREE.Mesh; solid: THREE.Material }[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && !o.userData.coin) {
        solids.push({ mesh: o, solid: o.material });
      }
    });
    const CAM: Record<ArchStation, CamShot> = {
      home: [V(-8.3, 3.9, 0), V(-2.2, 3.4, 8.6)],
      core: [V(-4.3, 0.55, 0), V(-2.9, 5.2, 9)],
      dvn: [V(-0.5, -2, 0), V(-1.4, 4, 9.6)],
      expA: [V(4.9, -3.3, -1.9), V(1.1, 3.7, 9.2)],
      expB: [V(4.9, -3.3, 1.9), V(2, 3.5, 9.8)],
      registry: [V(9.3, -4.2, 0), V(2.5, 3.5, 9)],
    };
    const OVERVIEW: CamShot = [V(0.45, -0.55, 0), V(-3, 5.3, 25.6)];
    const anchors: Record<ArchStation, THREE.Vector3> = {
      home: V(-9.2, 3.55, 0.6),
      core: gP.clone().add(V(0.25, 0.95, -0.5)),
      dvn: B.at(B.len * 0.46)
        .p.clone()
        .add(V(0, 1.7, 0)),
      expA: padA.top.clone().add(V(-0.7, 1.3, 0)),
      expB: padB.top.clone().add(V(-0.5, -0.35, 0.9)),
      registry: V(11.1, -3.35, 0),
    };
    const isStation = (v: string | undefined): v is ArchStation =>
      v !== undefined && (ARCH_STATIONS as readonly string[]).includes(v);
    // Pod dirender React. Node-nya bisa diganti saat render ulang, jadi cache dicek tiap frame.
    let pods = new Map<ArchStation, HTMLElement>();
    const queryPods = () => {
      pods = new Map();
      for (const el of stageEl.querySelectorAll<HTMLElement>('#archHotspots [data-arch]')) {
        const k = el.dataset.arch;
        if (isStation(k)) pods.set(k, el);
      }
    };
    const podsStale = () => {
      if (pods.size < ARCH_STATIONS.length) return true;
      for (const el of pods.values()) if (!el.isConnected) return true;
      return false;
    };
    queryPods();
    cleanups.push(() => {
      for (const el of pods.values()) {
        el.style.removeProperty('--px');
        el.style.removeProperty('--py');
        el.classList.remove('on-screen');
      }
    });

    const power: Record<ArchStation, number> = { home: 0.4, core: 0.4, dvn: 0.4, expA: 0.4, expB: 0.4, registry: 0.4 };
    let key: ArchStation = opts.active;
    let mode: ArchMode = opts.mode;
    let prog = 1;
    let prev = 1;
    let idle = 0;
    let started = false;
    const camPos = V();
    const camLook = V();
    const tPos = V();
    const tLook = V();
    const pv = V();
    let camInit = false;
    let px = 0;
    let py = 0;
    let cx = 0;
    let cy = 0;
    const applyMode = () => {
      const xray = mode === 'xray';
      for (const o of solids) o.mesh.material = xray ? wire : o.solid;
      grid.visible = xray;
      stage.background.set(xray ? PAL.xrayBg : PAL.bg);
      fog.color.set(xray ? PAL.xrayBg : PAL.bg);
      stage.bloomPass.strength = xray ? 0.32 : 0.5;
      stage.dirty = true;
    };
    applyMode();
    if (fine && !reduced) {
      const onPointerMove = (e: PointerEvent) => {
        const r = stageEl.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width - 0.5;
        py = (e.clientY - r.top) / r.height - 0.5;
      };
      const onPointerLeave = () => {
        px = py = 0;
      };
      stageEl.addEventListener('pointermove', onPointerMove, { passive: true });
      stageEl.addEventListener('pointerleave', onPointerLeave);
      cleanups.push(() => {
        stageEl.removeEventListener('pointermove', onPointerMove);
        stageEl.removeEventListener('pointerleave', onPointerLeave);
      });
    }

    stage.update = (dtIn, t) => {
      let dt = dtIn;
      if (!started) {
        // mainkan entrance saat pertama kali terlihat
        started = true;
        if (!reduced) prog = prev = 0;
      }
      if (reduced) {
        prog = 1;
        dt = 0;
      }
      prev = prog;
      prog = Math.min(1, prog + dt / 1.75);
      if (prog >= 1) idle += dt;
      pose(key, prog, prev, idle);
      if (dt > 0) dust(dt);
      // energi stasiun: stasiun terpilih menyala penuh, sisanya tetap terbaca
      const rest = mode === 'run' ? 0.34 : 0.62;
      for (const k of ARCH_STATIONS) power[k] = damp(power[k], k === key ? 1 : rest, 3.5, dt || 1);
      gate.power = 0.42 + 0.62 * power.core;
      gate.lightScale = 0.5;
      gate.update(dt, t);
      setGlow(homeHoop, (0.5 + 1.9 * power.home) * (1 + 0.08 * Math.sin(t * 2)));
      for (const h of hoops) {
        h.level = damp(h.level, h.target, 7, dt || 1);
        setGlow(h.glow, (0.16 + 1.9 * h.level) * (0.55 + 0.45 * power.dvn));
      }
      for (const [pad, pw] of [
        [padA, power.expA],
        [padB, power.expB],
      ] as const) {
        setGlow(pad.ring, 0.4 + 2.1 * pw);
        setGlow(pad.inner, 0.3 + 1.2 * pw);
        pad.light.intensity = 16 * pw;
        pad.inner.mesh.rotation.z = t * 0.5;
      }
      lockLevel = damp(lockLevel, lockTarget, 5, dt || 1);
      lockFlash = damp(lockFlash, 0, 3.5, dt || 1);
      const rp = power.registry;
      setGlow(reg.ring, 0.4 + 1.9 * rp);
      setGlow(reg.lock, (0.35 + 2.1 * lockLevel + 2.4 * lockFlash) * (0.5 + 0.5 * rp));
      reg.lock.mesh.position.y = lerp(1.75, 0.86, lockLevel) + Math.sin(t * 1.4) * 0.03;
      reg.lock.mesh.scale.setScalar(lerp(1.5, 1, lockLevel));
      reg.lock.mesh.rotation.z = t * 0.4;
      reg.light.intensity = (8 + 20 * lockLevel + 30 * lockFlash) * rp;
      for (const c of reg.stack) c.setRing(0.35 + 0.65 * rp);
      // kamera: terbang ke stasiun (COIN RUN) atau membingkai seluruh pipeline (OVERVIEW / X-RAY)
      const asp = stage.width / stage.height;
      const [look, off] = mode === 'run' ? CAM[key] : OVERVIEW;
      const pull = clamp((mode === 'run' ? 1.5 : 1.76) / asp, 1, 2.4);
      cx = damp(cx, px, 2.5, dt || 1);
      cy = damp(cy, py, 2.5, dt || 1);
      tLook.copy(look);
      tPos.copy(look).addScaledVector(off, pull);
      tPos.x += cx * (mode === 'run' ? 1.6 : 2.6);
      tPos.y -= cy * 1.2;
      if (!camInit || reduced) {
        camPos.copy(tPos);
        camLook.copy(tLook);
        camInit = true;
      } else {
        const a = 1 - Math.exp(-2.7 * dt);
        camPos.lerp(tPos, a);
        camLook.lerp(tLook, a);
      }
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      camera.updateMatrixWorld();
      // pod hotspot diproyeksikan ke posisi 3D; disembunyikan bila keluar layar
      if (podsStale()) queryPods();
      for (const [k, el] of pods) {
        pv.copy(anchors[k]).project(camera);
        const x = (pv.x * 0.5 + 0.5) * stage.width;
        const y = (-pv.y * 0.5 + 0.5) * stage.height;
        el.style.setProperty('--px', `${x.toFixed(1)}px`);
        el.style.setProperty('--py', `${y.toFixed(1)}px`);
        const inY = el.classList.contains('pod-below') ? y > 6 && y < stage.height - 84 : y > 92 && y < stage.height - 6;
        // Ditulis ulang tiap frame: bila React menimpa className pod, frame berikutnya memulihkannya.
        el.classList.toggle('on-screen', pv.z < 1 && x > 58 && x < stage.width - 58 && inY);
      }
    };

    return {
      setActive(station) {
        if (station === key) return;
        key = station;
        prog = prev = 0;
        idle = 0;
        stage.dirty = true;
      },
      setMode(next) {
        if (next === mode) return;
        mode = next;
        applyMode();
      },
      setTier(tier) {
        fortress = tier === 'fortress';
        stage.dirty = true;
      },
      invalidate() {
        stage.dirty = true;
      },
      dispose,
    };
  } catch (err) {
    console.warn('[xofn] 3D architecture scene unavailable, static fallback stays:', err);
    dispose();
    return null;
  }
}
