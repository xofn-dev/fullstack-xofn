import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { addFrameClient, createGovernor } from './loop';
import { PAL } from './palette';
import { ResourceBag, disposeObject3D } from './util';

export interface StageOptions {
  fov?: number;
  /** [strength, radius, threshold] */
  bloom?: readonly [number, number, number];
  maxPixels?: number;
  /** prefers-reduced-motion: hanya render saat `dirty`, dengan dt = 0. */
  reduced?: boolean;
}

export interface Stage {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  /** Warna latar scene (objek yang sama dengan `scene.background`). */
  readonly background: THREE.Color;
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloomPass: UnrealBloomPass;
  /** Resource GPU milik scene ini; dibuang di `dispose()`. */
  readonly bag: ResourceBag;
  maxPixels: number;
  visible: boolean;
  dirty: boolean;
  width: number;
  height: number;
  update(dt: number, t: number): void;
  onResize(w: number, h: number): void;
  resize(): void;
  dispose(): void;
}

// Canvas yang konteksnya sudah dilepas paksa tidak bisa dipakai lagi: getContext()
// mengembalikan konteks mati yang sama. Komponen React harus mengganti node canvas-nya.
const spentCanvases = new WeakSet<HTMLCanvasElement>();

export function isCanvasSpent(canvas: HTMLCanvasElement): boolean {
  return spentCanvases.has(canvas);
}

/** Lepas renderer beserta konteks WebGL-nya dan tandai canvas sebagai tidak bisa dipakai ulang. */
export function releaseRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.dispose();
  renderer.forceContextLoss();
  spentCanvases.add(renderer.domElement);
}

/**
 * Stage: renderer + bloom, hanya dirender saat terlihat di layar.
 * Melempar error bila WebGL tidak tersedia; pemanggil membiarkan fallback statis tampil.
 */
export function createStage(
  canvas: HTMLCanvasElement,
  { fov = 30, bloom = [0.9, 0.6, 0.8], maxPixels = 1.5e6, reduced = false }: StageOptions = {},
): Stage {
  if (spentCanvases.has(canvas)) throw new Error('Canvas WebGL context was already released');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  const bag = new ResourceBag();
  let composer: EffectComposer | null = null;
  let stage: Stage | null = null;
  const passes: { dispose(): void }[] = [];
  try {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.localClippingEnabled = true;
    const scene = new THREE.Scene();
    const background = new THREE.Color(PAL.bg);
    scene.background = background;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = bag.track(pmrem.fromScene(room, 0.035));
    scene.environment = env.texture;
    scene.environmentIntensity = 0.7;
    pmrem.dispose();
    room.dispose();
    const camera = new THREE.PerspectiveCamera(fov, 1, 1.5, 110);
    composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 2 }),
    );
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(4, 4), bloom[0], bloom[1], bloom[2]);
    const outputPass = new OutputPass();
    passes.push(renderPass, bloomPass, outputPass);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);
    const fx = composer;

    let disposed = false;
    const st: Stage = {
      canvas,
      renderer,
      scene,
      background,
      camera,
      composer: fx,
      bloomPass,
      bag,
      maxPixels,
      visible: false,
      dirty: true,
      width: 0,
      height: 0,
      update() {},
      onResize() {},
      resize() {
        if (disposed) return;
        const w = Math.max(2, canvas.clientWidth);
        const h = Math.max(2, canvas.clientHeight);
        if (w === st.width && h === st.height) return;
        st.width = w;
        st.height = h;
        const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(st.maxPixels / (w * h)));
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        fx.setPixelRatio(dpr);
        fx.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        st.onResize(w, h);
        st.dirty = true;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        removeClient();
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        disposeObject3D(scene);
        bag.dispose();
        for (const pass of passes) pass.dispose();
        fx.dispose();
        releaseRenderer(renderer);
      },
    };
    const resizeObserver = new ResizeObserver(() => st.resize());
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        st.visible = entries[0].isIntersecting;
        if (st.visible) st.dirty = true;
      },
      { rootMargin: '80px' },
    );
    intersectionObserver.observe(canvas);
    // Bila GPU tidak sanggup ~40 fps, scene dirender pada resolusi lebih rendah.
    const governor = createGovernor({
      warmup: 150,
      window: 80,
      budget: 0.025,
      maxSample: 0.25,
      onSlow() {
        if (st.maxPixels > 5.5e5) {
          st.maxPixels *= 0.7;
          st.width = 0;
          st.resize();
        }
      },
    });
    const removeClient = addFrameClient((dt, t, raw) => {
      if (!st.dirty && (!st.visible || reduced)) return;
      st.update(reduced ? 0 : dt, t);
      fx.render(dt);
      st.dirty = false;
      governor(raw);
    });
    stage = st;
    st.resize(); // ukur sebelum update pertama supaya matematika kamera tidak pernah melihat 0/0
    return st;
  } catch (err) {
    // Gagal di tengah jalan: jangan tinggalkan konteks, observer, atau callback frame.
    if (stage) {
      stage.dispose();
    } else {
      bag.dispose();
      for (const pass of passes) pass.dispose();
      composer?.dispose();
      releaseRenderer(renderer);
    }
    throw err;
  }
}
