import 'server-only';

// Format error API tunggal: `{ error: { code, message } }` (CLAUDE.md §6). Respons API tidak
// pernah di-cache: semuanya pembacaan chain yang berlaku pada saat diminta.

const NO_STORE = { 'cache-control': 'no-store' } as const;

export function apiError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export function apiOk(body: unknown): Response {
  return Response.json(body, { headers: NO_STORE });
}
