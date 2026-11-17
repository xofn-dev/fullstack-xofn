# CLAUDE.md — XofN

Instruksi kerja permanen untuk Claude Code di repository ini. Baca seluruhnya sebelum mengerjakan task apa pun.

## 1. Konteks

**XofN** (*Never one of one. · Graduate on proof, not promises.*) adalah launchpad token omnichain di atas LayerZero V2. Keamanan lintas chain dijadikan standar yang terukur: setiap token membawa badge jumlah DVN (`XofN 2+1/2` / `XofN 3+1/2`), dan konfigurasi 1-of-1 tidak pernah diizinkan.

Inti produk:
1. Token dibuat di bonding curve di **Base**.
2. Saat ambang tercapai, siapa pun memanggil `graduate()`.
3. Graduator membuat pool, men-deploy token ke **Arbitrum** dan **Robinhood Chain**, menyalurkan likuiditas lewat lzCompose, memasang tier DVN, lalu **mengunci semuanya** (owner = 0, delegate = 0).
4. `XofNRegistry.verify(token)` membuktikannya on-chain.
5. **XofN Check** membaca konfigurasi DVN OFT mana pun.

**Ini proyek baru dari nol.** Stack diturunkan dari proyek Cognita, Assize, dan Fademan (`ARCHITECTURE.md` §1). Per 17 Nov 2026 belum ada kode.

## 2. Urutan membaca

1. `CLAUDE.md` (ini)
2. `PRD.md` — produk, mekanisme, phase, acceptance criteria, keputusan terbuka (§11)
3. `USER_FLOWS.md` — alur yang tidak boleh rusak
4. `DESIGN_SYSTEM.md` — wajib untuk task UI
5. `ARCHITECTURE.md` — wajib sebelum menyentuh kode
6. Sumber asli bila ragu: `brief-xofn.md` (protokol, keamanan, klaim) dan `xofn-coinfall-v8-galaxy.html` (visual)

**Hierarki kebenaran** saat ada konflik:
- Aturan protokol, keamanan, dan klaim publik → `brief-xofn.md`.
- Tampilan → `xofn-coinfall-v8-galaxy.html` (baseline; boleh ditingkatkan, tidak boleh diganti dengan desain yang tidak berhubungan).
- Struktur teknis → `ARCHITECTURE.md`, lalu kode yang sudah ada.
- Instruksi owner terbaru mengalahkan semuanya.

Konflik yang belum diputuskan tercantum di `PRD.md` §11 (P#), `DESIGN_SYSTEM.md` §14 (D#), dan `USER_FLOWS.md` §10 (F#). **Jangan memutuskannya diam-diam.** Ikuti rekomendasi yang tertulis, atau tanyakan.

## 3. Prinsip non-negotiable (dari brief)

1. **1-of-1 tidak pernah diizinkan**: di kontrak, di form launch, dan di konfigurasi apa pun.
2. **Tidak ada status "Locked" tanpa `verify()` on-chain** yang bernilai true di **semua** chain token. DB hanya cache.
3. **Server tidak pernah memegang key.** Semua transaksi disusun di browser dan ditandatangani di wallet pengguna. Tidak ada route yang menandatangani.
4. **Aturan klaim publik** (`PRD.md` §4.3):
   - tidak pernah memakai *unsafe*, *unhackable*, *zero risk*, *official/partner of LayerZero*;
   - XofN Check menampilkan fakta, bukan tuduhan;
   - data demo selalu berlabel.
5. **Disclaimer wajib** di footer: *XofN is an independent project built on LayerZero. Not affiliated with or endorsed by LayerZero Labs.* Logo dan nama produk LayerZero tidak boleh dipakai di branding.
6. **Hasil tidak pernah dipalsukan.** RPC gagal ditampilkan sebagai "not read", bukan tebakan.
7. Aturan bisnis (supply 999M, shared decimals 6, tier, urutan graduation, dust 0,000001) tidak boleh diubah karena alasan visual.

## 4. Phase

| Phase | Fokus | Status |
|---|---|---|
| **0** | Verifikasi riset: DVN per pathway, AMM, aset pasangan, EID, semantik ULN. Read-only, **tanpa transaksi** | Belum mulai |
| **1** | Fondasi repo + port landing HTML (mode `preview`) | Belum mulai |
| **2** | XofN Check: baca `getConfig` OFT yang sudah ada + cache + kartu share | Belum mulai |
| **3** | Kontrak (Token, Curve, Graduator, Remote, Registry), **lokal saja** (forge test + Anvil) | Belum mulai |
| **4** | Integrasi frontend aplikasi terhadap Anvil lokal / mode `simulation` | Belum mulai |
| **5** | Hardening & kesiapan audit | Belum mulai |
| **6** | **Deploy testnet** | **FROZEN: menunggu brief tambahan dari owner** |
| **7** | **Deploy mainnet** (audit eksternal, rollout) | **FROZEN: menunggu brief tambahan dari owner** |
| Backlog | lzRead / XofN Score | Pasca-MVP |

Gerbang tiap phase ada di `PRD.md` §8–9. Kerjakan **hanya** phase yang diminta di task. Temuan untuk phase lain dicatat di laporan sebagai rekomendasi.

## 5. Scope & larangan per phase

### 5.1 Phase 6–7 FROZEN — larangan mutlak sampai owner memberi brief tambahan
- Membuat atau mengubah script deploy untuk jaringan publik (testnet maupun mainnet). Yang boleh hanya `contracts/script/local/*` untuk Anvil.
- Mengisi `[etherscan]`, profil deploy, atau RPC testnet/mainnet untuk keperluan deploy di `foundry.toml`. RPC **fork read-only** untuk tes boleh dipakai, nilainya dibaca dari env.
- Membuat `deployments/testnet.json` atau `deployments/mainnet.json`. Yang boleh hanya `deployments/local.json`.
- Meminta, membuat, atau menyiapkan private key, mnemonic, faucet, atau Safe.
- Menjalankan `forge script --broadcast`, `cast send`, atau transaksi on-chain apa pun di jaringan publik.
- Push migrasi Supabase ke project remote/produksi, atau mengubah env produksi.
- Mengubah copy menjadi klaim "live", atau menghapus label NOT LIVE/DEMO.

Jika sebuah task tampak membutuhkan salah satu hal di atas: **berhenti**, jelaskan kebutuhannya, dan tanyakan ke owner.

### 5.2 Batas per phase
| Phase | Boleh | Tidak boleh |
|---|---|---|
| 0 | Membaca docs LZ, `cast call` read-only, menulis temuan ke `proof/` dan memperbarui `[Belum]` di dokumen | Kode produksi, transaksi |
| 1 | `src/app/**` (markup, layout, metadata), `src/components/**`, `src/lib/{client,three,cn,format,mode,env,public-env,chains}`, `globals.css`, aset `public/`, setup tooling | `contracts/**`, `supabase/**`, `src/app/api/**` (kecuali stub), aksi Web3 |
| 2 | `src/lib/{lz,check,supabase}`, `src/app/api/check/**`, `src/app/check/**`, migrasi Supabase **lokal**, `tests/**` | `contracts/**`, aksi tx |
| 3 | `contracts/**` (src, test, `script/local`), `deployments/local.json` | Script publik (§5.1), perubahan frontend |
| 4 | `src/lib/web3/**`, halaman aplikasi, `src/app/api/tokens/**`, `api/cron/**` | Mengubah kontrak tanpa kembali ke gerbang Phase 3 |
| 5 | Review, tes tambahan, NatSpec, dokumen audit | Fitur baru |

Dependency baru di `package.json` atau `contracts/package.json` yang **tidak** tercantum di `ARCHITECTURE.md` §1 → minta persetujuan dulu.

## 6. Standar kode

- **Next.js 16 App Router** dengan direktori `src/` dan alias `@/*`.
  - Server Component untuk fetch awal; `'use client'` hanya bila perlu.
  - Middleware bernama `proxy.ts` di Next 16, dan **tidak boleh** dipakai untuk otorisasi.
  - Baca `node_modules/next/dist/docs/` sebelum memakai API Next.
- **TypeScript strict.**
  - Tidak ada `any` baru.
  - Tipe domain di `src/types/domain.ts` dan `src/types/enums.ts`.
  - `src/types/db.ts` dihasilkan otomatis (jangan diedit manual).
- **Env:** `process.env` hanya dibaca di `src/lib/env.ts` (server, `server-only`) dan `src/lib/public-env.ts`. Tidak boleh ada fallback `|| 'default'`. Env wajib yang hilang → error.
- **Tailwind v4:**
  - token di `@theme` dalam `src/app/globals.css`, tanpa `tailwind.config`;
  - **tidak ada hex hard-code baru di komponen**; tambahkan token;
  - pengecualian: `src/lib/three/palette.ts` (sinkron dengan `DESIGN_SYSTEM.md` §2);
  - `cn()` dari `src/lib/cn.ts` untuk kelas kondisional.
- **Animasi:**
  - GSAP + ScrollTrigger hanya lewat `src/lib/client/gsap.ts` (context + revert saat unmount);
  - Lenis hanya lewat `src/lib/client/lenis.ts`;
  - jangan tambah library animasi lain (motion/framer, dsb.).
- **3D:**
  - `three` vanilla (npm), addon dari `three/examples/jsm/...`;
  - factory murni di `src/lib/three/`, komponen di `src/components/three/` dimuat `next/dynamic({ ssr: false })`;
  - tanpa R3F/drei, tanpa CDN.
- **Font** lewat `next/font/google` di `layout.tsx` (D3), bukan `<link>`.
- **Web3:**
  - hook AppKit hanya di komponen `*Active` yang dirender saat `isWeb3Configured`;
  - alamat hanya dari `src/lib/web3/addresses.ts` (yang membaca `deployments/`);
  - chain/EID/nama chain hanya dari `src/lib/chains`;
  - **jangan menyalin alamat dari proyek lain**.
- **Keamanan:**
  - teks dari pengguna di-escape (`src/lib/escape-html.ts`) sebelum `dangerouslySetInnerHTML`;
  - input alamat divalidasi (`viem.isAddress`) lalu di-lowercase;
  - API error berformat `{ error: { code, message } }`;
  - modul server memakai `import 'server-only'`.
- **Gaya:**
  - komentar singkat bahasa Indonesia yang menjelaskan *kenapa*;
  - nama variabel bahasa Inggris;
  - copy UI bahasa Inggris;
  - file kebab-case, named export PascalCase.
- **Reuse** sebelum membuat baru: `src/components/ui/*` dan komponen domain. Restyle, jangan duplikasi.

## 7. Standar kontrak

- Foundry, solc 0.8.24, `evm_version = cancun`, optimizer 200, OZ v5, paket `@layerzerolabs/*` (versi dipin; lihat `ARCHITECTURE.md` §1.2).
- `XofNToken`:
  - tanpa `mint` publik, `pause`, `setFee`, `blacklist`, `upgrade`;
  - `renounceOwnership()` **menolkan delegate lebih dulu**.
- `XofNGraduator`:
  - tidak upgradeable;
  - tidak punya fungsi admin di luar jalur graduation;
  - tidak bisa mengubah tier setelah launch.
- Konfigurasi ULN dan library selalu **eksplisit** (jangan bergantung pada default). Array DVN terurut naik dan unik.
- `lzCompose` hanya dari endpoint dan untuk token terdaftar; pool dibuat dan diisi dalam satu panggilan.
- Semua **tes wajib** di `PRD.md` §9.2 harus ada dan lulus. Jalankan `forge test --profile ci` sebelum menyatakan Phase 3/5 selesai.
- Fork test hanya membaca; tidak ada broadcast.

## 8. Panduan UI/UX, animasi, 3D

- Ikuti `DESIGN_SYSTEM.md`: dark navy + mint, glass panel, mono uppercase untuk data, TierBadge yang selalu bisa diklik dan selalu bersama status.
- **Responsif:** breakpoint 1150 / 900 / 760 / 640 / 430. **Navigasi mobile wajib.** Tidak ada overflow horizontal di 360–390px.
- **Motion** menjelaskan status. Micro-interaction 150–700ms. Semua animasi, Lenis, dan parallax menghormati `prefers-reduced-motion`.
- **3D:**
  - satu renderer per scene;
  - render hanya saat terlihat; pause saat tab tersembunyi;
  - quality governor;
  - **dispose lengkap saat unmount**;
  - fallback statis bila WebGL gagal;
  - galaxy WebGL mati di ≤860px (D5);
  - maksimum 3 konteks WebGL di desktop.
- **Aksesibilitas:**
  - fokus terlihat (mint), keyboard penuh;
  - `radiogroup` untuk tier, `aria-pressed` untuk toggle;
  - dialog dengan fokus terjebak, `aria-live` untuk hasil Check dan error form;
  - kontras AA.
- Jangan menambah efek yang tidak membawa makna data atau mengganggu input. Panel review "coin-lab" dari HTML **tidak** di-port (D1).

## 9. Batasan Web3 & keamanan

- **Jangan membaca, menampilkan, menyalin, atau commit isi `.env*`.** Cantumkan nama variabel saja.
- **Jangan mengasumsikan kontrak XofN sudah ter-deploy.** Semua halaman berjalan di mode `preview` sampai manifest yang sah ada.
- Nama chain di copy diambil dari registry chain. EID yang masih `[Belum]` tidak boleh ditebak.
- Jangan memindahkan otorisasi ke klien atau ke `proxy.ts`. Klien hanya memilih tombol mana yang tampil.
- Tidak ada deploy, migrasi remote, `forge script --broadcast`, atau transaksi on-chain (lihat juga §5.1).
- **Git:**
  - tidak ada operasi destruktif (`reset --hard`, force push, hapus branch);
  - commit/push hanya bila diminta;
  - bila di `main`, buat branch dulu.
- **Lingkungan dev:** DNS Telkomsel memblokir `*.robinhood.com`. Pakai VPN atau DNS lain sebelum menguji RPC Robinhood.

## 10. Pemeriksaan & pengujian

Sebelum melaporkan selesai:
1. **Web:** `npm run lint` (`eslint`, **bukan** `next lint` yang sudah dihapus di Next 16), `npm run typecheck` (`tsc --noEmit`), `npm run test` (Vitest), `npm run build`. Semuanya harus lulus.
2. **Kontrak** (bila disentuh): `forge build && forge test` (Phase 3) dan `forge test --profile ci` (Phase 5). Jalankan dari `contracts/`.
3. **Uji manual** `npm run dev` di mode yang relevan (`preview` / `simulation`), mengikuti flow terkait di `USER_FLOWS.md`.
4. Cek lebar **390, 768, 1280, 1680px**, reduced motion, dan navigasi bolak-balik antar halaman (memastikan tidak ada kebocoran konteks WebGL).
5. Pastikan tidak ada perubahan di area terlarang: `git status` / `git diff --stat`.
6. Pastikan copy mematuhi aturan klaim (`PRD.md` §4.3) dan data demo berlabel.

Script `npm run e2e*` (bila nanti ada) yang menyentuh chain publik **tidak boleh** dijalankan tanpa izin.

## 11. Pelaporan

Setiap akhir task, laporkan:
- File yang diubah beserta alasannya.
- Perbedaan yang disengaja dari `xofn-coinfall-v8-galaxy.html`, beserta alasannya.
- Hasil lint/typecheck/test/build/forge dan uji manual apa adanya, termasuk yang gagal atau dilewati.
- Temuan di luar scope phase sebagai rekomendasi, bukan perubahan.
- Keputusan yang masih perlu konfirmasi (rujuk P#/D#/F#).
- Pembaruan tabel status (`DESIGN_SYSTEM.md` §15, `USER_FLOWS.md` §11) dan label `[Belum]` yang sudah terverifikasi.

**Bukti milestone** disimpan di `proof/YYYY-MM-DD-<milestone>/notes.md` dengan tautan dan satu kalimat konteks per item [Brief]. **Dilarang muncul di bukti:** private key, seed phrase, isi `.env`, kredensial RPC, dashboard admin. Pekerjaan yang gagal tetap dilaporkan.

## 12. Larangan perubahan scope

- Jangan mengubah aturan protokol (supply, tier, urutan graduation, composer, `verify`, aturan klaim) karena alasan visual atau kemudahan.
- Jangan menambah fitur yang tidak ada di brief tanpa persetujuan. Contoh: UI admin, token $XOFN, lzRead, chain tambahan, fitur AI, verifikasi creator.
- Jangan melakukan refactor besar di luar kebutuhan task.
- Jangan menghapus file atau fitur tanpa keputusan.
- Jangan mengerjakan apa pun dari Phase 6–7 (§5.1).
- Jika ragu apakah sesuatu masuk scope: anggap **tidak**, lalu tanyakan.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
