import 'server-only';

// Satu-satunya pembaca env server. Aturan: tidak ada fallback nilai; variabel wajib yang hilang
// melempar error. Variabel opsional dibaca sebagai null dan keputusannya dibuat eksplisit
// oleh pemanggil.

export class ServerEnvError extends Error {
  constructor(name: string) {
    super(`Env server "${name}" belum diisi.`);
    this.name = 'ServerEnvError';
  }
}

export function requireServerEnv(name: string, value: string | undefined): string {
  if (value === undefined || value === '') throw new ServerEnvError(name);
  return value;
}

const optional = (value: string | undefined): string | null =>
  value === undefined || value === '' ? null : value;

/**
 * Cache Check memakai Supabase hanya bila KEDUA variabelnya diisi. Bila keduanya kosong,
 * Check memakai cache memori per proses dan melaporkannya di hasil (`cache.backend`).
 * Hanya satu yang diisi dianggap salah konfigurasi dan melempar error, bukan diabaikan.
 */
function readSupabase(): { url: string; serviceRoleKey: string } | null {
  const url = optional(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = optional(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (url === null && serviceRoleKey === null) return null;
  if (url === null) throw new ServerEnvError('NEXT_PUBLIC_SUPABASE_URL');
  if (serviceRoleKey === null) throw new ServerEnvError('SUPABASE_SERVICE_ROLE_KEY');
  return { url, serviceRoleKey };
}

export const serverEnv = {
  /**
   * RPC khusus Check per chain (opsional). Bila kosong, Check memakai RPC publik yang tercatat
   * sebagai data di registry chain (ARCHITECTURE §12).
   */
  checkRpc: {
    robinhood: optional(process.env.CHECK_RPC_ROBINHOOD),
    base: optional(process.env.CHECK_RPC_BASE),
    arbitrum: optional(process.env.CHECK_RPC_ARBITRUM),
  },
  supabase: readSupabase(),
  /**
   * Rahasia untuk route cron (Phase 4). Kosong → route cron menolak semua panggilan (503),
   * supaya tidak pernah terbuka tanpa otorisasi.
   */
  cronSecret: optional(process.env.CRON_SECRET),
} as const;
