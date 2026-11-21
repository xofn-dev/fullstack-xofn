import { COSMOS_TONES, type Rgb } from './palette';
import { prefersReducedMotion } from './util';

export interface CosmosController {
  /** Hidupkan lagi langit 2D setelah galaxy WebGL dilepas (mis. viewport menyempit ke ≤860px). */
  resume(): void;
  dispose(): void;
}

interface Star {
  x: number;
  y: number;
  z: number;
  r: number;
  p: number;
  s: number;
  t: Rgb;
}

/**
 * Langit 2D di `#cosmosCanvas`: fallback untuk browser tanpa WebGL dan untuk layar sempit (D5).
 * Berhenti sendiri selama `html.galaxy-on` terpasang (CSS juga menyembunyikan canvas-nya).
 */
export function mountCosmosFallback(
  canvas: HTMLCanvasElement,
  options: { still?: boolean } = {},
): CosmosController | null {
  const g = canvas.getContext('2d');
  if (!g) return null;
  // `still`: langit digambar sekali dan tidak bergerak (halaman aplikasi, D6). Panel glass di
  // atas langit yang diam tidak perlu menghitung ulang blur-nya setiap frame.
  const reduced = prefersReducedMotion() || options.still === true;
  const on3d = () => document.documentElement.classList.contains('galaxy-on');
  let W = 0;
  let H = 0;
  let D = 1;
  let stars: Star[] = [];
  let raf = 0;
  let last = 0;
  let resizeTimer = 0;
  let disposed = false;

  const draw = (ts: number) => {
    g.clearRect(0, 0, W, H);
    for (const s of stars) {
      const a = (0.16 + s.z * 0.42) * (0.72 + 0.28 * Math.sin(ts * 0.0009 * s.s + s.p));
      g.fillStyle = `rgba(${s.t.join(',')},${a.toFixed(3)})`;
      g.beginPath();
      g.arc(s.x, s.y, s.r * (0.6 + s.z * 0.5), 0, 6.2832);
      g.fill();
    }
  };
  const fit = () => {
    if (disposed || on3d()) return;
    W = window.innerWidth;
    H = window.innerHeight;
    D = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * D);
    canvas.height = Math.round(H * D);
    g.setTransform(D, 0, 0, D, 0, 0);
    const n = Math.min(230, Math.max(90, Math.floor((W * H) / 6200)));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      z: 0.2 + Math.random() * 0.8,
      r: 0.35 + Math.random() * 0.95,
      p: Math.random() * 7,
      s: 0.4 + Math.random() * 0.9,
      t: COSMOS_TONES[(Math.random() * COSMOS_TONES.length) | 0],
    }));
    draw(performance.now());
  };
  const tick = (ts: number) => {
    raf = 0;
    if (disposed || document.hidden || on3d()) return; // langit WebGL sudah mengambil alih
    if (ts - last >= 1000 / 24) {
      const dt = Math.min(0.1, (ts - last) / 1000);
      last = ts;
      for (const s of stars) {
        s.y += dt * 3.2 * s.z;
        s.x -= dt * 0.8 * s.z;
        if (s.y > H + 4) {
          s.y = -4;
          s.x = Math.random() * W;
        }
        if (s.x < -4) s.x = W + 4;
      }
      draw(ts);
    }
    raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (disposed || reduced || raf || document.hidden || on3d()) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(fit, 140);
  };
  const onVisibility = () => start();

  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  fit();
  if (!reduced) raf = requestAnimationFrame(tick);

  return {
    resume() {
      fit();
      start();
    },
    dispose() {
      disposed = true;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(resizeTimer);
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
