# ARCHITECTURE.md — XofN

> **Tujuan dokumen:** menjelaskan *bagaimana* XofN dibangun: stack, struktur repo, kontrak, lapisan LayerZero, server/indexer, database, Web3 client, frontend, env, batasan, dan risiko teknis. *Apa* yang dibangun ada di `PRD.md`.
>
> **Sumber kebenaran:**
> - Perilaku protokol → `brief-xofn.md`.
> - Visual → `xofn-coinfall-v8-galaxy.html`.
> - Pilihan stack diturunkan dari tiga proyek sebelumnya: **Cognita**, **Assize**, dan **Fademan**. Asal setiap pilihan ditulis di §1.
>
> **Label:**
> - **[Brief]** — dari brief
> - **[Desain]** — dari HTML
> - **[Pola: X]** — mengikuti pola proyek X
> - **[Usulan]** — keputusan baru dokumen ini
> - **[Belum]** — harus diverifikasi (umumnya di Phase 0)
>
> **Dokumen terkait:** `CLAUDE.md`, `PRD.md`, `DESIGN_SYSTEM.md`, `USER_FLOWS.md`.
>
> **Status:** repo belum ada kode (17 Nov 2026). Struktur di bawah adalah **target**.

---

## 1. Stack

Semua versi adalah baseline minimum. Saat inisialisasi, **pin versi exact** di `package.json` (seperti `next` dan `eslint-config-next` di Cognita/Assize) dan catat di §15 bila ada yang berbeda.

### 1.1 Aplikasi web
| Lapisan | Pilihan | Versi baseline | Asal / alasan |
|---|---|---|---|
| Framework | Next.js App Router, **direktori `src/`**, alias `@/*` | 16.3.x | [Pola: Assize/Cognita 16.3.6] + [Pola: Fademan `src/`] |
| UI runtime | React / react-dom | 19.2.x | [Pola: semua] |
| Bahasa | TypeScript strict | ^5.7 | [Pola: semua] |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`), token di `@theme` dalam `src/app/globals.css`; **tanpa** `tailwind.config` | ^4.3 | [Pola: semua] |
| Class util | `clsx` + `cn()` (`src/lib/cn.ts`) | ^2.1 | [Pola: Cognita/Assize] |
| Animasi scroll/timeline | **GSAP + ScrollTrigger** | ^3.13 | [Desain] HTML memakai GSAP 3.13 + ScrollTrigger; [Pola: Fademan] wrapper `src/lib/client/gsap.ts` |
| Smooth scroll | **Lenis** (`lenis`) | ^1.1 | [Desain] HTML memakai Lenis 1.1.13 |
| 3D | **three.js vanilla** (npm, addon dari `three/examples/jsm/*`); **bukan** R3F/drei, **bukan** CDN | ^0.184 | [Pola: Cognita/Assize vanilla]. Kode HTML imperatif (r170), jadi port 1:1 lebih aman |
| Wallet | **Reown AppKit** + `@reown/appkit-adapter-wagmi` | ^1.8.24 | [Pola: Cognita/Assize]. XofN butuh multi-network + switch chain |
| EVM client | `wagmi` 3 + `@wagmi/core` + `viem` 2 + `@tanstack/react-query` 5 | ^3.7 / ^2.56 / ^5.104 | [Pola: semua] |
| DB / cache | Supabase: `@supabase/supabase-js`, `@supabase/ssr`, CLI `supabase` (dev) | ^2.106 / ^0.12 / ^2.118 | [Pola: Cognita/Assize/Fademan] |
| Server guard | `server-only` | latest | [Pola: Fademan] |
| Lint | ESLint 9 flat config + `eslint-config-next` (versi = next) | ^9.17 | [Pola: semua]. Rule tambahan dari Fademan (§12) |
| Unit test | **Vitest** (environment node, `tests/**/*.test.ts`) | latest stable | [Pola: Fademan] |
| Script TS | `tsx` | ^4.23 | [Pola: Cognita/Assize] |
| Font | `next/font/google` (display + mono, D3) | — | [Pola: Assize] |

Tidak dipakai:
- `motion` / `framer-motion`: cukup satu library animasi, yaitu GSAP.
- R3F / drei.
- RainbowKit.
- AI SDK apa pun.
- `zod`: validasi memakai guard tulisan tangan + `viem.isAddress`. [Usulan] Tambahan dependency butuh persetujuan.

### 1.2 Kontrak
| Lapisan | Pilihan | Versi baseline | Asal / alasan |
|---|---|---|---|
| Toolchain | **Foundry** (forge/anvil/cast), dipin dengan `foundryup --install <versi>` | v1.8.x | [Pola: Cognita/Assize] |
| Solidity | `solc` **0.8.24**, `evm_version = cancun`, optimizer 200 runs, `via_ir = false` | 0.8.24 | [Pola: semua]. [Belum] cek kompatibilitas dengan paket LayerZero, termasuk apakah Robinhood mendukung cancun (Cognita sudah deploy cancun di 4663) |
| Library | OpenZeppelin Contracts v5 | 5.x | [Pola: semua]; dibutuhkan oleh OFT V2 |
| LayerZero | `@layerzerolabs/oft-evm`, `@layerzerolabs/oapp-evm`, `@layerzerolabs/lz-evm-protocol-v2`, `@layerzerolabs/lz-evm-messagelib-v2`, `@layerzerolabs/test-devtools-evm-foundry` (TestHelperOz5) | [Belum] | [Usulan]. Diinstal lewat npm di `contracts/package.json`, lalu di-remap dari `node_modules` |
| Alamat seragam | **CreateX** (CREATE3) | — | [Brief]. [Belum] cek CreateX tersedia di Robinhood |
| Test | forge unit + fuzz + invariant + fork **read-only** + multi-endpoint | — | [Pola: Cognita/Assize] + [Brief] |

---

## 2. Struktur repo (target)

```
fullstack-xofn/
├─ CLAUDE.md  PRD.md  ARCHITECTURE.md  DESIGN_SYSTEM.md  USER_FLOWS.md
├─ brief-xofn.md                       # salinan brief (sumber kebenaran protokol)
├─ xofn-coinfall-v8-galaxy.html        # baseline visual (konsep V8)
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx  globals.css  icon.svg  opengraph-image.tsx
│  │  ├─ page.tsx                      # "/" landing + discovery
│  │  ├─ launch/page.tsx
│  │  ├─ t/[address]/page.tsx
│  │  ├─ check/page.tsx
│  │  ├─ check/[chain]/[address]/page.tsx
│  │  ├─ check/[chain]/[address]/opengraph-image.tsx   # kartu share
│  │  ├─ bridge/page.tsx
│  │  ├─ contracts/page.tsx  proof/page.tsx
│  │  └─ api/
│  │     ├─ check/[chain]/[address]/route.ts
│  │     ├─ tokens/route.ts  tokens/[address]/route.ts
│  │     └─ cron/{recheck,index-events}/route.ts
│  ├─ components/
│  │  ├─ ui/            # Button, Tag, StatusPill, Panel, Modal, Drawer, Toast, Field, ProgressBar, EmptyState
│  │  ├─ layout/        # NoticeBar, Nav (+ mobile), Footer, SideIndex, ScrollProgress
│  │  ├─ landing/       # satu file per section landing (DESIGN_SYSTEM §6)
│  │  ├─ three/         # HeroCoinfall, ArchStage, GalaxyLayer (client, dynamic)
│  │  ├─ badge/         # TierBadge, DvnList
│  │  ├─ check/  token/  launch/  graduation/  bridge/  proof/
│  │  └─ wallet/        # ConnectButton (+ *Active), NetworkGuard
│  ├─ lib/
│  │  ├─ env.ts  public-env.ts           # SATU-SATUNYA pembaca process.env
│  │  ├─ mode.ts                         # preview | simulation | live
│  │  ├─ cn.ts  escape-html.ts  format.ts
│  │  ├─ chains/       # registry chain + EID (§4)
│  │  ├─ lz/           # ABI endpoint/OFT, decode ULN, label, OFT API client (§7)
│  │  ├─ check/        # orkestrasi XofN Check (server-only)
│  │  ├─ web3/         # config AppKit, addresses, aksi per file (§10)
│  │  ├─ supabase/     # server.ts, client.ts, public.ts
│  │  ├─ three/        # factory murni: coin, track, gate, stage, sky (§11.3)
│  │  └─ client/       # gsap.ts, lenis.ts, use-reduced-motion.ts
│  └─ types/  domain.ts  enums.ts  db.ts (generated)
├─ tests/                              # vitest: lib/lz, lib/check, format, mode
├─ supabase/migrations/0001_*.sql …
├─ contracts/
│  ├─ foundry.toml  remappings.txt  package.json
│  ├─ src/  XofNToken.sol  XofNCurve.sol  XofNGraduator.sol  XofNRemote.sol  XofNRegistry.sol
│  │       interfaces/  libraries/ (TierLib, UlnConfigLib)
│  ├─ test/ unit/  fuzz/  invariant/  lz/ (multi-endpoint)  fork/ (read-only)  mocks/
│  └─ script/ local/ (Anvil saja)       # script jaringan publik: FROZEN (Phase 6–7)
├─ deployments/                        # <network>.json — hanya local.json sampai Phase 6
└─ proof/YYYY-MM-DD-<milestone>/notes.md
```

Konvensi penamaan:
- Komponen dan file ditulis kebab-case (`tier-badge.tsx`), dengan named export PascalCase [Pola: Cognita/Assize].
- Hook bernama `use-*.ts`.
- Kolom DB snake_case.
- Alamat EVM di-lowercase di setiap batas input [Pola: Fademan].

---

## 3. Arsitektur tingkat tinggi

```
                ┌──────────────────────────── Browser ────────────────────────────┐
                │ Next.js (RSC + client islands)                                   │
                │  • landing 3D (three) + GSAP/Lenis                                │
                │  • aksi: launch / buy-sell / graduate / retry / bridge            │
                │    disusun di browser → ditandatangani di wallet (AppKit/wagmi)  │
                └───────┬───────────────────────────────┬──────────────────────────┘
                        │ tx (user-signed)               │ fetch (read)
         ┌──────────────▼───────────────┐   ┌───────────▼──────────────────────────┐
         │ Chain: Base (home)           │   │ Next.js Route Handlers (server-only) │
         │  XofNCurve · XofNGraduator   │   │  /api/check  /api/tokens  /api/cron  │
         │  XofNRegistry · XofNToken    │   │   • viem public client per chain     │
         │        │ LayerZero V2        │   │   • LayerZero OFT API (discovery)    │
         │        ▼ (DVN + executor)    │   │   • TANPA private key                │
         │ Arbitrum / Robinhood         │◄──┤ read getConfig / delegates / owner   │
         │  XofNRemote · XofNToken      │   └───────────┬──────────────────────────┘
         │  XofNRegistry (per chain)    │               │ upsert (service role)
         └──────────────────────────────┘   ┌───────────▼──────────────────────────┐
                                            │ Supabase: cache Check, index event,  │
                                            │ status graduation, label DVN          │
                                            │ pg_cron → /api/cron/* (CRON_SECRET)   │
                                            └──────────────────────────────────────┘
```

Prinsip [Brief]:
1. **Server tidak pernah memegang key** untuk aksi pengguna maupun protokol. Server hanya membaca dan mengindeks.
2. Status "Locked" di UI selalu berasal dari pembacaan on-chain (`verify` / `verifyEid`), tidak dari kolom DB yang diisi manual. DB hanya menyimpan **cache** hasil baca beserta `checked_at`.
3. Otorisasi tidak pernah dilakukan di `proxy.ts` [Pola: Cognita, CVE-2025-29927]. XofN kemungkinan tidak butuh `proxy.ts` sama sekali.

---

## 4. Registry chain (`src/lib/chains`)

Satu-satunya sumber chain ID, EID, nama, RPC, explorer, dan peran. **Jangan menulis nama chain atau EID langsung di komponen.**

| Chain | Chain ID | EID LayerZero | Peran | Status data |
|---|---|---|---|---|
| Base | 8453 | 30184 | Home: curve, pool pertama, registry | [Belum] verifikasi EID ke docs LZ |
| Arbitrum One | 42161 | 30110 | Ekspansi | [Belum] verifikasi EID |
| Robinhood Chain | 4663 | **[Belum]** | Ekspansi | Ambil dari docs LZ (deployments/chains/robinhood) di Phase 0 |
| Base Sepolia | 84532 | 40245 | Testnet (Phase 6, FROZEN) | [Belum] |
| Arbitrum Sepolia | 421614 | 40231 | Testnet (Phase 6, FROZEN) | [Belum] |
| Robinhood testnet | 46630 | **[Belum]** | Testnet (Phase 6, FROZEN) | [Belum] |
| Anvil lokal | 31337 (+ instance tambahan, lihat §15) | EID mock dari TestHelperOz5 | Dev | — |

- Bentuk data: `ChainInfo { key: 'base'|'arbitrum'|'robinhood'; chainId; eid; name; explorer; lzScan; rpcEnvKey; role }`.
- Slug URL `/check/[chain]/...` memakai `key` (`base`, `arbitrum`, `robinhood`).
- Jaringan aktif dipilih dari `NEXT_PUBLIC_XOFN_NETWORK` (`local` | `testnet` | `mainnet`) [Pola: Cognita `activeChain`]. Nilai tidak dikenal → **throw**, bukan fallback diam-diam [Pola: Fademan].
- Untuk chain di luar viem/chains, definisi dibuat lewat `defineChain` dari `@reown/appkit/networks` [Pola: Assize].
- Catatan lingkungan dev: DNS Telkomsel memblokir `*.robinhood.com`. Pakai VPN atau DNS lain sebelum menguji RPC Robinhood.

---

## 5. Kontrak

### 5.1 Daftar & peran [Brief]
| Kontrak | Chain | Peran | Catatan |
|---|---|---|---|
| `XofNToken` | Semua | OFT, 999M di-mint ke curve di Base, shared decimals 6 | Tanpa mint publik/pause/fee/blacklist/upgrade. `renounceOwnership()` menolkan delegate dulu |
| `XofNCurve` | Base | Bonding curve dengan parameter tetap per launch | Parameter: P8, P16, P17 |
| `XofNGraduator` | Base | Owner + delegate sementara token selama bonding; state machine graduation; resep immutable | Tidak upgradeable. Tidak bisa mengubah tier setelah launch. Audit paling ketat |
| `XofNRemote` | Arbitrum, Robinhood | OApp + composer: deploy token (CREATE3, salt sama), terima `lzCompose`, buat pool, set config, kunci | Alamat sama di semua chain lewat CreateX |
| `XofNRegistry` | [Usulan] **setiap chain** | Simpan tier per token + hash konfigurasi yang diharapkan per EID; `verify(token)`, `verifyEid(token, eid)` | Lihat P13 |

Launch dilakukan lewat factory (bisa berupa fungsi di Graduator, atau kontrak `XofNFactory` [Usulan]) dalam satu transaksi di Base:
- deploy token dengan supply penuh ke curve;
- set owner dan delegate = Graduator;
- daftarkan tier di Registry.

Factory **menolak**:
- tier dengan kurang dari 2 DVN wajib;
- DVN di luar daftar putih;
- konfigurasi 1-of-1.

### 5.2 Tier & konfigurasi ULN
- Definisi tier per pathway disimpan sebagai data immutable saat launch. Isinya:
  - `sendLib` / `receiveLib` eksplisit, **bukan default**;
  - `UlnConfig { confirmations, requiredDVNCount, optionalDVNCount, optionalDVNThreshold, requiredDVNs[], optionalDVNs[] }`;
  - `ExecutorConfig { maxMessageSize, executor }`;
  - enforced options untuk `lzReceive` dan `lzCompose`.
- **Array DVN wajib terurut naik dan unik.** ULN memvalidasi ini; urutan yang salah membuat transaksi revert.
- Nilai 0 bisa berarti "pakai default" (P5). Karena itu konfigurasi **selalu diisi eksplisit** dan tidak pernah bergantung pada default.
- `tierHash(eid) = keccak256(abi.encode(sendLib, receiveLib, ulnSend, ulnReceive, executorCfg))` disimpan di Registry untuk perbandingan [Usulan].
- **Daftar putih DVN dan label operator** dimiliki Safe 2-of-3 [Brief]. Perubahan daftar putih tidak memengaruhi token yang sudah terkunci, dan harus diumumkan sebelum dieksekusi.

### 5.3 State machine graduation [Usulan, berdasarkan urutan wajib Brief]
```
BONDING ──graduate()──► BASE_POOL_CREATED ──► per EID (independen, bisa di-retry):
   NONE → DEPLOY_SENT → DEPLOYED(ack) → LIQ_SENT → POOL_CREATED(ack via compose) → CONFIGURED(ack) → REMOTE_LOCKED(ack)
                                                  ▲ retryRemote(eid): ulangi langkah terakhir yang gagal dengan parameter identik
semua EID REMOTE_LOCKED ──► konfigurasi pathway sisi Base + verify pra-kunci ──► setDelegate(0) + renounceOwnership() di Base ──► Registry: LOCKED
```
- Konfigurasi sisi remote (library, ULN, executor, enforced options, peer) harus dipanggil oleh owner/delegate token di chain itu, yaitu `XofNRemote`. Karena itu Graduator mengirim **pesan instruksi** ke Remote, dan Remote membalas dengan **ack**.
- Pesan infrastruktur Graduator↔Remote memakai pathway yang di-wire dengan tier Fortress lalu dikunci [Brief, urutan deploy langkah 2].
- Base dikunci **terakhir**, karena peer dan konfigurasi sisi Base butuh owner sampai semua remote selesai.
- `graduate()` hanya bisa dipanggil sekali, dan gagal sebelum ambang tercapai. Pemanggil membayar fee LZ dan menerima insentif tetap (P15).
- `retryRemote(eid)` hanya mengulang langkah yang sama dengan parameter yang sama. Pembayar fee: P14.

### 5.4 Composer `XofNRemote.lzCompose` [Brief]
- `require(msg.sender == endpoint)` dan `from` == token XofN yang terdaftar.
- Isi `composeMsg`: rasio, alamat AMM, dan penerima LP. Pool **dibuat dan diisi dalam satu panggilan**.
- Sumber aset pasangan: P2.
- `retryCompose`: desainnya diuji di Phase 3. Perilaku saat compose kehabisan gas atau revert wajib terdokumentasi (P3).

### 5.5 `verify` [Brief + Usulan P13]
- `verifyEid(token, eid)` (lokal di chain mana pun) memeriksa:
  - `owner()==0` dan `endpoint.delegates(token)==0`;
  - `getSendLibrary` / `getReceiveLibrary` sama dengan library yang di-pin, **bukan** default;
  - hash `getConfig` ULN + executor sama dengan `tierHash(eid)`.
- `verify(token)` mengembalikan `(bool locked, uint8 tier, uint32[] eids)` = AND dari semua EID terdaftar di chain itu.
- **Status global** di UI = `verify` true di Registry **setiap** chain token, dibaca indexer lewat RPC masing-masing chain. Sebelum semuanya true, status tetap Bonding/Graduating.

### 5.6 Urutan deploy — **referensi [Brief], dieksekusi di Phase 6–7 (FROZEN)**
1. Deploy `XofNGraduator`, `XofNRemote`, `XofNRegistry` dengan CREATE3/CreateX.
2. Wire peer antar Remote/Graduator dengan tier Fortress untuk pesan infrastruktur, lalu kunci.
3. Siapkan indexer untuk XofN Check (RPC per chain, cache).
4. Verifikasi semua kontrak di explorer, lalu tulis alamat ke `deployments/<network>.json`.
5. Owner kontrak infrastruktur = Safe multisig 2-of-3.

Sampai ada brief tambahan, **hanya** `contracts/script/local/*` (Anvil) yang boleh dibuat atau dijalankan.

---

## 6. Pola tes Foundry

| Jenis | Lokasi | Isi |
|---|---|---|
| Unit | `test/unit/` | Token (override renounce, tanpa mint), Curve (harga, ambang, sekali graduate), Factory (tolak <2 DVN, DVN non-whitelist, 1-of-1), Registry (`verify` false untuk owner/delegate/config salah) |
| Fuzz | `test/fuzz/` | Jumlah buy/sell, rounding shared decimals (dust < 0,000001) |
| Invariant | `test/invariant/` | Handler + total supply semua chain = 999M; tidak ada mint di luar `_credit` [Pola: Cognita Handler/Accounting] |
| Multi-endpoint LZ | `test/lz/` | `TestHelperOz5`: 3 endpoint mock (Base/Arb/Robinhood), graduation penuh, kegagalan disengaja (gas/DVN) → `retryRemote`, compose dari non-endpoint ditolak, front-run pembuatan pool |
| Fork (read-only) | `test/fork/` | Baca `getConfig` OFT nyata untuk memvalidasi decoder (pembanding P1 brief). **Tanpa broadcast** |
| Mock | `test/mocks/` | AMM mock, DVN mock gagal, token aneh |

`foundry.toml` [Pola: Cognita/Assize]:
- `[invariant]` runs 256, depth 64; profil `ci` fuzz 10k, invariant 1000 / depth 128;
- `[fmt] line_length = 100`;
- `gas_reports = ["*"]`.

`rpc_endpoints` hanya untuk **fork read-only** yang dibaca dari env. **Tidak ada `[etherscan]` dan tidak ada profil deploy publik sampai Phase 6.** Dependency dipin lewat `contracts/package.json` (paket LZ) dan `script/install-deps.sh` untuk OZ / forge-std pada tag + SHA [Pola: Assize].

---

## 7. Lapisan LayerZero aplikasi (`src/lib/lz`)

| Modul | Isi |
|---|---|
| `abi.ts` | Subset ABI EndpointV2: `getConfig(oapp, lib, eid, configType)`, `getSendLibrary(sender, eid)`, `getReceiveLibrary(receiver, eid)` → `(lib, isDefault)`, `isDefaultSendLibrary`, `delegates(oapp)`. OFT/OApp: `owner()`, `endpoint()`, `peers(eid)`, `token()`, `sharedDecimals()`, `oftVersion()`, `quoteSend`, `send` |
| `config-types.ts` | `CONFIG_TYPE_EXECUTOR = 1`, `CONFIG_TYPE_ULN = 2` [Belum] konfirmasi |
| `decode.ts` | Decode `UlnConfig` dan `ExecutorConfig` dari bytes `getConfig` (fungsi murni, dites Vitest) |
| `label.ts` | Algoritma label pathway (di bawah), fungsi murni, dites Vitest |
| `dvn-labels.ts` | Peta alamat DVN → nama operator per chain. Sumbernya halaman DVN addresses LZ, disimpan juga di tabel `dvn_labels` dengan `source_url` dan `verified_at` |
| `oft-api.ts` | Klien OFT API LayerZero untuk menemukan deployment lain sebuah OFT. [Belum] endpoint, auth, dan rate limit |
| `scan.ts` | Builder URL LayerZero Scan untuk GUID pesan |

**Algoritma label per pathway** [Brief + Usulan]. Arah *send* dan *receive* dicek terpisah, dan label pathway mengikuti arah yang **terburuk**:
- `effective = requiredDVNCount + optionalDVNThreshold`.
- `effective ≤ 1` → **"1-of-1"** (merah).
- `effective ≥ 2` → **"2+"** (kuning).
- `effective ≥ 2` **dan** owner=0 **dan** delegate=0 **dan** library bukan default → **"2+ & locked"** (hijau).
- Pathway tanpa peer → tidak ditampilkan. DVN "dead"/blocked → label khusus "blocked" [Belum] identifikasi alamat dead DVN.

Catatan baca [Belum]:
- Apakah `getConfig` mengembalikan konfigurasi efektif (gabungan dengan default) atau hanya konfigurasi app? Check perlu menampilkan **keduanya**: nilai efektif, dan apakah aplikasi masih bergantung pada default (default bisa berubah [Brief]).
- OFT tidak menyediakan daftar EID. Daftar EID diambil dari OFT API, atau dengan memindai `peers(eid)` untuk EID di registry chain.

---

## 8. Route Handlers (`src/app/api`)

| Route | Method | Fungsi | Auth |
|---|---|---|---|
| `/api/check/[chain]/[address]` | GET | Validasi alamat → cache Supabase (TTL, P20) → bila basi, baca RPC + OFT API → simpan → kembalikan hasil + `checked_at` | Publik, rate-limited |
| `/api/tokens` | GET | Daftar token XofN (filter `status`), dari index | Publik |
| `/api/tokens/[address]` | GET | Detail token: status, tier, langkah graduation per EID, supply per chain | Publik |
| `/api/cron/recheck` | POST | Re-check berkala token XofN dan Check populer; deteksi **Changed** | `Authorization: Bearer CRON_SECRET` |
| `/api/cron/index-events` | POST | Indeks event Curve/Graduator/Registry per chain (cursor blok) | `CRON_SECRET` |

Aturan:
- Format error seragam `{ error: { code, message } }` [Pola: Fademan].
- Route membaca env hanya lewat `src/lib/env.ts`.
- Semua modul server diberi `import 'server-only'`.
- **Tidak ada route yang menandatangani transaksi.**
- Rate limit sederhana per IP [Usulan]: tabel `rate_limits` atau header cache CDN. Dependency baru butuh persetujuan.
- Kegagalan RPC → `502` dengan pesan jujur. Hasil parsial ditandai per pathway (`status: 'unread'`), **tidak pernah** diisi tebakan.

---

## 9. Database (Supabase)

Migrasi bernomor `supabase/migrations/0001_*.sql` [Pola: Cognita]. Tipe dihasilkan ke `src/types/db.ts` lewat `supabase gen types` dan tidak diedit manual.

| Tabel | Kolom utama | Catatan |
|---|---|---|
| `tokens` | `address` (pk, lowercase), `home_chain_id`, `name`, `ticker`, `image_path`, `tier` (`standard`/`fortress`), `status` (`bonding`/`graduating`/`locked`/`changed`), `eids int[]`, `created_tx`, `created_at` | Diisi indexer dari event launch |
| `curve_trades` | `token`, `tx_hash`, `side`, `amount_token`, `amount_eth`, `price`, `block_time` | Untuk chart & progres |
| `graduation_steps` | `token`, `eid`, `step`, `status` (`pending`/`ok`/`failed`), `tx_hash`, `lz_guid`, `updated_at` | Sumber UI progres per chain |
| `oft_checks` | `id`, `chain_id`, `address`, `checked_at`, `owner`, `delegate`, `overall_label`, `is_xofn`, `verify_result jsonb`, `raw jsonb` | Cache XofN Check |
| `oft_pathways` | `check_id`, `local_eid`, `remote_eid`, `direction`, `send_lib`, `receive_lib`, `uses_default_lib`, `confirmations`, `required_dvns text[]`, `optional_dvns text[]`, `optional_threshold`, `label`, `status` | Satu baris per pathway per arah |
| `dvn_labels` | `chain_id`, `address`, `operator`, `source_url`, `verified_at` | Daftar label operator |
| `chain_cursors` | `chain_id`, `contract`, `last_block` | Indexer |

- **RLS:** `select` untuk anon; `insert`/`update` hanya service role [Pola: Fademan].
- **Penjadwalan:** pg_cron + pg_net memanggil `/api/cron/*` dengan `CRON_SECRET` [Pola: Cognita/Fademan].
- **Dev:** `supabase start` (lokal). Push migrasi ke project remote **hanya dengan izin owner**.

---

## 10. Web3 client (`src/lib/web3`)

### 10.1 Modul
| File | Isi |
|---|---|
| `config.ts` | `WagmiAdapter` (cookieStorage, `ssr: true`) dengan **semua network aktif** (Base, Arbitrum, Robinhood untuk mode yang dipilih). `projectId` dari public env. `isWeb3Configured = !!projectId`. Tanpa `'use client'` karena diimpor juga oleh server [Pola: Assize] |
| `addresses.ts` | Membaca `deployments/<network>.json` (§10.3); helper `lc()`; **satu-satunya** tempat alamat kontrak |
| `public-client.ts` | viem public client per chain (server & client) |
| `launch.ts` | Simulasi + tulis tx launch di Base |
| `curve-trade.ts` | Quote + buy/sell di curve, dengan slippage |
| `graduate.ts` | Quote fee LZ total + `graduate()` |
| `retry-remote.ts` | Quote + `retryRemote(eid)` |
| `bridge-send.ts` | `quoteSend` **tepat sebelum** `send`; hitung dust (`amount mod 10^(decimals-6)`) |
| `verify.ts` | Baca `verify`/`verifyEid` di setiap chain |
| `use-network-guard.ts` | Deteksi network salah, lalu tawarkan switch lewat AppKit |

### 10.2 Pola komponen wallet [Pola: Cognita/Assize]
- Hook AppKit (`useAppKit`, `useAppKitAccount`, `useAppKitNetwork`) **hanya** dipanggil di komponen `*Active` yang dirender saat `isWeb3Configured`.
- Selain itu, tampil fallback non-aktif: tombol "Connect Wallet" yang membuka modal penjelasan, seperti di HTML.
- Provider (`components/wallet/web3-provider.tsx`) melewati `createAppKit` bila `projectId` kosong.

### 10.3 Manifest deployment
- Format `deployments/<network>.json`: `{ network, chains: { [key]: { chainId, eid, contracts: { XofNGraduator?, XofNRemote?, XofNRegistry?, ... }, verifiedAt? } }, createdAt }`.
- Saat ini hanya **`local.json`** (Anvil) yang boleh dibuat. `testnet.json` dan `mainnet.json` dibuat di Phase 6–7 (**FROZEN**).
- **Jangan pernah** menyalin alamat dari proyek lain. Kasus Assize: `addresses.ts`-nya masih berisi kontrak Cognita.

### 10.4 Mode aplikasi (`src/lib/mode.ts`)
| Mode | Kapan | Perilaku |
|---|---|---|
| `preview` | Default. Manifest untuk network aktif tidak ada | Seperti HTML konsep: data demo berlabel `DEMO`/`FICTIONAL`/`*`, tombol aksi membuka modal "preview only", tidak ada tx. **XofN Check tetap live** (hanya membaca OFT yang ada) |
| `simulation` | `NEXT_PUBLIC_XOFN_NETWORK=local` + `deployments/local.json` | Terhubung ke Anvil lokal (Phase 3–4) |
| `live` | Manifest testnet/mainnet ada dan terverifikasi | Phase 6–7 (**FROZEN**) |

Mode ditentukan di server dan diteruskan ke klien. Klien hanya memilih tombol mana yang tampil; validasi tetap terjadi di kontrak.

---

## 11. Frontend

### 11.1 Rendering
- Halaman adalah **Server Component** untuk fetch awal (Supabase public client / RPC). Interaksi berada di client island kecil [Pola: Assize].
- Landing `/` = Server Component yang menyusun section (`components/landing/*`). Section interaktif (filter token, Check demo, tier selector, graduation steps, launch form demo, bridge demo) adalah client component.
- Gambar share Check: `src/app/check/[chain]/[address]/opengraph-image.tsx` (`ImageResponse`), memakai data cache. Kartunya menampilkan "checked at" dan tidak memuat klaim yang dilarang (`PRD.md` §4.3).

### 11.2 Animasi
- `src/lib/client/gsap.ts`:
  - register ScrollTrigger sekali;
  - helper `useGsap(scope, fn)` berbasis `gsap.context()` + `revert()` saat unmount;
  - tidak aktif saat `prefers-reduced-motion` [Pola: Fademan].
- `src/lib/client/lenis.ts`:
  - satu instance di provider client pada `layout.tsx`;
  - `lenis.on('scroll', ScrollTrigger.update)` dan `gsap.ticker.add`;
  - berhenti saat modal/drawer terbuka;
  - nonaktif pada reduced motion;
  - anchor link memakai `lenis.scrollTo(offset -96)` [Desain].

### 11.3 3D (three vanilla)
- **Factory murni** di `src/lib/three/` (tanpa React), di-port dari HTML:
  - `coin.ts` (makeCoin + clip plane, glyph canvas);
  - `track.ts` (makeTrack, ribbon, instanced tiles);
  - `gate.ts`;
  - `stage.ts` (renderer + EffectComposer + UnrealBloom + OutputPass + RoomEnvironment PMREM);
  - `sky.ts`, `dust.ts`, `glyphs.ts`.
- Komponen client di `components/three/` dimuat dengan `next/dynamic({ ssr: false })`:
  - `hero-coinfall.tsx`
  - `arch-stage.tsx` (mode run/overview/xray, sinkron dengan pill & hotspot DOM)
  - `galaxy-layer.tsx` (canvas fixed: bintang + koin perjalanan + "inside the coin")
- **Lifecycle wajib:**
  - satu `WebGLRenderer` per scene;
  - `ResizeObserver` + `IntersectionObserver` (render hanya saat terlihat);
  - pause saat `document.hidden`;
  - quality governor (turunkan pixel ratio bila frame > ~25 ms);
  - **dispose lengkap saat unmount**: geometry, material, texture, render target, composer, `renderer.dispose()` + `forceContextLoss()`, dan lepas listener;
  - fallback statis CSS bila WebGL / import gagal [Desain `.coin-fallback`].
- Sinkronisasi DOM↔3D lewat props/callback, tidak lewat MutationObserver pada `data-*` seperti di HTML. State seperti `active` station, `mode`, dan `tier` hidup di React.
- Hex warna untuk three.js diduplikasi dari token sebagai konstanta `PAL` di `src/lib/three/palette.ts`. Ini pengecualian terdokumentasi dari aturan "tanpa hex".

### 11.4 State
- State server diambil lewat RSC + react-query untuk polling (status graduation, verify).
- State UI lokal: tier terpilih (dibagi antara tier card, DVN rig, dan "inside the coin") memakai satu React context kecil di landing.
- Tidak ada store global baru.

---

## 12. Env

Hanya **nama** yang dicantumkan; nilai tidak pernah ditulis di dokumen, kode, atau log. `.env*` tidak boleh dibaca atau di-commit oleh Claude.

| Nama | Sisi | Fungsi |
|---|---|---|
| `NEXT_PUBLIC_XOFN_NETWORK` | publik | `local` / `testnet` / `mainnet`; nilai tidak dikenal → throw |
| `NEXT_PUBLIC_SITE_URL` | publik | URL absolut (OG, share) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publik | Baca + Realtime |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | publik | AppKit; kosong → wallet nonaktif |
| `NEXT_PUBLIC_RPC_BASE`, `NEXT_PUBLIC_RPC_ARBITRUM`, `NEXT_PUBLIC_RPC_ROBINHOOD` | publik | RPC klien (opsional; ada fallback publik per chain) |
| `RPC_URL_BASE`, `RPC_URL_ARBITRUM`, `RPC_URL_ROBINHOOD` | server | RPC untuk Check & indexer |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Tulis cache/index |
| `CRON_SECRET` | server | Proteksi `/api/cron/*` |
| `LZ_OFT_API_KEY` | server | [Belum] bila OFT API butuh key |
| `FORK_RPC_BASE`, `FORK_RPC_ARBITRUM`, `FORK_RPC_ROBINHOOD` | Foundry | Fork test read-only |

Aturan [Pola: Fademan]:
- `process.env` **hanya** dibaca di `src/lib/env.ts` (server, `server-only`) dan `src/lib/public-env.ts` (`NEXT_PUBLIC_*`).
- ESLint melarang `process.env` di file lain dan melarang pola `process.env.X || 'fallback'`.
- Env wajib yang hilang → error jelas saat startup.
- Variabel key deployer/signer **tidak ada** sampai Phase 6 (FROZEN).

---

## 13. Batasan yang harus dijaga

1. 1-of-1 tidak pernah diizinkan, baik di kontrak, UI launch, maupun data demo (kecuali sebagai contoh "flagged" di Check).
2. Tidak ada status Locked tanpa `verify` on-chain di setiap chain.
3. Server tidak memegang key; tidak ada route yang menandatangani.
4. Alamat hanya dari `deployments/` → `addresses.ts`; chain/EID hanya dari `src/lib/chains`.
5. `quoteSend` dipanggil tepat sebelum `send`; dust dijelaskan.
6. Aturan klaim publik (`PRD.md` §4.3) berlaku untuk copy, OG image, metadata, dan README.
7. Phase 6–7 FROZEN: tidak ada script deploy publik, `[etherscan]`, manifest testnet/mainnet, key, `--broadcast`, atau migrasi produksi.
8. Tidak ada logo atau nama produk LayerZero di branding; disclaimer wajib ada di footer.

---

## 14. Risiko teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Tiga konteks WebGL (hero, arch, galaxy) di satu halaman | Memori/GPU tinggi, konteks hilang di mobile | Render hanya saat terlihat; galaxy dimatikan atau disederhanakan di mobile (D5); quality governor; fallback |
| Kebocoran WebGL saat navigasi App Router | Memori naik tiap navigasi | Dispose lengkap + uji navigasi bolak-balik (`CLAUDE.md` §10) |
| GSAP pinned + Lenis bentrok dengan layout RSC | Jitter, posisi trigger salah | `ScrollTrigger.refresh()` setelah font/gambar siap; satu instance Lenis |
| Biaya dan rate limit RPC / OFT API | Check lambat atau gagal | Cache + TTL, multicall (viem `multicall`), batasi pathway per request |
| `getConfig` efektif vs app config salah dibaca | Label salah, padahal produk menjual angka | Fork test pembanding + 20 OFT manual (gerbang Phase 2) |
| Gas `verify()` multi-EID | Tidak bisa dipanggil kontrak lain | `verifyEid` per pathway |
| Paket LZ + solc/OZ tidak cocok | Build gagal | Phase 0 / awal Phase 3: pin versi yang teruji |
| Integrasi lokal multi-chain (Phase 4) | Sulit mensimulasikan DVN/executor di Anvil | §15 butir 6 |

---

## 15. Hal yang belum diverifikasi

1. EID Robinhood mainnet/testnet; EID Base/Arbitrum dan testnet dicek ulang ke docs LZ.
2. Ketersediaan DVN (Labs, Google Cloud, Polyhedra, DT MMS, FCAT) per pathway (P1).
3. Versi paket `@layerzerolabs/*` yang kompatibel dengan solc 0.8.24 + OZ 5.x; dukungan cancun di Robinhood.
4. Ketersediaan CreateX di Robinhood Chain.
5. Semantik `getConfig` (efektif vs app) dan nilai 0 di ULN (P5); konstanta `CONFIG_TYPE_*`; alamat dead DVN.
6. Cara integrasi lokal multi-chain untuk Phase 4. Opsinya: beberapa instance Anvil + relayer lokal sederhana, atau mode simulasi yang memutar event hasil `TestHelperOz5`. [Usulan] Mulai dari mode simulasi; putuskan di akhir Phase 3.
7. Endpoint, auth, dan rate limit OFT API LayerZero.
8. AMM di ketiga chain (P9) dan antarmukanya untuk compose.
9. Perbedaan API three r170 (HTML) → ≥ r184 (npm), misalnya `OutputPass`, `RoomEnvironment`, dan clipping. Cek saat port.
