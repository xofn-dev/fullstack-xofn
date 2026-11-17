# fullstack-xofn

XofN — *Never one of one.* Launchpad token omnichain di atas LayerZero V2.
**Status: preview. Belum ada kontrak yang ter-deploy di jaringan publik, tidak ada token sale, tidak ada verifikasi live.**

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
- `contracts/` — kontrak Solidity (Phase 3): `XofNToken`, `XofNCurve`, `XofNGraduator`, `XofNRemote`, `XofNRegistry`, dan `libraries/`.
- `test/` — tes Foundry: `unit/`, `fuzz/`, `invariant/`, `lz/` (multi-endpoint), `fork/` (read-only), `mocks/`.
- `script/local/` — deploy ke Anvil saja. Tidak ada script deploy jaringan publik: deploy testnet dan mainnet **FROZEN**.
- `config/` — `tiers.json` (definisi tier) dan `dvn-labels.json`. `deployments/local.json` — manifest simulasi lokal.

## Kontrak (Phase 3, lokal saja)

Butuh Foundry (v1.8.x). `forge-std` adalah git submodule: `git submodule update --init`.

```bash
forge build
forge test                              # unit, fuzz, invariant, multi-endpoint
forge test --match-contract Invariant
forge test --profile ci                 # fuzz 10k, invariant 1000 x 128
```

Fork test (`test/fork/`) hanya membaca dan dilewati bila `FORK_RPC_ROBINHOOD`, `FORK_RPC_BASE`, atau `FORK_RPC_ARBITRUM` kosong.

Simulasi lokal tiga chain di satu node Anvil (akun dev yang sudah ter-unlock; tanpa private key):

```bash
anvil
forge script script/local/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 \
  --broadcast --slow --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```
