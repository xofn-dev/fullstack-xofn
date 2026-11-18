import * as THREE from 'three';

import { addDust, addLights, addSky } from './atmosphere';
import { COIN_R, makeCoin, type Coin } from './coin';
import { makeGate } from './gate';
import type { GlyphKind } from './glyphs';
import { PAL } from './palette';
import { createStage, type Stage } from './stage';
import { makeTrack, type Frame } from './track';
import { UP, V, clamp, damp, hasFinePointer, lerp, prefersReducedMotion, smooth } from './util';

export interface HeroOptions {
  /** `#heroCoinCanvas`, anak langsung dari `<section class="hero">`. */
  canvas: HTMLCanvasElement;
}

export interface HeroController {
  dispose(): void;
}

type CoinState = 'idle' | 'roll1' | 'drop' | 'emerge' | 'roll2' | 'reject';

interface HeroCoin extends Coin {
  state: CoinState;
  /** Jarak tempuh di track. */
  s: number;
  /** Waktu di state saat ini. */
  t: number;
  lane: number;
  roll: number;
  hit: boolean;
  vel: THREE.Vector3;
  a: THREE.Vector3;
  b: THREE.Vector3;
}

// Koin yang jatuh membawa logo chain XofN; hanya "1/1" yang ditolak gate.
const SEQ: readonly GlyphKind[] = [
  'robinhood',
  'base',
  'arbitrum',
  'robinhood',
  'base',
  'one',
  'arbitrum',
  'robinhood',
  'base',
  'arbitrum',
];

/**
 * HERO "Coinfall": koin menggelinding, jatuh menembus gate, mendarat terverifikasi.
 * Mengembalikan `null` bila markup tidak lengkap atau WebGL tidak tersedia
 * (fallback statis CSS tetap tampil karena kelas `webgl-on` tidak dipasang).
 */
export function mountHero({ canvas }: HeroOptions): HeroController | null {
  const hero = canvas.closest<HTMLElement>('.hero');
  const visual = hero?.querySelector<HTMLElement>('.hero-visual');
  if (!hero || !visual || !hero.querySelector('.hero-copy')) return null;

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
    scene.fog = new THREE.Fog(PAL.bg, 16.5, 29);
    addLights(scene);
    const upper = makeTrack(
      bag,
      new THREE.CatmullRomCurve3([
        V(5.2, 4.9, -9.6),
        V(1.6, 4.75, -10.6),
        V(-2, 4.3, -9.2),
        V(-3.9, 3.65, -6.4),
        V(-3.1, 2.9, -3.6),
        V(-1.35, 2.15, -1.6),
      ]),
      { seed: 11, width: 2.3 },
    );
    const lower = makeTrack(
      bag,
      new THREE.CatmullRomCurve3([
        V(0.75, -2.35, 0.95),
        V(2.3, -3, 2.7),
        V(4.2, -3.8, 4.7),
        V(6.4, -4.7, 6.9),
        V(9, -5.7, 9.4),
      ]),
      { seed: 29, width: 2.3 },
    );
    const gate = makeGate(bag, 1.28, -0.29);
    gate.group.rotation.set(0.06, 0, -0.03);
    scene.add(upper.group, lower.group, gate.group);
    const dust = addDust(bag, scene, 150, V(18, 13, 12), V(1, 0, -1));
    addSky(bag, scene, 650, V(0, 0, -4), 13, 30, V(1, 1.5, -9), 30);
    gate.group.updateMatrixWorld();
    const gP = gate.group.position.clone();
    const gN = UP.clone().applyQuaternion(gate.group.quaternion);
    const lift = COIN_R + 0.085;
    const endF = upper.at(upper.len);
    const startF = lower.at(0);
    const m4 = new THREE.Matrix4();
    const qEnd = new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(endF.t, endF.n, endF.b));
    const qStart = new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(startF.t, startF.n, startF.b));

    const pool: HeroCoin[] = [];
    let seq = 0;
    for (let i = 0; i < 17; i++) {
      const c: HeroCoin = Object.assign(makeCoin(bag, 'robinhood'), {
        state: 'idle' as CoinState,
        s: 0,
        t: 0,
        lane: 0,
        roll: 0,
        hit: false,
        vel: V(),
        a: V(),
        b: V(),
      });
      c.group.visible = false;
      scene.add(c.group);
      pool.push(c);
    }
    const place = (c: HeroCoin, f: Frame, extra = 0) => {
      c.group.position
        .copy(f.p)
        .addScaledVector(f.n, lift + extra)
        .addScaledVector(f.b, c.lane);
      c.group.quaternion.setFromRotationMatrix(m4.makeBasis(f.t, f.n, f.b));
    };
    const spawn = (lane: number, kind?: GlyphKind) => {
      const c = pool.find((x) => x.state === 'idle');
      if (!c) return;
      c.setKind(kind ?? SEQ[seq++ % SEQ.length]);
      c.state = 'roll1';
      c.s = 0;
      c.lane = lane;
      c.roll = Math.random() * 6;
      c.clipNone();
      c.setRing(0);
      c.setGlyph(1, c.kind === 'one' ? PAL.danger : PAL.white);
      c.group.visible = true;
      place(c, upper.at(0));
    };

    let spawnClock = 0;
    let pair = 0;
    let rejectTimer = 0;
    const clearReject = () => {
      window.clearTimeout(rejectTimer);
      hero.classList.remove('gate-reject');
    };
    const step = (dt: number) => {
      spawnClock -= dt;
      if (spawnClock <= 0) {
        spawn(pair % 2 ? 0.55 : -0.55);
        spawnClock = pair % 2 ? 2.3 : 0.6;
        pair++;
      }
      for (const c of pool) {
        if (c.state === 'roll1') {
          const v = 1.45 + 0.075 * c.s;
          c.s += v * dt;
          c.roll -= (v * dt) / COIN_R;
          if (c.s >= upper.len) {
            c.state = 'drop';
            c.t = 0;
            place(c, endF);
            c.a.copy(c.group.position);
            c.b.copy(gP).addScaledVector(endF.b, c.lane * 0.3);
            c.clipAbove(gN, gP);
          } else place(c, upper.at(c.s));
        } else if (c.state === 'drop') {
          c.t += dt;
          const u = c.t / 0.62;
          const k = 0.28 * u + 0.72 * u * u;
          c.roll -= dt * 7;
          c.group.position.set(
            lerp(c.a.x, c.b.x, Math.min(u, 1.25)),
            lerp(c.a.y, c.b.y, k),
            lerp(c.a.z, c.b.z, Math.min(u, 1.25)),
          );
          if (u >= 1 && c.kind === 'one') {
            // Aturan produk: 1-of-1 tidak pernah lolos. Koin terpental, chip f4 menyala merah.
            c.state = 'reject';
            c.t = 0;
            c.clipNone();
            c.vel.set(-1.5, 4.3, 3.1);
            gate.reject();
            hero.classList.add('gate-reject');
            window.clearTimeout(rejectTimer);
            rejectTimer = window.setTimeout(() => hero.classList.remove('gate-reject'), 1100);
          } else if (u >= 1 && !c.hit) {
            c.hit = true;
            gate.pulse();
          }
          if (u >= 1.36) {
            c.hit = false;
            c.state = 'emerge';
            c.t = 0;
            // Lolos scan: logo chain berganti logo brand XofN (tanda terverifikasi).
            c.setKind('brand');
            c.setGlyph(0);
            c.clipBelow(gN, gP);
            c.a.copy(gP).addScaledVector(gN, -0.12);
            place(c, startF);
            c.b.copy(c.group.position);
            c.group.position.copy(c.a);
          }
        } else if (c.state === 'emerge') {
          c.t += dt;
          const u = Math.min(1, c.t / 0.56);
          const k = 0.42 * u + 0.58 * u * u;
          c.roll -= dt * 7;
          c.group.position.set(lerp(c.a.x, c.b.x, u), lerp(c.a.y, c.b.y, k), lerp(c.a.z, c.b.z, u));
          c.group.quaternion.slerpQuaternions(qEnd, qStart, smooth(u));
          c.setGlyph(smooth(u * 1.6));
          if (u >= 1) {
            c.state = 'roll2';
            c.s = 0;
            c.t = 0;
            c.clipNone();
          }
        } else if (c.state === 'roll2') {
          c.t += dt;
          const v = 1.75 + 0.13 * c.s;
          c.s += v * dt;
          c.roll -= (v * dt) / COIN_R;
          if (c.s >= lower.len) {
            c.state = 'idle';
            c.group.visible = false;
          } else place(c, lower.at(c.s), 0.11 * Math.exp(-c.t * 6) * Math.abs(Math.sin(c.t * 13)));
        } else if (c.state === 'reject') {
          c.t += dt;
          c.vel.y -= 12 * dt;
          c.group.position.addScaledVector(c.vel, dt);
          c.group.rotateX(dt * 5.2);
          c.group.rotateY(dt * 3.1);
          if (c.t > 1.7) {
            c.state = 'idle';
            c.group.visible = false;
          }
        }
        c.spin.rotation.z = c.roll;
      }
    };
    for (let i = 0; i < 420; i++) step(1 / 30); // mulai dengan track yang sudah terisi
    gate.flash = 0;
    gate.bad = 0;
    clearReject();
    cleanups.push(clearReject);

    /* chip dipin ke anchor 3D */
    const anchorDefs: [string, THREE.Vector3][] = [
      ['.hero-float.f1', gP.clone().add(V(0.35, 1.7, -2.5))],
      ['.hero-float.f4', gP.clone().add(V(-3.35, 0.05, 1.05))],
      ['.hero-float.f2', gP.clone().add(V(3.5, 0.85, -0.5))],
      ['.hero-float.f3', gP.clone().add(V(4.35, -0.75, 1.3))],
    ];
    const anchors: { el: HTMLElement; p: THREE.Vector3 }[] = [];
    for (const [sel, p] of anchorDefs) {
      const el = visual.querySelector<HTMLElement>(sel);
      if (el) anchors.push({ el, p });
    }
    cleanups.push(() => {
      for (const a of anchors) {
        a.el.style.removeProperty('--cx');
        a.el.style.removeProperty('--cy');
      }
    });

    let offX = 0;
    let offY = 0;
    const pv = V();
    const layout = () => {
      const copy = hero.querySelector('.hero-copy');
      if (!copy) return;
      const hr = hero.getBoundingClientRect();
      const vr = visual.getBoundingClientRect();
      const stacked = vr.top > copy.getBoundingClientRect().bottom - 20; // layout satu kolom
      hero.classList.toggle('hero-stacked', stacked);
      if (stacked) {
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.top = `${Math.max(0, vr.top - hr.top - 24)}px`;
        canvas.style.height = `${hr.bottom - vr.top + 24}px`;
      } else {
        canvas.style.left = canvas.style.width = canvas.style.top = canvas.style.height = '';
      }
      const cr = canvas.getBoundingClientRect();
      offX = cr.left - vr.left;
      offY = cr.top - vr.top;
      stage.resize();
      stage.dirty = true;
    };
    let layoutRaf = 0;
    const onWindowResize = () => {
      layoutRaf = requestAnimationFrame(layout);
    };
    window.addEventListener('resize', onWindowResize, { passive: true });
    cleanups.push(() => {
      window.removeEventListener('resize', onWindowResize);
      cancelAnimationFrame(layoutRaf);
      hero.classList.remove('hero-stacked');
      canvas.style.left = canvas.style.width = canvas.style.top = canvas.style.height = '';
    });
    layout();

    let px = 0;
    let py = 0;
    let cx = 0;
    let cy = 0;
    let sp = 0;
    if (fine && !reduced) {
      const onPointerMove = (e: PointerEvent) => {
        px = e.clientX / window.innerWidth - 0.5;
        py = e.clientY / window.innerHeight - 0.5;
      };
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      cleanups.push(() => window.removeEventListener('pointermove', onPointerMove));
    }
    const onClick = () => {
      if (reduced) return;
      spawn(Math.random() < 0.5 ? -0.55 : 0.55, 'brand');
      spawnClock = Math.max(spawnClock, 0.5);
    };
    visual.addEventListener('click', onClick);
    cleanups.push(() => visual.removeEventListener('click', onClick));

    const camBase = V(-2.76, 7.7, 12.06);
    const look = V(0.75, -0.35, 0.4);
    stage.update = (dt, t) => {
      if (dt > 0) {
        step(dt);
        dust(dt);
      }
      gate.update(dt, t);
      cx = damp(cx, px, 2.6, dt || 1);
      cy = damp(cy, py, 2.6, dt || 1);
      sp = clamp(window.scrollY / Math.max(1, hero.offsetHeight));
      const wide = clamp((stage.width / stage.height - 0.75) / 0.6); // mundur pada canvas sempit
      camera.position.set(camBase.x + cx * 1.5, camBase.y - cy * 0.9 - sp * 2.4, camBase.z + (1 - wide) * 5.5);
      camera.lookAt(look.x + cx * 0.35, look.y - sp * 3.1, look.z);
      camera.updateMatrixWorld();
      for (const a of anchors) {
        // jaga tiap chip tetap di dalam kolom visual
        pv.copy(a.p).project(camera);
        const half = a.el.offsetWidth / 2 + 6;
        const x = clamp((pv.x * 0.5 + 0.5) * stage.width + offX, half, Math.max(half, visual.clientWidth - half));
        a.el.style.setProperty('--cx', `${x.toFixed(1)}px`);
        a.el.style.setProperty('--cy', `${((-pv.y * 0.5 + 0.5) * stage.height + offY).toFixed(1)}px`);
      }
    };

    // `.hero` adalah blok statis (tidak dirender ulang React), jadi classList aman di sini.
    hero.classList.add('webgl-on');
    cleanups.push(() => hero.classList.remove('webgl-on'));
    return { dispose };
  } catch (err) {
    console.warn('[xofn] 3D hero scene unavailable, static fallback stays:', err);
    dispose();
    return null;
  }
}
