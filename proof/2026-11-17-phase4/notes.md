# Phase 4 — Integrasi frontend terhadap Anvil lokal (mode `simulation`)

- **Tanggal:** 17 Nov 2026
- **Branch:** `phase-3/contracts`, tanpa commit (pilihan owner). Perubahan Phase 3 dan Phase 4 masih bercampur di working tree.
- **Dasar mulai:** owner menyatakan **"Phase 4 boleh mulai walau P55 terbuka"** (PRD P55, CLAUDE.md §4, `proof/2026-11-17-phase3/notes.md`). Gerbang Phase 3 tetap terbuka; kontrak tidak disentuh.
- **Sifat pekerjaan:** aplikasi web saja. Semua transaksi hanya ke Anvil lokal (chain ID 31337) dari akun dev Anvil yang ter-unlock. Tidak ada jaringan publik, key, keystore, `.env`, atau migrasi remote.

## Laporan gate

```
GATE Phase 4 — Integrasi frontend terhadap Anvil lokal
Status       : SIAP untuk review owner (dengan catatan di "Belum / risiko")
Sudah selesai: Flow A–I berjalan di mode simulation terhadap Anvil lokal.
               Bukti: raw/test-anvil.txt (7 tes siklus penuh), raw/test-unit.txt (117 tes),
               uji klik di Chrome headless (connect → buy, launch → redirect), shots/.
Belum / risiko: P55 terbuka (wajib tutup sebelum Phase 5 dan deploy publik apa pun).
               AppKit belum teruji (tidak ada WalletConnect project ID).
               Store/migrasi Supabase ditulis tetapi belum pernah dijalankan (tidak ada Docker).
               retryCompose: hanya builder, tanpa tombol, tidak teruji.
               Trading pool memakai AMM tiruan; adapter Router02 belum ada (P59).
               Uji klik manual oleh manusia (keyboard, reduced motion, wallet sungguhan) belum dilakukan.
Butuh keputusan/aksi manusia: konfirmasi P52, P56, P57, P58, P59 (PRD §11);
               keputusan commit/ignore deployments/local.json (gate review Phase 3 §11);
               uji manual: lihat "Cara mengulang" di bawah.
Rekomendasi  : setujui Phase 4 sebagai selesai untuk simulation, lalu tutup P55 dan
               jalankan ulang `npm run test:anvil` setelah deploy ulang Anvil.
```

## Indeks bukti

- `raw/test-anvil.txt` — 7 tes integrasi Anvil: launch Fortress, buy/sell dengan slippage, revert slippage, graduate (ditolak sebelum ambang, curve tertutup, tidak mengunci), expandAndLock sampai Locked di tiga chain, bridge dengan dust, pemulihan ack tertunda lewat `reAck`.
- `raw/test-unit.txt` — 117 tes Vitest, termasuk aturan status, langkah ekspansi, layanan token dengan chain palsu, builder transaksi, pesan revert, dan ABI yang dicocokkan dengan artefak `out/`.
- `shots/` — tangkapan layar (JPEG) halaman token Locked dan token yang ack-nya tertunda, `/launch`, `/bridge`, `/contracts`, `/proof`, Check untuk token Locked, dan landing di 390px.

## Gerbang Phase 4 (`PRD.md` §9.1): Flow A–I end-to-end di lokal

| Flow | Bukti |
|---|---|
| A Explore | `/api/tokens` + `ExploreLive`; filter D16 diuji di `tests/tokens.test.ts` |
| B Wallet & network | Uji klik CDP: tombol berubah menjadi `DEV 0x7099…79C8`; NetworkGuard di setiap aksi |
| C Check | `verify()` Registry tampil untuk token Locked (`shots/check-1280.jpg`); Check membaca Anvil tanpa Multicall3 |
| D Launch | Tes Anvil "Flow D" + uji klik CDP: validasi kosong → modal review → tanda tangan → `/t/0x24b7…` berbadge `XofN 3+1/2 · Bonding` |
| E Trading | Tes Anvil "Flow E" (dua tes) + uji klik CDP buy 0.5 ETH, trade tercatat on-chain |
| F.1 Graduate | Tes Anvil "Flow F.1" |
| F.2 Expand & lock | Tes Anvil "Flow F.2" dan "Flow F.2 retry"; `shots/token-ack-deferred-1280.jpg` |
| G Halaman token | `shots/token-locked-*.jpg`: tabel keamanan per chain, invariant 999M |
| H Bridge | Tes Anvil "Flow H": 1000 token + 123 unit, dust 123 tetap di wallet, saldo remote = jumlah terkirim |
| I Contracts & Proof | `shots/contracts-*.jpg`, `shots/proof-*.jpg` |

## Yang dibuat

- **Fondasi:** env publik `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` dan `NEXT_PUBLIC_RPC_*`, env server `CRON_SECRET` (nama saja); EID lokal 1/2/3 di registry chain; `src/lib/web3/addresses.ts` (manifest tervalidasi, satu-satunya sumber alamat); `resolveMode` dengan status manifest (P52); loader `config/tiers.json` (`src/lib/tiers`).
- **Web3 (`src/lib/web3/`):** ABI tulisan tangan + gabungan error, builder transaksi murni per aksi, `decode-revert`, `use-tx-flow`, `use-network-guard`, konfigurasi wagmi/AppKit, konektor akun dev Anvil (P56).
- **Server (`src/lib/tokens/`, `src/app/api/`):** pembaca on-chain, aturan status (Locked hanya bila `verify()` true di semua chain dan registrar dikenal), index memori dengan deteksi Anvil yang diulang, `SupabaseTokenStore` + migrasi `0002_xofn_tokens.sql` (belum dijalankan), `/api/tokens`, `/api/tokens/[address]`, `/api/cron/index-events`, `/api/cron/recheck`.
- **UI:** `/launch`, `/t/[address]`, `/bridge`, `/contracts`, `/proof`, Explore nyata di `/`, Check dengan `verify()`. Nav dan footer sadar mode. `LaunchFields` dan `TokenCard` dipakai bersama landing dan halaman aplikasi.
- **Tes:** `tests/web3.test.ts`, `tests/tokens.test.ts`, `tests/anvil/lifecycle.test.ts` (`npm run test:anvil`, terpisah dari `npm run test`).
- **Dependency** (tercantum di ARCHITECTURE §1, dipin exact): `wagmi` 3.7.11, `@wagmi/core` 3.6.9, `@reown/appkit` 1.8.24, `@reown/appkit-adapter-wagmi` 1.8.24, `@tanstack/react-query` 5.108.0. Ditambah `overrides` untuk `ox` (P58).

## Temuan

1. **Gas relay lokal (P57).** Pengantaran `deliverNext()` dengan gas hasil estimasi membuat ack di dalam try/catch kehabisan gas, sehingga muncul `AckDeferred` dan token tertahan di Expanding. Dibuktikan lewat trace (`OutOfGas` di `sendAckFromSelf`, lalu `AckDeferred`). Aplikasi memakai gas eksplisit 15M; tes "Flow F.2 retry" mereproduksi keadaan ini dan memulihkannya dengan `reAck`. Di jaringan nyata eksekusi pesan terbuka untuk siapa pun, jadi ini dicatat untuk auditor. Kontrak tidak diubah.
2. **Error lintas kontrak.** ABI Graduator tidak memuat `OnlyRegistrar` maupun `ThresholdNotReached`, padahal keduanya bisa muncul saat `launch`/`graduate`. Aplikasi memakai ABI error gabungan (`abi/errors.ts`).
3. **Konflik peer dependency (P58).** Lihat PRD §11.
4. **Chrome headless `--window-size=390`** merender dengan viewport minimum yang lebih lebar, sehingga tangkapannya tampak overflow padahal tidak. Pengukuran yang benar memakai emulasi viewport lewat CDP: `scrollWidth` = lebar viewport di 390/768/1280/1680 untuk 8 halaman. Satu overflow nyata (kolom implisit `.app-stack`) ditemukan lewat cara pertama dan sudah diperbaiki.

## Pemeriksaan

| Pemeriksaan | Hasil |
|---|---|
| `npm run lint` | lulus |
| `npm run typecheck` | lulus |
| `npm run test` | 117 lulus |
| `npm run test:anvil` | 7 lulus (dijalankan dua kali, berurutan, di node yang sama) |
| `npm run build` | lulus untuk `NEXT_PUBLIC_XOFN_NETWORK=local` dan `testnet` (preview) |
| `forge build && forge test` | 158 lulus, 0 gagal, 6 dilewati (fork test tanpa RPC); kontrak tidak berubah |
| Mode preview (`next start`, testnet) | semua halaman berlabel PREVIEW / PLANNED / NOT LIVE; `/api/tokens` → 503; tidak ada teks simulasi yang bocor |
| Overflow horizontal | tidak ada di 390/768/1280/1680px untuk `/`, `/launch`, `/t/*` (2 token), `/bridge`, `/contracts`, `/proof`, `/check/*` |
| `git status` | tidak ada perubahan di `contracts/`, `test/`, `script/`, `foundry.toml`. `deployments/local.json` ditulis ulang oleh `DeployLocal` dengan isi identik |
| Uji manual (keyboard, reduced motion, navigasi bolak-balik untuk kebocoran WebGL) | **belum dilakukan** oleh manusia; agent tidak bisa menguji fokus keyboard dan reduced motion secara visual |

## Perbedaan yang disengaja dari HTML

- Halaman aplikasi tidak ada di HTML konsep. Semuanya disusun dari kelas terminal, drawer, token card, dan form launch yang sudah ada (P24/F1).
- TierBadge di halaman token berupa tombol yang membuka DvnList di bawahnya, bukan popover.
- Kontrol relay lokal (warna caution, label SIMULATION) tidak ada di HTML; ia hanya muncul di mode simulation.

## Keputusan yang masih perlu konfirmasi

P52 (status manifest, diimplementasikan), P56 (akun dev Anvil), P57 (gas eksekusi pesan), P58 (`overrides` npm), P59 (adapter Router02), P26 (logo hanya hash), P25/D16 (status Expanding dipakai), P44 (library tidak ditampilkan di `/contracts`), P6 (quote ekspansi lokal ditampilkan berlabel SIMULATION QUOTE; biaya per tier tetap NOT QUOTED).

## Cara mengulang

```bash
anvil
~/.foundry/bin/forge script script/local/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 \
  --broadcast --slow --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
npm run test:anvil
NEXT_PUBLIC_XOFN_NETWORK=local NEXT_PUBLIC_SITE_URL=http://localhost:3000 npm run dev
```

## Catatan lingkungan

- Foundry v1.8.3 dari `~/.foundry/bin`. Anvil berjalan di port 8545 selama sesi.
- Tidak ada `.env` yang dibaca atau dibuat; env diberikan inline di perintah.
- Akun yang dipakai adalah akun dev bawaan Anvil yang ter-unlock. Tidak ada key yang dibuat, diimpor, atau disimpan.
