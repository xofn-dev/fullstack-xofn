import * as THREE from 'three';

import type { Tier } from '@/types/enums';

import { flareTexture, glyphTexture } from './glyphs';
import { addFrameClient, createGovernor } from './loop';
import { HEAT_CALM, HEAT_NEON, PAL, type Rgb } from './palette';
import { releaseRenderer } from './stage';
import { ResourceBag, clamp, disposeObject3D, hdr, lerp, prefersReducedMotion, smooth } from './util';

/** D5: di layar sempit galaxy WebGL tidak dibuat; langit 2D + CSS tetap. */
export const GALAXY_OFF_QUERY = '(max-width: 860px)';

export interface GalaxyOptions {
  /** `#heat` (tiga blob `<i>`): warna dan intensitasnya digerakkan scene. Boleh null. */
  heat: HTMLElement | null;
  tier: Tier;
}

export interface GalaxyController {
  setTier(tier: Tier): void;
  dispose(): void;
}

type SceneKey =
  | 'hero'
  | 'vision'
  | 'thesis'
  | 'arch'
  | 'manifesto'
  | 'explore'
  | 'check'
  | 'core'
  | 'security'
  | 'graduation'
  | 'launch'
  | 'bridge'
  | 'proof'
  | 'contracts'
  | 'cta';

interface SceneTarget {
  x: number;
  y: number;
  rotX: number;
  rotY: number;
  scale: number;
  glow: number;
  heat: number;
  spread: number;
  dock: number;
  opacity: number;
  spin: number;
}
const TARGET_KEYS: readonly (keyof SceneTarget)[] = [
  'x',
  'y',
  'rotX',
  'rotY',
  'scale',
  'glow',
  'heat',
  'spread',
  'dock',
  'opacity',
  'spin',
];

// Urutan section di halaman landing. Tiap section punya target koin + langit.
const SECTIONS: readonly (readonly [selector: string, key: SceneKey])[] = [
  ['.hero', 'hero'],
  ['#vision', 'vision'],
  ['.v3-thesis', 'thesis'],
  ['#architecture', 'arch'],
  ['.manifesto-section', 'manifesto'],
  ['#explore', 'explore'],
  ['#check', 'check'],
  ['#inside', 'core'],
  ['#security', 'security'],
  ['#graduation', 'graduation'],
  ['#launch', 'launch'],
  ['#bridge', 'bridge'],
  ['#proof', 'proof'],
  ['#contracts', 'contracts'],
  ['.footer-top', 'cta'],
];

const target = (
  x: number,
  y: number,
  rotX: number,
  rotY: number,
  scale: number,
  glow: number,
  heat: number,
  spread: number,
  dock: number,
  opacity: number,
  spin: number,
): SceneTarget => ({ x, y, rotX, rotY, scale, glow, heat, spread, dock, opacity, spin });

// x: fraksi setengah lebar viewport; y: satuan dunia (tepi viewport = ±2.3).
// spin = 0 untuk `core` dan `cta` supaya koin tidak ikut berputar oleh scroll saat dibuka / mendarat.
const SC: Record<SceneKey, SceneTarget> = {
  hero: target(0.6, -1.5, 0.2, -0.55, 0.34, 0.3, 0.1, 1, 1, 1, 1),
  vision: target(0.06, 0.98, 0.3, 0.9, 0.4, 0.35, 0.15, 1.15, 0, 1, 1),
  thesis: target(-0.8, -1.15, 0.35, 2.2, 0.36, 0.3, 0.35, 1.3, 0, 1, 1),
  arch: target(0, -0.35, 0.2, 3.6, 0.1, 0.2, 0.2, 1.5, 0, 0, 1),
  manifesto: target(0.66, 1.25, 0.25, 4.6, 0.34, 0.35, 0.3, 1.2, 0, 1, 1),
  explore: target(0.12, 1.05, 0.3, 5.6, 0.36, 0.3, 0.2, 1.1, 0, 1, 1),
  check: target(-0.08, -1.3, 0.3, 6.5, 0.36, 0.35, 0.45, 1, 0, 1, 1),
  core: target(0, 0.02, 0.12, Math.PI * 2, 1, 1, 1, 0.75, 0, 1, 0),
  security: target(0.03, 1.3, 0.25, 7.4, 0.32, 0.5, 0.5, 1.2, 0, 1, 1),
  graduation: target(0.1, 1.1, 0.4, 8.6, 0.36, 0.3, 0.2, 1, 0, 1, 1),
  launch: target(-0.04, -1.5, 0.3, 9.4, 0.34, 0.3, 0.3, 1.25, 0, 1, 1),
  bridge: target(-0.1, 1.2, 0.2, 10.3, 0.34, 0.3, 0.35, 1.3, 0, 1, 1),
  proof: target(0.5, 1.05, 0.3, 11.2, 0.36, 0.35, 0.25, 1.1, 0, 1, 1),
  contracts: target(0.4, 1.15, 0.3, 11.9, 0.34, 0.3, 0.3, 1.2, 0, 1, 1),
  cta: target(0, 0.2, 0.15, Math.PI * 6, 0.5, 0.75, 0.95, 1.15, 0, 1, 0),
};

const TWEEN_SECONDS = 1.6;
// Setara ease "power3.inOut" milik GSAP yang dipakai HTML untuk perpindahan antar section.
const power3InOut = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

const NO_DRAG_SELECTOR =
  'a,button,input,textarea,select,label,summary,[role=button],[tabindex],.overlay,.drawer-backdrop';

const mixRgb = (a: Rgb, b: Rgb, k: number): string => a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',');

/**
 * GALAXY: satu canvas fixed transparan di belakang seluruh halaman. Tiap section punya
 * target untuk koin (posisi, putaran, ukuran, glow) dan langit (warna heat, sebaran bintang);
 * scroll berpindah di antaranya. Di section "inside the coin" koin terbelah (D2: split)
 * dan memperlihatkan 5 pelat lapisan DVN.
 *
 * Mengembalikan `null` bila layar sempit (D5), halaman bukan landing (section < 10),
 * atau WebGL tidak tersedia; langit 2D fallback tetap dipakai.
 */
export function mountGalaxy(opts: GalaxyOptions): GalaxyController | null {
  if (window.matchMedia(GALAXY_OFF_QUERY).matches) return null;
  const root = document.documentElement;
  const heat = opts.heat;
  const blobs = heat ? [...heat.querySelectorAll<HTMLElement>('i')] : [];
  const order: { el: HTMLElement; key: SceneKey }[] = [];
  for (const [sel, key] of SECTIONS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) order.push({ el, key });
  }
  if (order.length < 10) return null;

  const reduced = prefersReducedMotion();
  const canvas = document.createElement('canvas');
  canvas.id = 'galaxyCanvas';
  canvas.setAttribute('aria-hidden', 'true');
  const bag = new ResourceBag();
  let renderer: THREE.WebGLRenderer | null = null;
  const cleanups: (() => void)[] = [];
  const scenes: THREE.Scene[] = [];
  const dispose = () => {
    for (const fn of cleanups.splice(0).reverse()) fn();
    for (const s of scenes.splice(0)) disposeObject3D(s);
    bag.dispose();
    if (renderer) releaseRenderer(renderer);
    renderer = null;
    canvas.remove();
  };

  try {
    const gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer = gl;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.08;
    const scene = new THREE.Scene();
    scenes.push(scene);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 8);
    // studio kartu cahaya berwarna: pantulan mint dan periwinkle bergeser di logam gelap saat koin berputar
    const studio = new THREE.Scene();
    scenes.push(studio);
    studio.background = new THREE.Color(PAL.studioBg);
    const card = (
      w: number,
      h: number,
      hex: number,
      k: number,
      pos: [number, number, number],
      rot?: [number, number, number],
    ) => {
      const m = new THREE.Mesh(
        bag.track(new THREE.PlaneGeometry(w, h)),
        bag.track(new THREE.MeshBasicMaterial({ color: hdr(hex, k), side: THREE.DoubleSide })),
      );
      m.position.set(...pos);
      if (rot) m.rotation.set(...rot);
      studio.add(m);
    };
    card(6, 2, PAL.white, 3, [0, 5, 0], [Math.PI / 2, 0, 0]);
    card(2, 6, PAL.mint2, 2.6, [-5, 0, 1], [0, Math.PI / 2, 0]);
    card(2, 6, PAL.blue, 2.4, [5, 0, -1], [0, -Math.PI / 2, 0]);
    card(8, 1, PAL.white, 1.2, [0, -3, 5]);
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = bag.track(pm.fromScene(studio, 0.04)).texture;
    pm.dispose();
    scene.add(new THREE.AmbientLight(PAL.white, 0.4));
    const keyLight = new THREE.DirectionalLight(PAL.white, 3);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(PAL.mint2, 3.6);
    rimLight.position.set(-4, 1, -3);
    scene.add(rimLight);

    /* ---- koin: tampilan sama dengan koin hero, dibuat dua belahan supaya bisa dibuka ---- */
    const mover = new THREE.Group();
    const body = new THREE.Group();
    scene.add(mover);
    mover.add(body);
    const TH = 0.26;
    const BV = 0.045;
    const metal = bag.track(
      new THREE.MeshPhysicalMaterial({
        color: PAL.galaxyMetal,
        metalness: 0.9,
        roughness: 0.3,
        clearcoat: 0.7,
        clearcoatRoughness: 0.25,
        envMapIntensity: 1.35,
        transparent: true,
      }),
    );
    const ringMat = bag.track(new THREE.MeshBasicMaterial({ color: hdr(PAL.mint2, 0.95), transparent: true }));
    const glyphMat = bag.track(
      new THREE.MeshBasicMaterial({
        map: glyphTexture(bag, 'brand'),
        color: PAL.white,
        transparent: true,
        depthWrite: false,
      }),
    );
    const makeHalf = (top: boolean) => {
      const g = new THREE.Group();
      const sh = new THREE.Shape();
      sh.moveTo(1 - BV, BV);
      sh.absarc(0, BV, 1 - BV, 0, Math.PI, false);
      sh.closePath();
      const geo = bag.track(
        new THREE.ExtrudeGeometry(sh, {
          depth: TH,
          bevelEnabled: true,
          bevelThickness: BV,
          bevelSize: BV,
          bevelSegments: 4,
          curveSegments: 44,
        }),
      );
      geo.translate(0, 0, -TH / 2);
      g.add(new THREE.Mesh(geo, metal));
      for (const d of [1, -1]) {
        const z = d * (TH / 2 + BV);
        const rim = new THREE.Mesh(bag.track(new THREE.TorusGeometry(0.9, 0.034, 10, 56, Math.PI)), metal);
        rim.position.z = z - d * 0.012;
        g.add(rim);
        const ring = new THREE.Mesh(bag.track(new THREE.TorusGeometry(0.61, 0.046, 12, 56, Math.PI)), ringMat);
        ring.position.z = z - d * 0.008;
        g.add(ring);
        const pg = bag.track(new THREE.PlaneGeometry(0.78, 0.39));
        const uv = pg.attributes.uv;
        // Setiap belahan menampilkan separuh logo. Belahan bawah ikut diputar 180 derajat di grup,
        // jadi UV-nya dibalik agar separuh bawah logo tampak tegak. Sisi belakang sudah dicerminkan
        // oleh rotasi Y muka, sehingga flip horizontal hanya berlaku di sisi depan.
        for (let i = 0; i < uv.count; i++) {
          if (top) uv.setY(i, 0.5 + 0.5 * uv.getY(i));
          else {
            uv.setY(i, 0.5 - 0.5 * uv.getY(i));
            if (d > 0) uv.setX(i, 1 - uv.getX(i));
          }
        }
        const face = new THREE.Mesh(pg, glyphMat);
        face.position.set(0, 0.195, z + d * 0.004);
        if (d < 0) face.rotation.y = Math.PI;
        face.renderOrder = 2;
        g.add(face);
      }
      if (!top) g.rotation.z = Math.PI;
      return g;
    };
    const upper = makeHalf(true);
    const lower = makeHalf(false);
    const splitG = new THREE.Group();
    splitG.add(upper, lower);
    body.add(splitG);

    /* ---- isi koin: LAPISAN. Satu pelat per verifier. Slot 0-2 = DVN wajib
            (Standard memakai dua, Fortress tiga); slot 3-4 = pasangan opsional, satu dibutuhkan. ---- */
    let fortress = opts.tier === 'fortress';
    const core = new THREE.Group();
    body.add(core);
    const coreLight = new THREE.PointLight(PAL.mint2, 0, 4.5, 2);
    core.add(coreLight);
    const cOn = new THREE.Color(PAL.mint2);
    const cOpt = new THREE.Color(PAL.blue);
    const cOff = new THREE.Color(PAL.slotOff);
    const tmp = new THREE.Color();
    const glowMat = () => bag.track(new THREE.MeshBasicMaterial({ color: PAL.black, transparent: true }));
    const paint = (mat: THREE.MeshBasicMaterial, lit: number, opt: boolean, k = 1) =>
      mat.color.copy(tmp.copy(cOff).lerp(opt ? cOpt : cOn, lit)).multiplyScalar((0.55 + 1.2 * lit) * k);
    const slotOn = (i: number) => (i < 3 ? i < (fortress ? 3 : 2) : i === 3);
    const rank = (i: number) => (i < 3 ? i : fortress ? 3 : 2); // urutan slot terpakai menyala
    const layers = new THREE.Group();
    core.add(layers);
    const plateGlass = bag.track(
      new THREE.MeshStandardMaterial({
        color: PAL.plateGlass,
        metalness: 0.5,
        roughness: 0.25,
        transparent: true,
        opacity: 0.62,
      }),
    );
    const plateGeo = bag.track(new THREE.CylinderGeometry(0.5, 0.5, 0.016, 56));
    const plates = [0, 1, 2, 3, 4].map((i) => {
      const g = new THREE.Group();
      const edge = glowMat();
      const inner = glowMat();
      layers.add(g);
      g.add(new THREE.Mesh(plateGeo, plateGlass));
      const e = new THREE.Mesh(bag.track(new THREE.TorusGeometry(0.5, 0.014, 8, 72)), edge);
      e.rotation.x = Math.PI / 2;
      g.add(e);
      const n = new THREE.Mesh(bag.track(new THREE.TorusGeometry(i < 3 ? 0.3 : 0.2, 0.007, 8, 56)), inner);
      n.rotation.x = Math.PI / 2;
      n.position.y = 0.01;
      g.add(n);
      return { i, g, edge, inner, lit: 0 };
    });
    const updateLayers = (P: number, dt: number, t: number) => {
      const gap = lerp(0.02, 0.17, P);
      layers.rotation.x = 0.42;
      layers.scale.setScalar(1.05);
      for (const p of plates) {
        const on = slotOn(p.i);
        const l = on ? smooth((P - (0.3 + 0.12 * rank(p.i))) / 0.2) : 0;
        p.lit += (l - p.lit) * Math.min(1, 8 * dt);
        p.g.position.y = (2 - p.i) * gap;
        p.g.rotation.y = (p.i % 2 ? -1 : 1) * 0.25 * t;
        paint(p.edge, p.lit, p.i > 2);
        paint(p.inner, p.lit, p.i > 2, 0.8);
        p.edge.opacity = p.inner.opacity = on ? 1 : 0.55;
      }
    };

    const haloMat = bag.track(
      new THREE.SpriteMaterial({
        map: flareTexture(bag),
        color: PAL.mint2,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    const halo = new THREE.Sprite(haloMat);
    halo.position.z = -0.6;
    halo.renderOrder = -1;
    mover.add(halo);
    /* ---- mendarat: shock ring + burst ---- */
    const shockMat = bag.track(
      new THREE.MeshBasicMaterial({
        color: PAL.mint,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const shock = new THREE.Mesh(bag.track(new THREE.RingGeometry(1, 1.035, 96)), shockMat);
    mover.add(shock);
    const bcount = 150;
    const bdir = new Float32Array(bcount * 3);
    const bpos = new Float32Array(bcount * 3);
    for (let i = 0; i < bcount; i++) {
      const a = Math.random() * Math.PI * 2;
      const k = 0.6 + Math.random() * 0.9;
      bdir[i * 3] = Math.cos(a) * k;
      bdir[i * 3 + 1] = Math.sin(a) * k;
      bdir[i * 3 + 2] = (Math.random() - 0.5) * 0.7;
    }
    const bgeo = bag.track(new THREE.BufferGeometry());
    const battr = new THREE.BufferAttribute(bpos, 3);
    bgeo.setAttribute('position', battr);
    const bmat = bag.track(
      new THREE.PointsMaterial({
        color: PAL.mint,
        size: 0.07,
        map: flareTexture(bag),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const burst = new THREE.Points(bgeo, bmat);
    burst.frustumCulled = false;
    mover.add(burst);

    /* ---- cangkang bintang ---- */
    const small = () => window.innerWidth < 860;
    const scount = small() ? 900 : 2200;
    const spos = new Float32Array(scount * 3);
    const scol = new Float32Array(scount * 3);
    const tones = [
      new THREE.Color(PAL.starWhite),
      new THREE.Color(PAL.mint2),
      new THREE.Color(PAL.blue),
      new THREE.Color(PAL.violet),
    ];
    for (let i = 0; i < scount; i++) {
      const r = 1.8 + 4.2 * Math.pow(Math.random(), 0.6);
      const a = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      spos[i * 3] = r * Math.sin(p) * Math.cos(a);
      spos[i * 3 + 1] = r * Math.cos(p) * 0.7;
      spos[i * 3 + 2] = r * Math.sin(p) * Math.sin(a);
      const q = Math.random();
      const c = q < 0.52 ? tones[0] : q < 0.84 ? tones[1] : q < 0.94 ? tones[2] : tones[3];
      scol[i * 3] = c.r;
      scol[i * 3 + 1] = c.g;
      scol[i * 3 + 2] = c.b;
    }
    const sgeo = bag.track(new THREE.BufferGeometry());
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    sgeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
    const smat = bag.track(
      new THREE.PointsMaterial({
        size: 0.05,
        map: flareTexture(bag),
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    const stars = new THREE.Points(sgeo, smat);
    scene.add(stars);

    /* ---- target per section ---- */
    const want: SceneTarget = { ...SC.hero };
    const now: SceneTarget = { ...SC.hero, scale: 0.2 };
    let tween: { from: SceneTarget; to: SceneTarget; start: number } | null = null;
    let tops: number[] = [];
    let vw = 1;
    let vh = 1;
    let visW = 1;
    let visH = 1;
    let active: SceneKey = 'hero';
    let ctaY = 0;
    let coreH = 0;
    let quality = 1.5;
    let sizeKey = '';
    const idx = (k: SceneKey) => order.findIndex((s) => s.key === k);
    const measure = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      const sy = window.scrollY;
      tops = order.map((s) => s.el.getBoundingClientRect().top + sy);
      coreH = order[idx('core')]?.el.offsetHeight || vh * 2;
      const dpr = Math.min(window.devicePixelRatio || 1, quality);
      // setSize mengosongkan canvas; lewati bila ukuran tidak berubah (measure juga jalan tiap 2,5 dtk).
      const nextKey = `${vw}x${vh}@${dpr}`;
      if (nextKey !== sizeKey) {
        sizeKey = nextKey;
        gl.setPixelRatio(dpr);
        gl.setSize(vw, vh, false);
      }
      camera.aspect = vw / vh;
      camera.updateProjectionMatrix();
      visH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      visW = visH * camera.aspect;
      const cta = order[order.length - 1].el;
      const h2 = cta.querySelector('h2');
      // posisi y dokumen untuk titik mendarat di atas headline penutup
      ctaY = (h2 ? h2.getBoundingClientRect().top : cta.getBoundingClientRect().top + 200) + sy - 132;
    };

    document.body.prepend(canvas);
    root.classList.add('galaxy-on');
    cleanups.push(() => {
      root.classList.remove('galaxy-on', 'dragging-3d');
      delete root.dataset.scene;
    });
    measure();

    if (reduced) {
      // Reduced motion: satu frame statis, koin disembunyikan.
      mover.visible = false;
      const once = () => {
        measure();
        gl.render(scene, camera);
      };
      once();
      let onceRaf = 0;
      const onResize = () => {
        onceRaf = requestAnimationFrame(once);
      };
      window.addEventListener('resize', onResize);
      cleanups.push(() => {
        window.removeEventListener('resize', onResize);
        cancelAnimationFrame(onceRaf);
      });
      return { setTier() {}, dispose };
    }

    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('load', measure);
    // Tinggi section berubah tanpa event (font, gambar, konten async): ukur ulang berkala.
    const measureTimer = window.setInterval(measure, 2500);
    cleanups.push(() => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('load', measure);
      window.clearInterval(measureTimer);
    });

    let clock = 0;
    let landAt = -1;
    let landed = -9;
    let manual: number | null = null;
    let opened = 0;
    let ptx = 0;
    let pty = 0;
    let px = 0;
    let py = 0;
    const go = (k: SceneKey) => {
      if (k === active) return;
      active = k;
      tween = { from: { ...want }, to: SC[k], start: clock };
      canvas.style.opacity = small() && !(k === 'hero' || k === 'core' || k === 'cta') ? '.42' : '1';
      manual = null;
      if (k === 'cta') landAt = clock + 1.25;
      root.dataset.scene = k;
    };

    /* ---- drag untuk memutar, klik untuk membuka ---- */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const drag = { on: false, moved: false, sx: 0, sy: 0, lx: 0, ly: 0, rx: 0, ry: 0, vx: 0, vy: 0 };
    const hit = (e: PointerEvent) => {
      ndc.set((e.clientX / vw) * 2 - 1, -((e.clientY / vh) * 2) + 1);
      ray.setFromCamera(ndc, camera);
      return (
        mover.visible &&
        now.opacity > 0.5 &&
        ray.intersectObjects(core.visible ? [splitG, layers] : [splitG], true).length > 0
      );
    };
    const onPointerMove = (e: PointerEvent) => {
      ptx = (e.clientX / vw) * 2 - 1;
      pty = (e.clientY / vh) * 2 - 1;
      if (!drag.on) return;
      const dx = e.clientX - drag.lx;
      const dy = e.clientY - drag.ly;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
      drag.ry += 0.009 * dx;
      drag.rx = clamp(drag.rx + 0.007 * dy, -1.15, 1.15);
      drag.vy = 0.0022 * dx;
      drag.vx = 0.0017 * dy;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      e.preventDefault();
    };
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target;
      if (e.button || (el instanceof Element && el.closest(NO_DRAG_SELECTOR))) return;
      if (!hit(e)) return;
      e.preventDefault(); // tanpa seleksi teks selama koin diputar
      Object.assign(drag, { on: true, moved: false, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, vx: 0, vy: 0 });
      root.classList.add('dragging-3d');
    };
    const onPointerEnd = () => {
      if (!drag.on) return;
      if (!drag.moved) manual = opened > 0.5 ? 0 : 1;
      drag.on = false;
      root.classList.remove('dragging-3d');
    };
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    cleanups.push(() => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    });

    if (heat) {
      cleanups.push(() => {
        for (const p of ['--h1', '--h2', '--h3', '--heat']) heat.style.removeProperty(p);
        for (const b of blobs) b.style.transform = '';
      });
    }

    // quality governor untuk canvas se-viewport: DPR 1,5 -> 1
    const governor = createGovernor({
      warmup: 150,
      window: 80,
      budget: 0.026,
      maxSample: 0.2,
      onSlow() {
        if (quality > 1) {
          quality = 1;
          measure();
        }
      },
    });

    const removeClient = addFrameClient((dt, t) => {
      clock = t;
      const sy = window.scrollY;
      const line = sy + vh * 0.55;
      let k = order[0].key;
      for (let i = 0; i < order.length; i++) if (tops[i] <= line) k = order[i].key;
      go(k);
      if (tween) {
        const u = clamp((t - tween.start) / TWEEN_SECONDS);
        const e = power3InOut(u);
        for (const p of TARGET_KEYS) want[p] = tween.from[p] + (tween.to[p] - tween.from[p]) * e;
        if (u >= 1) tween = null;
      }
      for (const p of TARGET_KEYS) now[p] += (want[p] - now[p]) * Math.min(1, 4 * dt);
      px += (ptx - px) * Math.min(1, 3 * dt);
      py += (pty - py) * Math.min(1, 3 * dt);
      const sm = small();
      const f = sy * 9e-4;
      // posisi koin: target section-nya, atau (di hero) ikut halaman keluar dari bawah track bawah
      let tx = sm ? now.x * visW * 0.15 : now.x * visW * 0.5;
      let ty = now.y + 0.06 * Math.sin(0.8 * t);
      if (now.dock > 0.001) {
        const vi = idx('vision');
        const v = vi >= 0 ? tops[vi] : vh;
        const p = clamp(sy / Math.max(1, v - vh * 0.55));
        const docY = lerp(v - 64, v + 92, p * p) - sy;
        const ax = ((sm ? 0.5 : 0.8) - 0.5) * visW;
        const ay = (0.5 - docY / vh) * visH;
        tx = lerp(tx, ax, now.dock);
        ty = lerp(ty, ay, now.dock);
      }
      if (active === 'cta') {
        const ay = (0.5 - (ctaY - sy) / vh) * visH;
        const land = clamp((sy + vh * 0.55 - tops[tops.length - 1]) / (vh * 0.3));
        ty = lerp(ty, ay, smooth(land));
      }
      const since = t - landed;
      const kick = since < 2 ? Math.exp(-5 * since) * Math.sin(16 * since) : 0;
      mover.position.set(tx, ty, 0);
      mover.scale.setScalar(now.scale * (sm ? 0.72 : 1) * (1 + 0.1 * kick));
      if (!drag.on) {
        drag.ry += drag.vy;
        drag.rx = clamp(drag.rx + drag.vx, -1.15, 1.15);
        const d = Math.exp(-4.8 * dt);
        drag.vx *= d;
        drag.vy *= d;
      }
      body.rotation.y = now.rotY + f * now.spin + drag.ry + 0.18 * px + 0.06 * Math.sin(0.4 * t);
      body.rotation.x = now.rotX + drag.rx - 0.14 * py;
      // membuka: digerakkan scroll di dalam section "inside the coin", selain itu oleh klik pada koin.
      // Koin terbuka saat masuk dan menutup lagi saat blok pinned dilepas, sebelum section berikutnya mengambilnya.
      const ct = tops[idx('core')];
      const scrub =
        active === 'core'
          ? Math.min(clamp((sy + vh * 0.92 - ct) / (vh * 0.58)), 1 - clamp((sy + vh - (ct + coreH)) / (vh * 0.42)))
          : null;
      const openTarget = scrub ?? manual ?? 0;
      opened += (openTarget - opened) * (1 - Math.exp(-4.25 * dt));
      const P = opened * opened * (3 - 2 * opened);
      upper.position.y = 0.72 * P;
      lower.position.y = -0.72 * P;
      upper.rotation.x = -0.24 * P;
      lower.rotation.x = 0.24 * P;
      core.position.z = 0;
      core.scale.setScalar(0.18 + 0.95 * P);
      core.visible = P > 0.015;
      coreLight.intensity = 26 * P;
      if (core.visible) updateLayers(P, dt, t);
      haloMat.opacity = clamp(0.1 + 0.22 * now.glow + 0.35 * P) * now.opacity;
      halo.scale.setScalar(4.2 + 1.6 * P);
      metal.opacity = ringMat.opacity = glyphMat.opacity = clamp(now.opacity);
      mover.visible = now.opacity > 0.02;
      // mendarat di headline penutup
      if (landAt > 0 && t >= landAt) {
        landAt = -1;
        landed = t;
      }
      const ls = t - landed;
      if (ls < 1.4) {
        const e = 1 - Math.pow(1 - ls / 1.4, 3);
        shock.scale.setScalar(1 + 4.6 * e);
        shockMat.opacity = 0.85 * (1 - ls / 1.4);
        for (let i = 0; i < bcount; i++) {
          battr.setXYZ(i, bdir[i * 3] * (1 + 3.4 * e), bdir[i * 3 + 1] * (1 + 3.4 * e), bdir[i * 3 + 2] * (1 + 2 * e));
        }
        battr.needsUpdate = true;
        bmat.opacity = 0.9 * (1 - ls / 1.4);
      } else {
        shockMat.opacity = 0;
        bmat.opacity = 0;
      }
      stars.rotation.y = 0.03 * t + 0.3 * f;
      stars.rotation.x = 0.08 * Math.sin(0.1 * t);
      stars.scale.setScalar(now.spread * (1 - 0.22 * (ls < 2 ? Math.exp(-3 * ls) * Math.cos(7 * ls) : 0)));
      smat.opacity = 0.55 + 0.35 * now.glow;
      gl.render(scene, camera);
      if (heat) {
        const h = clamp(now.heat + (ls < 2 ? 0.3 * Math.exp(-2.5 * ls) : 0));
        heat.style.setProperty('--h1', `rgb(${mixRgb(HEAT_CALM[0], HEAT_NEON[0], h)})`);
        heat.style.setProperty('--h2', `rgb(${mixRgb(HEAT_CALM[1], HEAT_NEON[1], h)})`);
        heat.style.setProperty('--h3', `rgb(${mixRgb(HEAT_CALM[2], HEAT_NEON[2], h)})`);
        heat.style.setProperty('--heat', (0.42 + 0.3 * h).toFixed(3));
        if (blobs[0]) {
          blobs[0].style.transform = `translate(${(6 * Math.sin(0.13 * t)).toFixed(2)}vw,${(5 * Math.cos(0.11 * t)).toFixed(2)}vh)`;
        }
        if (blobs[1]) {
          blobs[1].style.transform = `translate(${(7 * Math.cos(0.09 * t)).toFixed(2)}vw,${(6 * Math.sin(0.12 * t)).toFixed(2)}vh)`;
        }
        if (blobs[2]) {
          blobs[2].style.transform = `translate(${(8 * Math.sin(0.07 * t + 1)).toFixed(2)}vw,${(6 * Math.cos(0.1 * t + 2)).toFixed(2)}vh)`;
        }
      }
      governor(dt);
    });
    cleanups.push(removeClient);

    return {
      setTier(tier) {
        fortress = tier === 'fortress';
      },
      dispose,
    };
  } catch (err) {
    console.warn('[xofn] galaxy unavailable, 2D sky stays:', err);
    dispose();
    return null;
  }
}
