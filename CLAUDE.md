# CLAUDE.md — XofN

Instruksi kerja permanen untuk Claude Code di repository ini. Baca seluruhnya sebelum mengerjakan task apa pun.

## 1. Konteks

**XofN** (*Never one of one. · Graduate on proof, not promises.*) adalah launchpad token omnichain di atas LayerZero V2. Keamanan lintas chain dijadikan standar yang terukur: setiap token membawa badge jumlah DVN (`XofN 2+1/2` / `XofN 3+1/2`), dan konfigurasi 1-of-1 tidak pernah diizinkan.

**Peran chain** (`deployguide-xofn.md`, 17 Nov 2026): **Robinhood Chain = home**, sedangkan **Base dan Arbitrum = chain ekspansi**. Topologinya hub lewat Robinhood.

Inti produk berjalan dalam **dua tahap**:
1. **Tahap 1 — lokal di Robinhood.**
   - Token di-launch sebagai **OFT sejak awal**, lalu diperdagangkan di bonding curve.
   - Saat ambang tercapai, siapa pun memanggil `graduate()`, yang membuat pool di Robinhood.
   - Status token menjadi **Graduated · awaiting expansion**.
   - Owner dan delegate **tetap `XofNGraduator`**. Tidak ada renounce.
2. **Tahap 2 — ekspansi + kunci.**
   - Siapa pun memanggil `expandAndLock(token)`.
   - Graduator men-deploy token ke Base dan Arbitrum, mengirim likuiditas lewat lzCompose, lalu memasang tier DVN.
   - Setelah itu semuanya **dikunci**: owner = 0, delegate = 0.
3. `XofNRegistry.verify(token)` membuktikan status kunci on-chain. Registry ada di setiap chain.
4. **XofN Check** membaca konfigurasi DVN dari OFT mana pun.

**Ini proyek baru dari nol.** Stack diturunkan dari proyek Cognita, Assize, dan Fademan (`ARCHITECTURE.md` §1). Status tiap phase ada di §4.

## 2. Urutan membaca

1. `CLAUDE.md` (ini)
2. `PRD.md` — produk, mekanisme, phase, acceptance criteria, keputusan terbuka (§11)
3. `USER_FLOWS.md` — alur yang tidak boleh rusak
4. `DESIGN_SYSTEM.md` — wajib untuk task UI
5. `ARCHITECTURE.md` — wajib sebelum menyentuh kode
6. `deployguide-xofn.md` — panduan deploy dari PM (peran chain, fase deploy, struktur repo, env). Prosedur deploy-nya **FROZEN** (§5.1)
7. `ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md` — playbook deploy sebelum CA. **Acuan Phase 6–7; tidak membuka deploy.** Diselaraskan dengan XofN di `ARCHITECTURE.md` §5.6.1 (Opsi A, PRD P47). Bagian yang tidak relevan untuk XofN: factory reservasi anak per token dan validasi CA (gate review `proof/2026-11-17-phase3/gate-review-playbook.md` Bagian 2)
8. `proof/2026-11-17-phase0/` — hasil riset Phase 0, termasuk `09-addendum-robinhood-home.md`
9. Sumber asli: `brief-xofn.md` (protokol, keamanan, klaim) dan `xofn-coinfall-v8-galaxy.html` (visual)

**Hierarki kebenaran** saat ada konflik:
1. Instruksi owner/PM terbaru.
2. `deployguide-xofn.md`: peran chain, lifecycle dua tahap, fase deploy, struktur repo, manifest, env, klaim per tahap.
3. `brief-xofn.md`: aturan protokol, keamanan, dan klaim publik lainnya.
4. `xofn-coinfall-v8-galaxy.html`: tampilan (baseline; boleh ditingkatkan, tidak boleh diganti dengan desain yang tidak berhubungan).
5. `ARCHITECTURE.md`, lalu kode yang sudah ada: struktur teknis.

Bila guide bertentangan dengan **fakta on-chain** yang terverifikasi di Phase 0 (contoh: operator DVN yang tidak ada di Robinhood), **fakta yang menang**. Konfliknya dicatat sebagai keputusan untuk PM.

Konflik yang belum diputuskan tercantum di `PRD.md` §11 (P#), `DESIGN_SYSTEM.md` §14 (D#), dan `USER_FLOWS.md` §10 (F#). **Jangan memutuskannya diam-diam.** Ikuti rekomendasi yang tertulis, atau tanyakan.

## 3. Prinsip non-negotiable (dari brief + guide)

1. **1-of-1 tidak pernah diizinkan**: di kontrak, di form launch, dan di konfigurasi apa pun. Tier hanya Standard (2+1/2) dan Fortress (3+1/2).
2. **Token adalah OFT sejak tahap 1.** Selama bonding dan sampai ekspansi selesai, owner dan delegate token = kontrak `XofNGraduator`, bukan wallet orang.
3. **Tidak ada renounce atau delegate = 0 di tahap 1**, termasuk untuk token yang sudah lulus graduation lokal. Penguncian hanya terjadi di `expandAndLock`.
4. **Tidak ada status "Locked" tanpa `verify()` on-chain** yang bernilai true di **semua** chain token. DB hanya cache.
5. **Server tidak pernah memegang key.** Semua transaksi disusun di browser dan ditandatangani di wallet pengguna. Tidak ada route yang menandatangani.
6. **Aturan klaim publik** (`PRD.md` §4.3), termasuk klaim per tahap:
   - tidak pernah memakai *unsafe*, *unhackable*, *zero risk*, *official/partner of LayerZero*;
   - "Omnichain" belum boleh dipakai sebagai klaim live sebelum tahap 2;
   - XofN Check menampilkan fakta, bukan tuduhan;
   - data demo selalu berlabel.
7. **Disclaimer wajib** di footer: *XofN is an independent project built on LayerZero. Not affiliated with or endorsed by LayerZero Labs.* Logo dan nama produk LayerZero tidak boleh dipakai di branding.
8. **Hasil tidak pernah dipalsukan.** RPC gagal ditampilkan sebagai "not read", bukan tebakan.
9. Aturan bisnis (supply 999M, shared decimals 6, tier, urutan graduation dan ekspansi, dust 0,000001) tidak boleh diubah karena alasan visual.

## 4. Phase

| Phase | Fokus | Status |
|---|---|---|
| **0** | Verifikasi riset: EID, DVN per pathway, semantik ULN, AMM, aset pasangan, paket, CreateX. Read-only, **tanpa transaksi** | Selesai 17 Nov 2026 + addendum home Robinhood; menunggu persetujuan gerbang (`proof/2026-11-17-phase0/notes.md`) |
| **1** | Fondasi repo + port landing HTML (mode `preview`) | Selesai 17 Nov 2026; menunggu persetujuan gerbang (`proof/2026-11-17-phase1/notes.md`) |
| **2** | XofN Check: baca OFT yang sudah ada di Robinhood/Base/Arbitrum + cache + kartu share | Selesai 17 Nov 2026; menunggu persetujuan gerbang (`proof/2026-11-17-phase2/notes.md`) |
| **3** | Kontrak **lokal saja**. **3a** tahap 1: Token (OFT), Curve (implementation + clone), Graduator `graduate()`, Registry. **3b** tahap 2: Remote, `expandAndLock`, composer, `retryRemote`, multi-endpoint | P55 ditutup dan P51 diimplementasikan 19 Nov 2026 (opsi 1, varian ETH curve ke pool home; dua review independen; `proof/2026-11-19-phase3-p55-p51/notes.md`). **Dibuka kembali 19 Nov 2026: pool pindah dari Uniswap v2 ke v4** (PRD P61; hook penjaga, `PoolSeeder` ditulis ulang; review independen tanpa temuan critical/high); **gerbang disetujui pengguna 19 Nov 2026** (`proof/2026-11-19-phase3-uniswap-v4/notes.md`). Opsi A deploy dorman diuji di `test/lz/GoLive.t.sol`. Angka P1/P8/P15/P16/P41/P42/P43 wajib final sebelum Phase 5 |
| **4** | Integrasi frontend aplikasi terhadap Anvil lokal / mode `simulation` (flow tahap 1 lebih dulu) | Selesai 17 Nov 2026 (mode simulation); menunggu persetujuan gerbang (`proof/2026-11-17-phase4/notes.md`). 19 Nov 2026: pembacaan pool dan panel trading pool di-port ke Uniswap v4 (bukti di `proof/2026-11-19-phase3-uniswap-v4/notes.md`). Dimulai walau P55 terbuka atas izin owner; kontrak tidak disentuh. P55 wajib tertutup sebelum Phase 5 dan sebelum deploy publik apa pun |
| **5** | Hardening & paket audit (audit eksternal wajib sebelum deploy mainnet 1b) | Belum mulai |
| **6** | **Deploy Fase 1** (guide §5–6): 1a Robinhood testnet → 1b Robinhood mainnet + rilis publik XofN Check | **1a testnet dibuka PM 19 Nov 2026**; dilanjutkan setelah gerbang Phase 3 (Uniswap v4) disetujui 19 Nov 2026 (deploy dorman saja; rencana `proof/2026-11-19-keputusan-pm/rencana-deploy-testnet-1a.md`, bukti `proof/2026-11-19-phase6-1a/`). **1b tetap FROZEN total** |
| **7** | **Deploy Fase 2** (guide §7–8): 2a omnichain testnet → 2b omnichain mainnet | **FROZEN total** |
| Backlog | lzRead / XofN Score | Pasca-MVP (Robinhood belum punya ReadLib1002) |

Gerbang tiap phase ada di `PRD.md` §8–9. Kerjakan **hanya** phase yang diminta di task. Temuan untuk phase lain dicatat di laporan sebagai rekomendasi.

## 5. Scope & larangan per phase

### 5.1 Phase 6–7 FROZEN total — larangan mutlak sampai PM memberi perintah mulai
Isi `deployguide-xofn.md` §1, §5–9 (perintah deploy, smoke test, transfer ke Safe, wiring, ekspansi mainnet) hanya **referensi**.

**Pengecualian sempit (PM, 19 Nov 2026): Fase 1a Robinhood testnet (chain 46630), deploy dorman.** Agent boleh menulis `script/0*_*.s.sol` yang menolak berjalan di luar chain 46630, menjalankan dry-run tanpa key, dan membaca chain. `deployments/robinhood-testnet.json` hanya ditulis oleh broadcast developer. Semua larangan lain di bawah tetap berlaku untuk agent, termasuk di testnet: broadcast, key/keystore/Safe, `--verify`, fungsi produk, dan `setRegistrar`. Mainnet (1b) dan Phase 7 tidak tercakup.

Selama frozen, yang dilarang:
- Membuat atau mengubah script deploy untuk jaringan publik: `script/01_DeployCore.s.sol`, `02_TransferToSafe.s.sol`, `10_DeployRemote.s.sol`, `11_WireInfra.s.sol`, atau sejenisnya. Yang boleh hanya `script/local/*` untuk Anvil.
- Mengisi `[etherscan]`, profil deploy, verifier, atau RPC testnet/mainnet untuk keperluan deploy di `foundry.toml`. RPC **fork read-only** untuk tes boleh dipakai, nilainya dibaca dari env.
- Membuat file `deployments/` untuk jaringan publik (`robinhood-testnet.json`, `robinhood.json`, `base-sepolia.json`, `arbitrum-sepolia.json`, `base.json`, `arbitrum.json`). Yang boleh hanya `deployments/local.json`.
- Membuat, mengimpor, atau meminta keystore/private key/mnemonic (`cast wallet import`, `--account`), faucet, atau Safe.
- Menjalankan `forge script --broadcast`, `--verify`, `cast send`, atau transaksi on-chain apa pun di jaringan publik.
- Menjalankan task LayerZero devtools yang **menulis** konfigurasi (mis. `lz:oapp:wire`). Task baca (`lz:oapp:config:get*`) boleh.
- Push migrasi Supabase ke project remote/produksi, mengubah env produksi, atau deploy aplikasi web.
- Mengubah copy menjadi klaim "live", atau menghapus label NOT LIVE/DEMO.
- Memanggil `launch`, `buy`, `sell`, `graduate`, `expandAndLock`, `retryRemote`, `retryCompose`, `reAck`, atau fungsi produk lain di jaringan publik (testnet maupun mainnet), **termasuk untuk smoke test**. Fungsi produk hanya boleh dipanggil di Anvil lokal.
- Membuat CA token atau me-launch token di jaringan publik. **CA dan launch adalah tugas PM**, bukan tugas agent (PRD P53).
- Menyiapkan atau menjalankan broadcast dengan `--private-key`. Broadcast ke jaringan publik **hanya dilakukan manusia** lewat `--account` (keystore) atau `--ledger`. Agent paling jauh menyiapkan dry-run tanpa key.
- Memanggil `Registry.setRegistrar` (saklar go-live, PRD P47) di luar Anvil. Itu aksi Safe atas perintah PM.

Jika sebuah task tampak membutuhkan salah satu hal di atas: **berhenti**, jelaskan kebutuhannya, dan tanyakan ke owner.

### 5.2 Batas per phase
| Phase | Boleh | Tidak boleh |
|---|---|---|
| 0 | Membaca docs LZ, `cast call` read-only, task `lz:oapp:config:get*`, menulis temuan ke `proof/`, memperbarui `[Belum]` di dokumen | Kode produksi, transaksi |
| 1 | `src/app/**` (markup, layout, metadata), `src/components/**`, `src/lib/{client,three,cn,format,mode,env,public-env,chains}`, `globals.css`, aset `public/`, setup tooling (`package.json`, ESLint, Vitest, ignore untuk `contracts/` `test/` `script/`) | `contracts/**`, `script/**`, `foundry.toml`, `config/**`, `deployments/**`, `supabase/**`, `src/app/api/**` (kecuali stub), aksi Web3 |
| 2 | `src/lib/{lz,check,supabase,tiers}`, `src/app/api/check/**`, `src/app/check/**`, `config/dvn-labels.json`, migrasi Supabase **lokal**, `tests/**` | `contracts/**`, aksi tx |
| 3 | `contracts/**`, `test/**` (forge), `script/local/**`, `foundry.toml`, `remappings.txt`, `config/tiers.json` (data), `layerzero.config.ts` (inspeksi), `deployments/local.json` | Script publik (§5.1), perubahan frontend |
| 4 | `src/lib/web3/**`, halaman aplikasi, `src/app/api/tokens/**`, `api/cron/**` | Mengubah kontrak tanpa kembali ke gerbang Phase 3 |
| 5 | Review, tes tambahan, NatSpec, dokumen audit | Fitur baru |

Dependency baru di `package.json` yang **tidak** tercantum di `ARCHITECTURE.md` §1 → minta persetujuan dulu.

## 6. Standar kode

- **Next.js 16 App Router** dengan direktori `src/` dan alias `@/*`.
  - Server Component untuk fetch awal; `'use client'` hanya bila perlu.
  - Middleware bernama `proxy.ts` di Next 16, dan **tidak boleh** dipakai untuk otorisasi.
  - Baca `node_modules/next/dist/docs/` sebelum memakai API Next.
- **TypeScript strict.**
  - Tidak ada `any` baru.
  - Tipe domain di `src/types/domain.ts` dan `src/types/enums.ts`.
  - `src/types/db.ts` dihasilkan otomatis (jangan diedit manual).
- **Env:** `process.env` hanya dibaca di `src/lib/env.ts` (server, `server-only`) dan `src/lib/public-env.ts`. Tidak boleh ada fallback `|| 'default'`. Env wajib yang hilang → error. Nama variabel mengikuti `ARCHITECTURE.md` §12 (selaras dengan guide).
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
  - alamat hanya dari `src/lib/web3/addresses.ts`, yang membaca `deployments/<network>.json`;
  - chain/EID/nama chain hanya dari `src/lib/chains`;
  - definisi tier dan label DVN hanya dari `config/tiers.json` dan `config/dvn-labels.json`;
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

- Foundry **di root repo** (`foundry.toml`: `src = "contracts"`, `test = "test"`, `script = "script"`), sesuai layout guide.
- Compiler: solc 0.8.24, `evm_version = cancun` (jangan pakai `block.blobbasefee`), optimizer 200.
- Library: OZ v5 (jangan impor file ber-pragma `^0.8.26`), paket `@layerzerolabs/*` (versi dipin; `ARCHITECTURE.md` §1.2).
- `XofNToken` (OFT sejak tahap 1):
  - tanpa `mint` publik, `pause`, `setFee`, `blacklist`, `upgrade`;
  - `renounceOwnership()` **menolkan delegate lebih dulu**.
- `XofNCurve`: implementation + clone per launch (OZ `Clones`).
- `XofNGraduator`:
  - tidak upgradeable;
  - fungsi yang mengubah state token hanya jalur launch, `graduate()`, `expandAndLock()`, dan `retryRemote()`;
  - sebagai OApp ia juga punya `lzReceive` (ack dari Remote) dan fungsi owner bawaan OApp (peer/delegate pathway infrastruktur, `PRD.md` P38), tetapi tidak ada fungsi yang bisa mengubah tier atau konfigurasi token di luar jalur di atas;
  - alamat DVN dikunci di constructor dari `config/tiers.json`;
  - tidak bisa mengubah tier setelah launch;
  - **tidak me-renounce di `graduate()`**.
- Konfigurasi ULN dan library selalu **eksplisit**:
  - nilai 0 berarti default, jadi factory menolak field 0;
  - array DVN terurut naik dan unik.
- `lzCompose` hanya menerima panggilan dari endpoint, untuk token terdaftar. Pool dibuat dan diisi dalam satu panggilan.
- **Pool = Uniswap v4** (PRD P61): ETH native / token, fee 0,30%, satu posisi full-range, hook `XofNPoolGuard`.
  - Paket `@uniswap/v4-core` dan `@uniswap/v4-periphery` dipin; yang boleh diimpor kontrak hanya file ber-pragma longgar (bukan `PoolManager.sol`/`PositionManager.sol`, yang ber-pragma 0.8.26).
  - `PoolSeeder` tetap library terhubung; Graduator dan Remote tidak boleh mendapat fungsi pengubah state baru (tidak ada `unlockCallback`).
  - Hook hanya ber-flag `beforeInitialize`, tanpa state, tanpa owner; alamatnya divalidasi di constructor.
  - Tes memakai PoolManager dan PositionManager asli dari artefak paket (`test/helpers/V4Env.sol`), bukan tiruan.
- Semua **tes wajib** di `PRD.md` §9.2 harus ada dan lulus. Jalankan `forge test --profile ci` sebelum menyatakan Phase 3/5 selesai.
- Fork test hanya membaca; tidak ada broadcast.

## 8. Panduan UI/UX, animasi, 3D

- Ikuti `DESIGN_SYSTEM.md`: dark navy + mint, glass panel, mono uppercase untuk data, TierBadge yang selalu bisa diklik dan selalu bersama status (Bonding / Graduated · awaiting expansion / Expanding / Locked / Changed).
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
- Copy yang menyebut Base sebagai home di HTML diganti ke Robinhood (D15). Panel review "coin-lab" dari HTML **tidak** di-port (D1).

## 9. Batasan Web3 & keamanan

- **Jangan membaca, menampilkan, menyalin, atau commit isi `.env*`.** Cantumkan nama variabel saja.
- **Jangan mengasumsikan kontrak XofN sudah ter-deploy.** Semua halaman berjalan di mode `preview` sampai manifest yang sah ada.
- Nama chain di copy diambil dari registry chain. Data yang masih `[Belum]` tidak boleh ditebak.
- Jangan memindahkan otorisasi ke klien atau ke `proxy.ts`. Klien hanya memilih tombol mana yang tampil.
- Tidak ada deploy, migrasi remote, `forge script --broadcast`, atau transaksi on-chain (lihat juga §5.1).
- **Git:**
  - tidak ada operasi destruktif (`reset --hard`, force push, hapus branch);
  - commit/push hanya bila diminta;
  - bila di `main`, buat branch dulu.
- **Playbook pre-CA** (`ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md`) §1.1–1.3 berlaku penuh untuk agent: larangan, kewajiban, dan format laporan gate §1.3 di setiap akhir phase. Bila playbook bertentangan dengan fakta kontrak XofN (mis. factory reservasi per token), fakta yang menang dan konfliknya dicatat untuk PM.
- **Status alamat: Reserved ≠ Deployed (dorman) ≠ Live.** Di XofN, Deployed (dorman) berarti kontrak sudah ada tetapi `registrar` Registry masih kosong, sehingga `launch()` revert. Live baru tercapai setelah Safe memanggil `setRegistrar`. Aplikasi tidak boleh menyalakan aksi launch untuk alamat yang belum Live (PRD P52).
- **Lingkungan dev:** DNS Telkomsel memblokir `*.robinhood.com`. Pakai VPN atau DNS lain sebelum menguji RPC Robinhood. RPC publik Robinhood dibatasi rate.

## 10. Pemeriksaan & pengujian

Sebelum melaporkan selesai:
1. **Web:** `npm run lint` (`eslint`, **bukan** `next lint` yang sudah dihapus di Next 16), `npm run typecheck` (`tsc --noEmit`), `npm run test` (Vitest), `npm run build`. Semuanya harus lulus.
2. **Kontrak** (bila disentuh): `forge build && forge test`, termasuk `--match-contract Invariant` (Phase 3), dan `forge test --profile ci` (Phase 5). Jalankan dari root repo.
3. **Uji manual** `npm run dev` di mode yang relevan (`preview` / `simulation`), mengikuti flow terkait di `USER_FLOWS.md`.
4. Cek lebar **390, 768, 1280, 1680px**, reduced motion, dan navigasi bolak-balik antar halaman (memastikan tidak ada kebocoran konteks WebGL).
5. Pastikan tidak ada perubahan di area terlarang: `git status` / `git diff --stat`.
6. Pastikan copy mematuhi aturan klaim (`PRD.md` §4.3, termasuk klaim per tahap) dan data demo berlabel.

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

- Jangan mengubah aturan protokol (supply, tier, lifecycle dua tahap, urutan graduation/ekspansi, composer, `verify`, aturan klaim) karena alasan visual atau kemudahan.
- Jangan menambah fitur yang tidak ada di brief/guide tanpa persetujuan. Contoh: UI admin, token $XOFN, lzRead, chain tambahan (termasuk Solana), fitur AI, verifikasi creator.
- Jangan melakukan refactor besar di luar kebutuhan task.
- Jangan menghapus file atau fitur tanpa keputusan.
- Jangan mengerjakan apa pun dari Phase 6–7 (§5.1).
- Jika ragu apakah sesuatu masuk scope: anggap **tidak**, lalu tanyakan.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
