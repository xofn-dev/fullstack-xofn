# fullstack-xofn

XofN — *Never one of one.* Launchpad token omnichain di atas LayerZero V2.
**Status: preview. Belum ada kontrak yang ter-deploy, tidak ada token sale, tidak ada verifikasi live.**

XofN is an independent project built on LayerZero. Not affiliated with or endorsed by LayerZero Labs.

## Dokumen

Baca berurutan: `CLAUDE.md` → `PRD.md` → `USER_FLOWS.md` → `DESIGN_SYSTEM.md` → `ARCHITECTURE.md` → `deployguide-xofn.md`. Bukti tiap phase ada di `proof/`.

## Menjalankan aplikasi web (Phase 1: landing, mode `preview`)

Butuh Node.js ≥ 20.9.

```bash
npm install
npm run dev
```

Variabel lingkungan yang **wajib** ada (tanpa nilai bawaan; aplikasi berhenti dengan pesan jelas bila kosong):

| Nama | Nilai |
|---|---|
| `NEXT_PUBLIC_XOFN_NETWORK` | `local`, `testnet`, atau `mainnet`. Untuk landing preview pakai `mainnet` |
| `NEXT_PUBLIC_SITE_URL` | URL absolut situs, mis. `http://localhost:3000` |

Isi keduanya di `.env.local` (tidak pernah di-commit) atau lewat shell. Daftar lengkap variabel untuk phase berikutnya ada di `ARCHITECTURE.md` §12.

## Pemeriksaan

```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run test        # vitest
npm run build       # next build
```

## Struktur

- `src/app` — route App Router, `globals.css` (token `@theme`), `styles/baseline.css` (baseline visual V8).
- `src/components` — `layout/` (chrome), `landing/` (section), `three/` (scene 3D, dimuat lazy), `ui/` (overlay).
- `src/lib` — `env`, `public-env`, `mode`, `chains` (registry chain + EID), `format`, `client/` (GSAP, Lenis), `three/` (factory scene).
- `tests` — Vitest.
- `contracts/`, `test/`, `script/`, `config/`, `deployments/` — dibuat mulai Phase 2–3. Deploy testnet dan mainnet **FROZEN**.
