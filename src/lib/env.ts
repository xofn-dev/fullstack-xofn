import 'server-only';

// Satu-satunya pembaca env server. Phase 1 belum punya variabel server;
// variabel Check (CHECK_RPC_*, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET) ditambahkan di Phase 2.
// Aturan: tidak ada fallback; variabel wajib yang hilang harus melempar error.

export class ServerEnvError extends Error {
  constructor(name: string) {
    super(`Env server "${name}" belum diisi.`);
    this.name = 'ServerEnvError';
  }
}

// Dipakai pembaca variabel di phase berikutnya, mis. requireServerEnv('CRON_SECRET', process.env.CRON_SECRET).
export function requireServerEnv(name: string, value: string | undefined): string {
  if (value === undefined || value === '') throw new ServerEnvError(name);
  return value;
}
