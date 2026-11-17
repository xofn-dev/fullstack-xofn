// Loop rAF bersama untuk semua scene WebGL. HTML asli memakai array `stages`/`extras`
// dan satu requestAnimationFrame yang tidak pernah berhenti; di sini loop mulai pada
// pendaftaran pertama dan berhenti saat tidak ada scene tersisa (remount React aman).

export type FrameClient = (dt: number, t: number, raw: number) => void;

const clients = new Set<FrameClient>();
let rafId = 0;
let last = 0;

function frame(ts: number): void {
  rafId = requestAnimationFrame(frame);
  const t = ts / 1000;
  const raw = t - last;
  const dt = Math.min(0.05, Math.max(0.001, raw));
  last = t;
  if (document.hidden) return;
  for (const client of clients) client(dt, t, raw);
}

/** Daftarkan callback frame. Mengembalikan fungsi untuk melepasnya. */
export function addFrameClient(client: FrameClient): () => void {
  clients.add(client);
  if (!rafId) {
    last = 0;
    rafId = requestAnimationFrame(frame);
  }
  return () => {
    clients.delete(client);
    if (clients.size === 0 && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

export interface GovernorOptions {
  /** Frame awal yang dilewati: kompilasi shader dan intro membuat bacaan tidak wajar. */
  warmup: number;
  /** Jumlah sampel per jendela ukur. */
  window: number;
  /** Rata-rata detik per frame yang dianggap terlalu lambat. */
  budget: number;
  /** Sampel di atas nilai ini dibuang (tab baru kembali aktif, dsb.). */
  maxSample: number;
  onSlow(): void;
}

/** Quality governor: bila GPU tidak sanggup ~40 fps, scene diminta menurunkan resolusi. */
export function createGovernor(opts: GovernorOptions): (sample: number) => void {
  let frames = 0;
  let acc = 0;
  let n = 0;
  return (sample) => {
    if (++frames > opts.warmup && sample < opts.maxSample) {
      acc += sample;
      if (++n >= opts.window) {
        if (acc / n > opts.budget) opts.onSlow();
        acc = n = 0;
      }
    }
  };
}
