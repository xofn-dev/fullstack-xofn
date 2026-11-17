# ARCHITECTURE.md — XofN

> **Tujuan dokumen:** menjelaskan *bagaimana* XofN dibangun: stack, struktur repo, kontrak, lapisan LayerZero, server/indexer, database, Web3 client, frontend, env, batasan, dan risiko teknis. *Apa* yang dibangun ada di `PRD.md`.
>
> **Sumber kebenaran:**
> - Peran chain, lifecycle dua tahap, struktur repo, manifest, env → `deployguide-xofn.md` (v1.0, 17 Nov 2026).
> - Perilaku protokol → `brief-xofn.md`.
> - Visual → `xofn-coinfall-v8-galaxy.html`.
> - Fakta on-chain → `proof/2026-11-17-phase0/`.
> - Pilihan stack web diturunkan dari tiga proyek sebelumnya: **Cognita**, **Assize**, dan **Fademan**. Asal setiap pilihan ditulis di §1.
>
> **Label:**
> - **[Brief]** — dari brief
> - **[Guide]** — dari deploy guide
> - **[Desain]** — dari HTML
> - **[Phase 0]** — terverifikasi riset Phase 0
> - **[Pola: X]** — mengikuti pola proyek X
> - **[Usulan]** — keputusan baru dokumen ini
> - **[Belum]** — harus diverifikasi
>
> **Dokumen terkait:** `CLAUDE.md`, `PRD.md`, `DESIGN_SYSTEM.md`, `USER_FLOWS.md`, `deployguide-xofn.md`.
>
> **Status:** belum ada kode produk (Phase 0 selesai 17 Nov 2026). Struktur di bawah adalah **target**.

---

## 1. Stack

Semua versi adalah baseline minimum. Saat inisialisasi, **pin versi exact** di `package.json` (seperti `next` dan `eslint-config-next` di Cognita/Assize) dan catat di §15 bila ada yang berbeda.

### 1.1 Aplikasi web
| Lapisan | Pilihan | Versi baseline | Asal / alasan |
|---|---|---|---|
| Framework | Next.js App Router, **direktori `src/`**, alias `@/*` | 16.3.x | [Pola: Assize/Cognita 16.3.6] + [Pola: Fademan `src/`] |
| UI runtime | React / react-dom | 19.2.x | [Pola: semua] |
| Bahasa | TypeScript strict | ^5.7 | [Pola: semua] |
| Runtime | Node.js | 20 LTS (minimum) | [Guide §1] |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`), token di `@theme` dalam `src/app/globals.css`; **tanpa** `tailwind.config` | ^4.3 | [Pola: semua] |
| Class util | `clsx` + `cn()` (`src/lib/cn.ts`) | ^2.1 | [Pola: Cognita/Assize] |
| Animasi scroll/timeline | **GSAP + ScrollTrigger** | ^3.13 | [Desain] HTML memakai GSAP 3.13 + ScrollTrigger; [Pola: Fademan] wrapper `src/lib/client/gsap.ts` |
| Smooth scroll | **Lenis** (`lenis`) | ^1.1 | [Desain] HTML memakai Lenis 1.1.13 |
| 3D | **three.js vanilla** (npm, addon dari `three/examples/jsm/*`); **bukan** R3F/drei, **bukan** CDN | ^0.184 | [Pola: Cognita/Assize vanilla]. Kode HTML imperatif (r170), jadi port 1:1 lebih aman |
| Wallet | **Reown AppKit** + `@reown/appkit-adapter-wagmi` | ^1.8.24 | [Pola: Cognita/Assize]. XofN butuh multi-network + switch chain |
| EVM client | `wagmi` 3 + `@wagmi/core` + `viem` 2 + `@tanstack/react-query` 5 | ^3.7 / ^2.56 / ^5.104 | [Pola: semua] |
| DB / cache | Supabase (Postgres): `@supabase/supabase-js`, `@supabase/ssr`, CLI `supabase` (dev) | ^2.106 / ^0.12 / ^2.118 | [Pola: Cognita/Assize/Fademan]. Guide menyebut "PostgreSQL / Redis" untuk cache Check; Supabase memenuhi bagian Postgres, dan Redis tidak dipakai di MVP (P30) |
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
- Redis.
- `zod`: validasi memakai guard tulisan tangan + `viem.isAddress`. [Usulan] Tambahan dependency butuh persetujuan.

### 1.2 Kontrak & tooling LayerZero
| Lapisan | Pilihan | Versi baseline | Asal / alasan |
|---|---|---|---|
| Toolchain | **Foundry** (forge/anvil/cast) **di root repo**, dipin dengan `foundryup --install <versi>` | v1.8.x (v1.8.3 terpasang di mesin dev) | [Pola: Cognita/Assize] + [Guide] |
| Solidity | `solc` **0.8.24**, `evm_version = cancun`, optimizer 200 runs, `via_ir = false` | 0.8.24 | [Pola: semua]. **[Phase 0]:** paket LayerZero di bawah terkompilasi dan lulus tes dengan konfigurasi ini. Opcode cancun berjalan di Robinhood (4663 dan 46630) **kecuali `BLOBBASEFEE`**, sama seperti Arbitrum One, jadi jangan memakai `block.blobbasefee`. Bukti: `proof/2026-11-17-phase0/05-packages.md`, `06-robinhood-chain.md` |
| Library | OpenZeppelin Contracts v5, termasuk `Clones` untuk curve | 5.x (smoke build Phase 0 memakai 5.6.1) | [Pola: semua]; dibutuhkan oleh OFT V2. Sebagian file OZ 5.6 ber-pragma `^0.8.26` dan tidak boleh diimpor selama solc dipin 0.8.24 |
| LayerZero kontrak | `@layerzerolabs/oft-evm`, `@layerzerolabs/oapp-evm`, `@layerzerolabs/lz-evm-protocol-v2`, `@layerzerolabs/lz-evm-messagelib-v2`, `@layerzerolabs/test-devtools-evm-foundry` (TestHelperOz5) | oft-evm **4.0.1**, oapp-evm **0.4.1**, protocol-v2 **3.0.168**, messagelib-v2 **3.0.168**, test-devtools **8.0.1** (npm, 17 Nov 2026) [Phase 0] | Diinstal lewat npm di **`package.json` root**, lalu di-remap dari `node_modules`. Peer `@layerzerolabs/lz-evm-v1-0.7` (3.0.168) dan `solidity-bytes-utils` (0.8.4) **butuh persetujuan owner** sebelum Phase 3 |
| LayerZero devtools | Hardhat + `@layerzerolabs/toolbox-hardhat` dengan `layerzero.config.ts`, **hanya untuk inspeksi** (`lz:oapp:config:get`, `lz:oapp:config:get:default`) | terbaru [Belum] | [Guide §1, §4.2, §7.2]. Butuh persetujuan dependency, dan **belum dipasang**: pembacaan default config memakai `cast call` yang setara (Phase 0). Task yang menulis (`lz:oapp:wire`) **dilarang** selama Phase 6–7 FROZEN |
| Alamat seragam | **CreateX** (CREATE3) + `DEPLOY_SALT` | `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` | [Brief + Guide]. **[Phase 0]:** bytecode identik di Robinhood, Robinhood testnet, Base, dan Arbitrum. EndpointV2 Robinhood berbeda dari Base/Arbitrum, jadi alamat seragam butuh CREATE3, bukan CREATE2 |
| Test | forge unit + fuzz + invariant + fork **read-only** + multi-endpoint | — | [Pola: Cognita/Assize] + [Brief] |
| Key deployer | Keystore Foundry (`cast wallet import xofn-deployer`, `--account xofn-deployer`), **bukan** private key di `.env` | — | [Guide §1]. **FROZEN (Phase 6–7)**: Claude tidak membuat atau memakai keystore |

---

## 2. Struktur repo (target, mengikuti guide §2)

```
fullstack-xofn/
├─ CLAUDE.md  PRD.md  ARCHITECTURE.md  DESIGN_SYSTEM.md  USER_FLOWS.md
├─ deployguide-xofn.md                 # guide PM (peran chain, fase deploy) — prosedur deploy FROZEN
├─ brief-xofn.md                       # brief (aturan protokol & klaim)
├─ xofn-coinfall-v8-galaxy.html        # baseline visual (konsep V8)
├─ package.json                        # Next app + paket LZ (remap untuk Foundry) + devtools (inspeksi)
├─ foundry.toml  remappings.txt        # src = "contracts", test = "test", script = "script"
├─ contracts/                          # [Guide] sumber Solidity
│  ├─ XofNToken.sol        # OFT, override renounceOwnership
│  ├─ XofNCurve.sol        # bonding curve di home chain (implementation; di-clone per launch)
│  ├─ XofNGraduator.sol    # owner sementara token, graduate() + expandAndLock() + retryRemote()
│  ├─ XofNRemote.sol       # OApp + composer di chain ekspansi
│  ├─ XofNRegistry.sol     # tier per token + verify(token) / verifyEid — di setiap chain
│  ├─ interfaces/  libraries/ (TierLib, UlnConfigLib)
├─ test/                               # forge: unit/ fuzz/ invariant/ lz/ (multi-endpoint) fork/ (read-only) mocks/
├─ script/
│  ├─ local/                           # Anvil saja (Phase 3–4)
│  └─ (01_DeployCore, 02_TransferToSafe, 10_DeployRemote, 11_WireInfra — Phase 6–7, FROZEN, belum dibuat)
├─ config/
│  ├─ tiers.json                       # [Guide] definisi Standard & Fortress per pathway (isi menunggu P1)
│  └─ dvn-labels.json                  # [Guide] alamat DVN → operator per chain (+ flag deprecated)
├─ layerzero.config.ts                 # [Guide] untuk inspeksi config (read-only)
├─ deployments/                        # [Guide] <network>.json — satu-satunya sumber alamat; sekarang hanya local.json
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
│  │  ├─ check/  token/  launch/  graduation/  expansion/  bridge/  proof/
│  │  └─ wallet/        # ConnectButton (+ *Active), NetworkGuard
│  ├─ lib/
│  │  ├─ env.ts  public-env.ts           # SATU-SATUNYA pembaca process.env
│  │  ├─ mode.ts                         # preview | simulation | live
│  │  ├─ cn.ts  escape-html.ts  format.ts
│  │  ├─ chains/       # registry chain + EID (§4)
│  │  ├─ tiers/        # loader config/tiers.json + config/dvn-labels.json (Phase 2)
│  │  ├─ lz/           # ABI endpoint/OFT, decode ULN, label, OFT API client (§7)
│  │  ├─ check/        # orkestrasi XofN Check (server-only) — padanan folder check/ di guide
│  │  ├─ web3/         # config AppKit, addresses, aksi per file (§10)
│  │  ├─ supabase/     # server.ts, client.ts, public.ts
│  │  ├─ three/        # factory murni: coin, track, gate, stage, sky (§11.3)
│  │  └─ client/       # gsap.ts, lenis.ts, use-reduced-motion.ts
│  └─ types/  domain.ts  enums.ts  db.ts (generated)
├─ tests/                              # vitest: lib/lz, lib/check, lib/tiers, format, mode
├─ supabase/migrations/0001_*.sql …
└─ proof/YYYY-MM-DD-<milestone>/notes.md
```

Catatan layout:
- **Foundry di root, Next di `src/`.** Ini mengikuti guide, karena perintah PM (`forge script script/01_DeployCore.s.sol`) dijalankan dari root.
- Folder `test/` (forge) dan `tests/` (Vitest) sengaja dipisah.
- ESLint mengabaikan `contracts/`, `test/`, `script/`, dan `lib/` (lib Foundry, bila ada).

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
                │  • aksi: launch / buy-sell / graduate / expandAndLock / retry /   │
                │    bridge — disusun di browser → ditandatangani di wallet         │
                └───────┬───────────────────────────────┬──────────────────────────┘
                        │ tx (user-signed)               │ fetch (read)
         ┌──────────────▼────────────────┐  ┌───────────▼──────────────────────────┐
         │ Robinhood Chain (HOME)        │  │ Next.js Route Handlers (server-only) │
         │  XofNCurve (clone per launch) │  │  /api/check  /api/tokens  /api/cron  │
         │  XofNGraduator · XofNToken    │  │   • viem public client per chain     │
         │  XofNRegistry                 │  │   • peers(eid) + OFT API (pelengkap) │
         │        │ LayerZero V2 (hub)   │  │   • TANPA private key                │
         │   ┌────┴─────┐                │◄─┤ read getConfig / delegates / owner   │
         │   ▼          ▼                │  └───────────┬──────────────────────────┘
         │ Base       Arbitrum (EKSPANSI)│              │ upsert (service role)
         │  XofNRemote · XofNToken       │  ┌───────────▼──────────────────────────┐
         │  XofNRegistry (per chain)     │  │ Supabase (Postgres): cache Check,    │
         └───────────────────────────────┘  │ index event, status lifecycle, label │
                                            │ pg_cron → /api/cron/* (CRON_SECRET)   │
                                            └──────────────────────────────────────┘
```

Prinsip [Brief + Guide]:
1. **Server tidak pernah memegang key** untuk aksi pengguna maupun protokol. Server hanya membaca dan mengindeks.
2. Status "Locked" di UI selalu berasal dari pembacaan on-chain (`verify` / `verifyEid` di setiap chain), tidak dari kolom DB yang diisi manual. DB hanya menyimpan **cache** hasil baca beserta `checked_at`.
3. Otorisasi tidak pernah dilakukan di `proxy.ts` [Pola: Cognita, CVE-2025-29927]. XofN kemungkinan tidak butuh `proxy.ts` sama sekali.
4. **Topologi hub:** pathway hanya Robinhood↔Base dan Robinhood↔Arbitrum. Base↔Arbitrum tidak di-wire (P29).

---

## 4. Registry chain (`src/lib/chains`)

Satu-satunya sumber chain ID, EID, nama, RPC, explorer, dan peran. **Jangan menulis nama chain atau EID langsung di komponen.**

| Chain | Chain ID | EID LayerZero | Peran [Guide] | Explorer | Status data |
|---|---|---|---|---|---|
| Robinhood Chain | 4663 | **30416** | **Home** (Fase 1b, 2b) | `https://robinhoodchain.blockscout.com` | Terverifikasi 17 Nov 2026 |
| Base | 8453 | 30184 | Ekspansi (Fase 2b) | basescan.org | Terverifikasi 17 Nov 2026 |
| Arbitrum One | 42161 | 30110 | Ekspansi (Fase 2b) | arbiscan.io | Terverifikasi 17 Nov 2026 |
| Robinhood testnet | 46630 | **40451** | Home testnet (Fase 1a, 2a — FROZEN) | `https://explorer.testnet.chain.robinhood.com` | Terverifikasi 17 Nov 2026 |
| Base Sepolia | 84532 | 40245 | Ekspansi testnet (Fase 2a — FROZEN) | sepolia.basescan.org | Terverifikasi 17 Nov 2026 |
| Arbitrum Sepolia | 421614 | 40231 | Ekspansi testnet (Fase 2a — FROZEN) | sepolia.arbiscan.io | Terverifikasi 17 Nov 2026 |
| Anvil lokal | 31337 (+ instance tambahan, lihat §15) | EID mock dari TestHelperOz5 | Dev | — | — |

"Terverifikasi" berarti cocok antara metadata LayerZero (`https://metadata.layerzero-api.com/v1/metadata`) dan pembacaan on-chain `chain-id` + `EndpointV2.eid()`. Alamat EndpointV2, SendUln302, ReceiveUln302, Executor, dan Dead DVN per chain ada di `proof/2026-11-17-phase0/01-chains-eid.md`. Catatan:
- EndpointV2 Robinhood (`0x6f475642a6e85809b1c36fa62763669b1b48dd5b`) **berbeda** dari Base/Arbitrum (`0x1a44076050125825900e736c501f859c50fe728c`). Guide §3 sudah mengingatkan hal ini.
- EndpointV2 Robinhood testnet (`0x3acaaf60502791d199a5a5f0b173d78229ebfe32`) juga **berbeda** dari alamat testnet umum di guide §3 (`0x6edce65403992e310a62460808c4b910d972f10f`, yang dipakai Base Sepolia dan Arbitrum Sepolia).
- Robinhood tidak punya ReadLib1002 (mainnet maupun testnet).
- Default pathway ke/dari Robinhood = **Dead DVN**, jadi pesan tanpa ULN eksplisit tidak akan pernah terkirim.
- RPC publik Robinhood dibatasi rate dan tidak untuk produksi.

Bentuk dan aturan registry:
- Bentuk data: `ChainInfo { key: 'robinhood'|'base'|'arbitrum'; chainId; eid; name; explorer; lzScan; rpcEnvKey; role: 'home'|'expansion' }`.
- Slug URL `/check/[chain]/...` memakai `key` (`robinhood`, `base`, `arbitrum`).
- Jaringan aktif dipilih dari `NEXT_PUBLIC_XOFN_NETWORK` (`local` | `testnet` | `mainnet`) [Pola: Cognita `activeChain`]. Nilai tidak dikenal → **throw**, bukan fallback diam-diam [Pola: Fademan].
- Untuk chain di luar viem/chains, definisi dibuat lewat `defineChain` dari `@reown/appkit/networks` [Pola: Assize].
- Catatan lingkungan dev: DNS Telkomsel memblokir `*.robinhood.com`. Pakai VPN atau DNS lain sebelum menguji RPC Robinhood.

---

## 5. Kontrak

### 5.1 Daftar & peran [Brief + Guide]
| Kontrak | Chain | Peran | Catatan |
|---|---|---|---|
| `XofNToken` | Semua | OFT sejak tahap 1; 999M di-mint ke curve di Robinhood; shared decimals 6 | Tanpa mint publik/pause/fee/blacklist/upgrade. `renounceOwnership()` menolkan delegate dulu |
| `XofNCurve` | Robinhood | Bonding curve dengan parameter tetap per launch; implementation + clone (`XofNCurveImplementation` di manifest) | Parameter: P8, P16, P17 |
| `XofNGraduator` | Robinhood | Owner + delegate token selama bonding **dan sampai ekspansi selesai**. Menjalankan `graduate()`, `expandAndLock(token)`, dan `retryRemote(eid)`. Resep immutable; alamat DVN dikunci di constructor dari `config/tiers.json` | Tidak upgradeable. Tidak bisa mengubah tier setelah launch. **Tidak me-renounce di `graduate()`**. Audit paling ketat |
| `XofNRemote` | Base, Arbitrum | OApp + composer: deploy token (CREATE3), terima `lzCompose`, buat + isi pool, pasang konfigurasi, kunci | Alamat seragam di Base dan Arbitrum lewat CreateX + `DEPLOY_SALT`. Guide §7.1 menulis "sama dengan di Robinhood Testnet", padahal Remote tidak di-deploy di Robinhood; yang bisa sama dengan Robinhood adalah `XofNRegistry`. Alamat token seragam: P39 |
| `XofNRegistry` | **Setiap chain** [Guide §7.1] | Simpan tier per token + hash konfigurasi yang diharapkan per EID; `verify(token)`, `verifyEid(token, eid)` | Owner = Safe; Safe hanya mengelola label/daftar putih untuk token **baru** [Guide §5.4] |

Launch dilakukan dalam satu transaksi di **Robinhood** (lewat fungsi factory di Graduator, atau kontrak `XofNFactory` [Usulan]):
- clone curve;
- deploy token OFT dengan supply penuh ke curve;
- set owner dan delegate = Graduator;
- daftarkan tier dan chain ekspansi pilihan creator di Registry.

Factory **menolak**:
- tier dengan kurang dari 2 DVN wajib;
- DVN di luar daftar putih;
- konfigurasi 1-of-1;
- field konfigurasi bernilai 0.

### 5.2 Tier & konfigurasi ULN
- Sumber data: `config/tiers.json` [Guide]. Format guide:
  ```json
  { "standard": { "badge": "XofN 2+1/2", "required": ["layerzero", "googlecloud|polyhedra"], "optional": ["dtmms", "fcat"], "optionalThreshold": 1 },
    "fortress": { "badge": "XofN 3+1/2", "required": ["layerzero", "googlecloud", "polyhedra"], "optional": ["dtmms", "fcat"], "optionalThreshold": 1 } }
  ```
  **[Phase 0]** Isi ini tidak bisa dipenuhi di pathway Robinhood: Google tidak ada di Robinhood, dan Polyhedra deprecated atau tidak ada. Isi final menunggu P1. File dibuat dengan **id operator**, dan alamat per chain di-resolve dari `config/dvn-labels.json`.
- Pemetaan key guide ↔ id metadata LayerZero [Usulan]: `layerzero` = `layerzero-labs`, `googlecloud` = `google-cloud`, `polyhedra` = `polyhedra-network`, `dtmms` = `deutsche-telekom`, `fcat` = `fidelity`. `config/dvn-labels.json` memakai id metadata sebagai kunci dan menyimpan key guide sebagai alias, supaya `tiers.json` tetap berformat guide.
- Definisi tier per pathway disimpan sebagai data immutable. Isinya:
  - `sendLib` / `receiveLib` eksplisit, **bukan default**;
  - `UlnConfig { confirmations, requiredDVNCount, optionalDVNCount, optionalDVNThreshold, requiredDVNs[], optionalDVNs[] }`;
  - `ExecutorConfig { maxMessageSize, executor }`;
  - enforced options untuk `lzReceive` dan `lzCompose`.
- **Array DVN terurut naik dan unik** per chain. ULN memvalidasi ini; urutan yang salah membuat transaksi revert.
- Nilai 0 **berarti** "pakai default" (P5, [Phase 0] dari `UlnBase.sol`): berlaku untuk `confirmations`, `requiredDVNCount`, `optionalDVNCount`, serta `maxMessageSize` dan `executor`. Karena itu konfigurasi **selalu diisi eksplisit** dengan nilai bukan nol.
- `tierHash(eid) = keccak256(abi.encode(sendLib, receiveLib, ulnSend, ulnReceive, executorCfg))` disimpan di Registry untuk perbandingan [Usulan].
- **Daftar putih DVN dan label operator** dimiliki Safe 2-of-3 [Brief + Guide]. Perubahan tidak memengaruhi token yang sudah ada, dan harus diumumkan sebelum dieksekusi. Hubungannya dengan alamat DVN yang dikunci di constructor Graduator belum jelas di guide (P37).

### 5.3 State machine lifecycle [Usulan, berdasarkan urutan Brief + Guide]
```
TAHAP 1 (Robinhood)
  BONDING ──graduate()──► GRADUATED (pool Robinhood ada; owner/delegate = Graduator; verify=false)

TAHAP 2 ──expandAndLock(token)──► EXPANDING, per EID (independen, bisa di-retry):
  NONE → DEPLOY_SENT → DEPLOYED(ack) → CONFIGURED(ack)* → LIQ_SENT → POOL_CREATED(ack via compose) → REMOTE_LOCKED(ack)
                                       ▲ retryRemote(eid): ulangi langkah terakhir yang gagal dengan parameter identik
  semua EID REMOTE_LOCKED ──► verify pra-kunci di Robinhood
                          ──► setDelegate(0) + renounceOwnership() di Robinhood ──► Registry: LOCKED

* CONFIGURED mencakup KEDUA sisi pathway: resep di token remote (dipasang Remote) dan resep di token
  Robinhood untuk EID itu (library, ULN, executor, enforced options, peer; dipasang Graduator).
  Keduanya harus ada sebelum LIQ_SENT, karena send dari Robinhood butuh peer dan ULN sisi Robinhood.
  Urutan ini adalah rekomendasi Phase 0 (P28). Guide §7.3 masih menaruh resep setelah send, padahal
  send tanpa peer + ULN eksplisit tidak bisa berjalan (NoPeer / Dead DVN).
  Keputusan PM harus tercatat sebelum Phase 3 dimulai.
```
- Konfigurasi sisi remote (library, ULN, executor, enforced options, peer) harus dipanggil oleh owner/delegate token di chain itu, yaitu `XofNRemote`. Karena itu Graduator mengirim **pesan instruksi** ke Remote, dan Remote membalas dengan **ack**.
- Pesan infrastruktur Graduator↔Remote memakai pathway yang di-wire dengan **tier Fortress** di kedua arah, lalu diserahkan ke Safe [Guide §7.2]. Brief menulis "lalu kunci"; implikasi keamanannya dicatat di P38. Operator Fortress untuk pathway ini ikut menunggu P1.
- Robinhood dikunci **terakhir**: konfigurasi sisi Robinhood dipasang lebih awal (lihat catatan `*`), tetapi `setDelegate(0)` dan `renounceOwnership()` di Robinhood baru dijalankan setelah semua remote terkunci.
- Fee pesan balasan (ack) dari chain ekspansi ke Robinhood belum diatur (P40).
- `graduate()` hanya bisa dipanggil sekali dan gagal sebelum ambang tercapai. Pemanggil menerima insentif tetap (P15). **Tidak ada renounce.**
- `expandAndLock` dipanggil siapa pun untuk token GRADUATED; pemanggil membayar quote (P31).
- `retryRemote(eid)` hanya mengulang langkah yang sama dengan parameter yang sama. Pembayar fee: P14.

### 5.4 Composer `XofNRemote.lzCompose` [Brief + Guide]
- `require(msg.sender == endpoint)` dan `from` == token XofN yang terdaftar.
- Isi `composeMsg`: rasio, alamat AMM, dan penerima LP. Pool **dibuat dan diisi dalam satu panggilan**.
- Composer tidak boleh bergantung pada pemanggil, `msg.value`, atau `extraData`. Semua parameter berasal dari `composeMsg` [Phase 0].
- Sumber aset pasangan: P2. Batas native drop dari Robinhood: ke Base 0,05 ETH, ke Arbitrum 0,24 ETH [Phase 0].
- `retryCompose`: compose yang gagal tersimpan di endpoint dan bisa dijalankan ulang [Phase 0]. Jalur keluar untuk kegagalan permanen dirancang dan diuji di Phase 3b (P3). **Tidak boleh ada pembuatan pool manual dari wallet tim** [Guide §9].

### 5.5 `verify` [Brief + Guide]
- `verifyEid(token, eid)` (lokal di chain mana pun) memeriksa:
  - `owner()==0` dan `endpoint.delegates(token)==0`;
  - `isDefaultSendLibrary == false`, `getReceiveLibrary(...).isDefault == false`, dan `receiveLibraryTimeout` kosong;
  - hash `getConfig` ULN (tipe 2) + executor (tipe 1) sama dengan `tierHash(eid)`;
  - `peers(eid)` terpasang.
- `verify(token)` mengembalikan `(bool locked, uint8 tier, uint32[] eids)` = AND dari semua EID terdaftar di chain itu. Di Robinhood setelah ekspansi: `true, tier, [EID Base, EID Arbitrum]` [Guide §7.4].
- **Status global** di UI = `verify` true di Registry **setiap** chain token, dibaca indexer lewat RPC masing-masing chain (P13, terselesaikan). Sebelum semuanya true, status tetap Graduated/Expanding.
- Interface `ILayerZeroEndpointV2` di paket tidak memuat `delegates(address)`, jadi Registry butuh interface sendiri [Phase 0].

### 5.6 Prosedur deploy — **referensi [Guide §5–8], dieksekusi di Phase 6–7 (FROZEN total)**
| Fase guide | Jaringan | Ringkasan |
|---|---|---|
| 1a | Robinhood testnet | `01_DeployCore` (Registry → Curve implementation → Graduator; semua lewat CreateX + `DEPLOY_SALT`) → `deployments/robinhood-testnet.json` → smoke test → `02_TransferToSafe` |
| 1b | Robinhood mainnet | Rilis publik XofN Check lebih dulu → ulangi 1a di mainnet → verifikasi Blockscout → launch terbatas; token lulus berstatus "awaiting expansion" |
| 2a | Robinhood testnet + Base Sepolia + Arbitrum Sepolia | `10_DeployRemote` (Remote + Registry lokal, alamat sama) → `11_WireInfra` (tier Fortress, kedua arah, ke Safe) → `expandAndLock` satu token → verifikasi §7.4 |
| 2b | Robinhood + Base + Arbitrum One | Sama seperti 2a di mainnet; simpan output di `proof/` |

Sampai PM memberi perintah, **hanya** `script/local/*` (Anvil) yang boleh dibuat atau dijalankan.

---

## 6. Pola tes Foundry

| Jenis | Lokasi | Isi |
|---|---|---|
| Unit | `test/unit/` | Token (override renounce, tanpa mint), Curve (clone, harga, ambang, sekali graduate), Graduator (tidak ada renounce setelah `graduate`), Factory (tolak <2 DVN, DVN non-whitelist, 1-of-1, field 0), Registry (`verify` false sebelum terkunci dan untuk owner/delegate/config salah) |
| Fuzz | `test/fuzz/` | Jumlah buy/sell, rounding shared decimals (dust < 0,000001) |
| Invariant | `test/invariant/` | Handler + total supply semua chain = 999M; tidak ada mint di luar `_credit` [Pola: Cognita Handler/Accounting]. Dijalankan juga dengan `--match-contract Invariant` [Guide] |
| Multi-endpoint LZ | `test/lz/` | `TestHelperOz5`: 3 endpoint mock (Robinhood/Base/Arbitrum), `expandAndLock` penuh, kegagalan disengaja (gas/DVN) → `retryRemote`, compose dari non-endpoint ditolak, front-run pembuatan pool, compose kehabisan gas |
| Fork (read-only) | `test/fork/` | Baca `getConfig` OFT nyata untuk memvalidasi decoder (pembanding Phase 2). **Tanpa broadcast** |
| Mock | `test/mocks/` | AMM mock, DVN mock (termasuk pengganti operator yang belum diputuskan, P1), DVN mock gagal, token aneh |

`foundry.toml` [Pola: Cognita/Assize + Guide]:
- `src = "contracts"`, `test = "test"`, `script = "script"`;
- `[invariant]` runs 256, depth 64; profil `ci` fuzz 10k, invariant 1000 / depth 128;
- `[fmt] line_length = 100`;
- `gas_reports = ["*"]`.

`rpc_endpoints` hanya untuk **fork read-only** yang dibaca dari env. **Tidak ada `[etherscan]`, verifier, atau profil deploy publik selama Phase 6–7 FROZEN.**

---

## 7. Lapisan LayerZero aplikasi (`src/lib/lz`)

| Modul | Isi |
|---|---|
| `abi.ts` | Subset ABI EndpointV2: `getConfig(oapp, lib, eid, configType)`, `getSendLibrary(sender, eid)`, `getReceiveLibrary(receiver, eid)` → `(lib, isDefault)`, `isDefaultSendLibrary`, `receiveLibraryTimeout`, `delegates(oapp)`. OFT/OApp: `owner()`, `endpoint()`, `peers(eid)`, `token()`, `sharedDecimals()`, `oftVersion()`, `quoteSend`, `send` |
| `config-types.ts` | `CONFIG_TYPE_EXECUTOR = 1`, `CONFIG_TYPE_ULN = 2` [Phase 0, dari `SendUln302.sol`]. ReceiveUln302 hanya mengenal tipe 2; tipe 1 pada receive library revert `LZ_ULN_InvalidConfigType` |
| `decode.ts` | Decode `UlnConfig` dan `ExecutorConfig` dari bytes `getConfig` (fungsi murni, dites Vitest) |
| `label.ts` | Algoritma label pathway (di bawah), fungsi murni, dites Vitest |
| `dvn-labels.ts` | Loader `config/dvn-labels.json`: peta (chain, alamat DVN) → operator + flag `deprecated`. Disinkronkan ke tabel `dvn_labels` dengan `source_url` dan `verified_at` |
| `oft-api.ts` | Klien OFT API LayerZero untuk menemukan deployment lain sebuah OFT. [Phase 0]: `GET https://metadata.layerzero-api.com/v1/metadata/experiment/ofts/list` (parameter `chainNames`, `symbols`, `protocols`, `contractAddresses`), **gratis tanpa key**. Per 17 Nov 2026 **tidak memuat Robinhood**, dan daftar deployment bukan daftar peer, jadi hanya pelengkap pemindaian `peers(eid)`. [Belum] rate limit (tidak didokumentasikan) |
| `scan.ts` | Builder URL LayerZero Scan untuk GUID pesan ([Belum] pola URL; situs merespons 429 saat Phase 0) |

**Algoritma label per pathway** [Brief + Usulan]. Arah *send* dan *receive* dicek terpisah, dan label pathway mengikuti arah yang **terburuk**:
- `effective = requiredDVNCount + optionalDVNThreshold`.
- `effective ≤ 1` → **"1-of-1"** (merah). [Phase 0] Konfigurasi "0 wajib + 1 dari N opsional" juga jatuh ke label ini; copy-nya perlu diputuskan saat Phase 2.
- `effective ≥ 2` → **"2+"** (kuning).
- `effective ≥ 2` **dan** owner=0 **dan** delegate=0 **dan** library bukan default **dan** bukan proxy beradmin → **"2+ & locked"** (hijau).
- Pathway tanpa peer → tidak ditampilkan.
- DVN "dead" → label **"blocked"**. Alamat LZ Dead DVN per chain [Phase 0]: Robinhood `0x6788f52439aca6bff597d3eec2dc9a44b8fee842`, Base `0x6498b0632f3834d7647367334838111c8c889703`, Arbitrum `0x758c419533ad64ce9d3413bc8d3a97b026098ec1`.

Catatan baca [Phase 0, `proof/2026-11-17-phase0/03-uln-semantics.md`]:
- `endpoint.getConfig` mengembalikan konfigurasi **efektif** (gabungan custom + default). Konfigurasi mentah aplikasi dibaca lewat `getAppUlnConfig(oapp, eid)` di library. Check menampilkan **keduanya**; field mentah bernilai 0 berarti bergantung pada default (default bisa berubah [Brief]).
- Di konfigurasi custom, 0 = default; `type(uint64).max` / `255` = benar-benar nol.
- Endpoint mengizinkan `msg.sender == oapp` **atau** delegate. Owner = 0 dan delegate = 0 hanya berarti terkunci bila kontrak OApp sendiri tidak punya jalur ke fungsi konfigurasi. Proxy dengan admin tidak boleh diberi label "locked" (baca slot EIP-1967).
- Label operator dikunci pada pasangan (chain, alamat): alamat yang sama bisa dimiliki operator berbeda di chain lain.
- OFT tidak menyediakan daftar EID. Daftar EID diambil dengan memindai `peers(eid)` untuk EID di registry chain.

---

## 8. Route Handlers (`src/app/api`)

| Route | Method | Fungsi | Auth |
|---|---|---|---|
| `/api/check/[chain]/[address]` | GET | Validasi alamat → cache Supabase (TTL, P20) → bila basi, baca RPC (+ OFT API) → simpan → kembalikan hasil + `checked_at` | Publik, rate-limited |
| `/api/tokens` | GET | Daftar token XofN (filter `status`), dari index | Publik |
| `/api/tokens/[address]` | GET | Detail token: status lifecycle, tier, langkah ekspansi per EID, supply per chain | Publik |
| `/api/cron/recheck` | POST | Re-check berkala token XofN dan Check populer; deteksi **Changed** | `Authorization: Bearer CRON_SECRET` |
| `/api/cron/index-events` | POST | Indeks event Curve/Graduator/Registry/Remote per chain (cursor blok) | `CRON_SECRET` |

Aturan:
- Format error seragam `{ error: { code, message } }` [Pola: Fademan].
- Route membaca env hanya lewat `src/lib/env.ts`.
- Semua modul server diberi `import 'server-only'`.
- **Tidak ada route yang menandatangani transaksi.**
- Rate limit sederhana per IP [Usulan]: tabel `rate_limits` atau header cache CDN. Dependency baru butuh persetujuan.
- Kegagalan RPC → `502` dengan pesan jujur. Hasil parsial ditandai per pathway (`status: 'unread'`), **tidak pernah** diisi tebakan.

---

## 9. Database (Supabase / Postgres)

Migrasi bernomor `supabase/migrations/0001_*.sql` [Pola: Cognita]. Tipe dihasilkan ke `src/types/db.ts` lewat `supabase gen types` dan tidak diedit manual. Guide menamai koneksi cache `CHECK_DATABASE_URL`; di XofN akses lewat Supabase client, dan nama env mengikuti §12 (P30).

| Tabel | Kolom utama | Catatan |
|---|---|---|
| `tokens` | `address` (pk, lowercase), `home_chain_id`, `name`, `ticker`, `image_path`, `tier` (`standard`/`fortress`), `status` (`bonding`/`graduated`/`expanding`/`locked`/`changed`), `expansion_eids int[]`, `created_tx`, `graduated_tx`, `created_at` | Diisi indexer dari event launch / graduate / expand |
| `curve_trades` | `token`, `tx_hash`, `side`, `amount_token`, `amount_eth`, `price`, `block_time` | Untuk chart & progres |
| `expansion_steps` | `token`, `eid`, `step`, `status` (`pending`/`ok`/`failed`), `tx_hash`, `lz_guid`, `updated_at` | Sumber UI progres ekspansi per chain |
| `oft_checks` | `id`, `chain_id`, `address`, `checked_at`, `owner`, `delegate`, `overall_label`, `is_xofn`, `verify_result jsonb`, `raw jsonb` | Cache XofN Check |
| `oft_pathways` | `check_id`, `local_eid`, `remote_eid`, `direction`, `send_lib`, `receive_lib`, `uses_default_lib`, `confirmations`, `required_dvns text[]`, `optional_dvns text[]`, `optional_threshold`, `app_config jsonb`, `label`, `status` | Satu baris per pathway per arah (efektif + mentah) |
| `dvn_labels` | `chain_id`, `address`, `operator`, `deprecated`, `source_url`, `verified_at` | Sinkron dengan `config/dvn-labels.json` |
| `chain_cursors` | `chain_id`, `contract`, `last_block` | Indexer |

- **RLS:** `select` untuk anon; `insert`/`update` hanya service role [Pola: Fademan].
- **Penjadwalan:** pg_cron + pg_net memanggil `/api/cron/*` dengan `CRON_SECRET` [Pola: Cognita/Fademan].
- **Dev:** `supabase start` (lokal). Push migrasi ke project remote **hanya dengan izin owner**.

---

## 10. Web3 client (`src/lib/web3`)

### 10.1 Modul
| File | Isi |
|---|---|
| `config.ts` | `WagmiAdapter` (cookieStorage, `ssr: true`) dengan **semua network aktif** (Robinhood, Base, Arbitrum untuk mode yang dipilih). `projectId` dari public env. `isWeb3Configured = !!projectId`. Tanpa `'use client'` karena diimpor juga oleh server [Pola: Assize] |
| `addresses.ts` | Membaca `deployments/<network>.json` (§10.3); helper `lc()`; **satu-satunya** tempat alamat kontrak |
| `public-client.ts` | viem public client per chain (server & client) |
| `launch.ts` | Simulasi + tulis tx launch di Robinhood |
| `curve-trade.ts` | Quote + buy/sell di curve (dan pool Robinhood setelah graduate), dengan slippage |
| `graduate.ts` | `graduate()` di Robinhood (tanpa fee LZ; pemanggil menerima insentif) |
| `expand-and-lock.ts` | Quote fee LZ total + `expandAndLock(token)` |
| `retry-remote.ts` | Quote + `retryRemote(eid)` |
| `bridge-send.ts` | `quoteSend` **tepat sebelum** `send`; hitung dust (`amount mod 10^(decimals-6)`); rute lewat Robinhood |
| `verify.ts` | Baca `verify`/`verifyEid` di Registry setiap chain |
| `use-network-guard.ts` | Deteksi network salah, lalu tawarkan switch lewat AppKit |

### 10.2 Pola komponen wallet [Pola: Cognita/Assize]
- Hook AppKit (`useAppKit`, `useAppKitAccount`, `useAppKitNetwork`) **hanya** dipanggil di komponen `*Active` yang dirender saat `isWeb3Configured`.
- Selain itu, tampil fallback non-aktif: tombol "Connect Wallet" yang membuka modal penjelasan, seperti di HTML.
- Provider (`components/wallet/web3-provider.tsx`) melewati `createAppKit` bila `projectId` kosong.

### 10.3 Manifest deployment [Guide §2]
- Satu file per jaringan: `deployments/<network>.json` dengan nama `robinhood-testnet`, `robinhood`, `base-sepolia`, `arbitrum-sepolia`, `base`, `arbitrum`, ditambah `local` (Anvil, khusus dev).
- Format:
  ```json
  { "chainId": 0, "eid": 0, "endpointV2": "0x...",
    "contracts": { "XofNGraduator": "0x...", "XofNCurveImplementation": "0x...", "XofNRegistry": "0x...", "XofNRemote": "0x..." },
    "owner": "0xSAFE...", "deployBlock": 0, "verifiedSource": true }
  ```
- `addresses.ts` menggabungkan file-file jaringan aktif menjadi peta per `ChainInfo.key`.
- Saat ini hanya **`local.json`** yang boleh dibuat. File jaringan publik dibuat di Phase 6–7 (**FROZEN**).
- Format guide memuat satu chain per file, sedangkan simulasi lokal butuh tiga chain (Robinhood, Base, Arbitrum mock). Bentuk `local.json` untuk tiga chain itu [Belum]; diputuskan di awal Phase 3 tanpa menambah file jaringan publik.
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
  - `arch-stage.tsx` (mode run/overview/xray, sinkron dengan pill & hotspot DOM). Stasiun mengikuti peran chain baru: origin = Robinhood, remote = Base & Arbitrum (D15)
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
- State server diambil lewat RSC + react-query untuk polling (status lifecycle, langkah ekspansi, verify).
- State UI lokal: tier terpilih (dibagi antara tier card, DVN rig, dan "inside the coin") memakai satu React context kecil di landing.
- Tidak ada store global baru.

---

## 12. Env

Hanya **nama** yang dicantumkan; nilai tidak pernah ditulis di dokumen, kode, atau log. `.env*` tidak boleh dibaca atau di-commit oleh Claude. Nama mengikuti `.env.example` di guide §3, ditambah variabel aplikasi web.

| Nama | Sisi | Fungsi | Dipakai sejak |
|---|---|---|---|
| `NEXT_PUBLIC_XOFN_NETWORK` | publik | `local` / `testnet` / `mainnet`; nilai tidak dikenal → throw | Phase 1 |
| `NEXT_PUBLIC_SITE_URL` | publik | URL absolut (OG, share) | Phase 1 |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publik | Baca + Realtime | Phase 2 |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | publik | AppKit; kosong → wallet nonaktif | Phase 4 |
| `NEXT_PUBLIC_RPC_ROBINHOOD`, `NEXT_PUBLIC_RPC_BASE`, `NEXT_PUBLIC_RPC_ARBITRUM` | publik | RPC klien (opsional). Bila kosong, dipakai URL RPC publik yang tercatat sebagai **data** di registry chain (`src/lib/chains`), bukan lewat pola `process.env.X \|\| '…'` [Usulan] | Phase 4 |
| `CHECK_RPC_ROBINHOOD`, `CHECK_RPC_BASE`, `CHECK_RPC_ARBITRUM` | server | RPC untuk XofN Check & indexer [Guide] | Phase 2 |
| `CHECK_DATABASE_URL` | server | [Guide] Koneksi cache Check. Di XofN diisi koneksi Postgres Supabase bila dibutuhkan; akses utama lewat Supabase client (P30) | Phase 2 (opsional) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Tulis cache/index | Phase 2 |
| `CRON_SECRET` | server | Proteksi `/api/cron/*` | Phase 2 |
| `FORK_RPC_ROBINHOOD`, `FORK_RPC_BASE`, `FORK_RPC_ARBITRUM` | Foundry | Fork test **read-only** | Phase 3 |
| `RH_TESTNET_RPC`, `RH_MAINNET_RPC`, `BASE_SEPOLIA_RPC`, `ARB_SEPOLIA_RPC`, `BASE_RPC`, `ARB_RPC` | deploy | [Guide] RPC deploy | **Phase 6–7, FROZEN** |
| `RH_BLOCKSCOUT_API`, `BASESCAN_API_KEY`, `ARBISCAN_API_KEY` | deploy | [Guide] verifikasi source | **FROZEN** |
| `SAFE_ADDRESS`, `CREATEX`, `DEPLOY_SALT` | deploy | [Guide] owner infra, factory CREATE3, salt | **FROZEN** |
| `CURVE_START_PRICE`, `GRADUATION_THRESHOLD_ETH`, `GRADUATE_CALLER_REWARD` | deploy | [Guide] parameter bonding (diputuskan owner: P8, P15) | **FROZEN** (di Phase 3 dipakai sebagai konstanta tes lokal) |

Aturan [Pola: Fademan + Guide]:
- `process.env` **hanya** dibaca di `src/lib/env.ts` (server, `server-only`) dan `src/lib/public-env.ts` (`NEXT_PUBLIC_*`).
- ESLint melarang `process.env` di file lain dan melarang pola `process.env.X || 'fallback'`.
- Env wajib yang hilang → error jelas saat startup.
- **Tidak ada private key di `.env`.** Key deployer memakai keystore Foundry [Guide] dan baru relevan di Phase 6 (FROZEN).
- `LZ_OFT_API_KEY` **tidak diperlukan** [Phase 0]: endpoint `/list` gratis tanpa key.

---

## 13. Batasan yang harus dijaga

1. 1-of-1 tidak pernah diizinkan, baik di kontrak, UI launch, maupun data demo (kecuali sebagai contoh "flagged" di Check).
2. Token adalah OFT sejak tahap 1. Owner/delegate = Graduator sampai ekspansi selesai. **Tidak ada renounce di tahap 1.**
3. Tidak ada status Locked tanpa `verify` on-chain di setiap chain.
4. Server tidak memegang key; tidak ada route yang menandatangani.
5. Alamat hanya dari `deployments/` → `addresses.ts`. Chain/EID hanya dari `src/lib/chains`. Tier/label hanya dari `config/`.
6. `quoteSend` dipanggil tepat sebelum `send`; dust dijelaskan.
7. Aturan klaim publik (`PRD.md` §4.3, termasuk klaim per tahap) berlaku untuk copy, OG image, metadata, dan README.
8. Phase 6–7 FROZEN total: tidak ada script deploy publik, `[etherscan]`/verifier, manifest jaringan publik, keystore, `--broadcast`, task devtools yang menulis, atau migrasi produksi.
9. Tidak ada logo atau nama produk LayerZero di branding; disclaimer wajib ada di footer.

---

## 14. Risiko teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Operator DVN brief/guide tidak tersedia di Robinhood (P1) | Tier tidak bisa dipasang di pathway mana pun | Kontrak membaca tier dari data (`config/tiers.json`); tes memakai DVN mock sampai PM memilih operator |
| Tiga konteks WebGL (hero, arch, galaxy) di satu halaman | Memori/GPU tinggi, konteks hilang di mobile | Render hanya saat terlihat; galaxy dimatikan di mobile (D5); quality governor; fallback |
| Kebocoran WebGL saat navigasi App Router | Memori naik tiap navigasi | Dispose lengkap + uji navigasi bolak-balik (`CLAUDE.md` §10) |
| GSAP pinned + Lenis bentrok dengan layout RSC | Jitter, posisi trigger salah | `ScrollTrigger.refresh()` setelah font/gambar siap; satu instance Lenis |
| Biaya dan rate limit RPC / OFT API; RPC publik Robinhood dibatasi | Check lambat atau gagal | Cache + TTL, multicall (viem `multicall`), batasi pathway per request, provider berbayar di produksi (P21) |
| `getConfig` efektif vs app config salah dibaca | Label salah, padahal produk menjual angka | Fork test pembanding + 20 OFT manual (gerbang Phase 2) |
| Gas `verify()` multi-EID | Tidak bisa dipanggil kontrak lain | `verifyEid` per pathway |
| Foundry + Next di satu root | Konflik tooling (ESLint/TS menyentuh `contracts/`, `test/`) | Ignore eksplisit di ESLint/tsconfig; `test/` vs `tests/` terpisah |
| Hardhat devtools menambah dependency berat | Install lambat, konflik versi | Hanya devDependency untuk inspeksi; butuh persetujuan |
| Integrasi lokal multi-chain (Phase 4) | Sulit mensimulasikan DVN/executor di Anvil | §15 butir 6 |

---

## 15. Hal yang belum diverifikasi

Butir 1–5, 7, dan 8 diverifikasi di Phase 0 (17 Nov 2026). Bukti: `proof/2026-11-17-phase0/`.

1. ~~EID Robinhood mainnet/testnet; EID Base/Arbitrum dan testnet~~ — **terverifikasi** (§4).
2. ~~Ketersediaan DVN per pathway (P1)~~ — **terverifikasi**: Google Cloud dan Polyhedra tidak ada di Robinhood; Polyhedra deprecated di Base dan Arbitrum; Labs, DT, FCAT tersedia di ketiganya. Pemilihan operator pengganti: owner/PM (P1).
3. ~~Versi paket `@layerzerolabs/*`; dukungan cancun di Robinhood~~ — **terverifikasi** (§1.2).
4. ~~Ketersediaan CreateX di Robinhood Chain~~ — **terverifikasi** (§1.2).
5. ~~Semantik `getConfig` dan nilai 0 di ULN (P5); `CONFIG_TYPE_*`; alamat dead DVN~~ — **terverifikasi** (§7).
6. Cara integrasi lokal multi-chain untuk Phase 4. Opsinya: beberapa instance Anvil + relayer lokal sederhana, atau mode simulasi yang memutar event hasil `TestHelperOz5`. [Usulan] Mulai dari mode simulasi; putuskan di akhir Phase 3.
7. OFT API LayerZero — endpoint dan auth **terverifikasi** (§7). Rate limit tetap [Belum].
8. ~~AMM di ketiga chain (P9)~~ — **terverifikasi**: Uniswap v2, v3, v4 ada di Robinhood, Base, dan Arbitrum. Antarmuka compose mengikuti keputusan P2/P9.
9. Perbedaan API three r170 (HTML) → ≥ r184 (npm), misalnya `OutputPass`, `RoomEnvironment`, dan clipping. Cek saat port.
10. Pola URL halaman LayerZero Scan untuk `scan.ts` (situs web merespons 429 saat diperiksa). Cek di Phase 2. API Scan bisa dibaca tanpa key: `https://scan.layerzero-api.com/v1/messages/{guid|tx|oapp|pathway}/…` (spesifikasi di `/v1/openapi`) [pelengkap Phase 0].
11. `block.number` di Arbitrum dan Robinhood adalah perkiraan blok L1. Batas ukuran kode Robinhood 96 KB. Biaya = gas L2 + data L1.
12. Urutan state machine §5.3 (resep sebelum likuiditas): keputusan P28 harus tercatat sebelum Phase 3 dimulai.
13. Pelengkap guide §4.2: default config **mainnet** keenam arah sudah dibaca lewat `cast call` di Phase 0 (setara `lz:oapp:config:get:default`; `proof/2026-11-17-phase0/02-dvn-pathways.md`). ~~Default config dan `dstConfig` DVN testnet, serta contoh transaksi di LayerZero Scan~~ — **terverifikasi** (`proof/2026-11-17-phase0-addendum/notes.md`). Catatan: default testnet = 1 DVN LayerZero Labs (bukan Dead DVN), jadi tes testnet tanpa konfigurasi eksplisit tidak gagal seperti di mainnet; `nativeCap` dari Robinhood testnet = 0.
14. ~~Pelengkap P2: USDG/USDT0/USDe sebagai OFT dan peer-nya ke/dari Robinhood~~ — **terverifikasi**: tidak ada rute OFT langsung Robinhood↔Base/Arbitrum; USDe dan USDG lewat Ethereum, USDT0 tidak ada di Robinhood.
15. Foundry: v1.8.3 terpasang di mesin dev; v1.8.x tertinggi v1.8.7; rilis terbaru v1.9.0.

### Versi yang dipin saat inisialisasi (Phase 1, 17 Nov 2026)

Versi exact ada di `package.json`. Selisih dari baseline §1.1 atau dari rilis terbaru:

| Paket | Dipin | Catatan |
|---|---|---|
| `next`, `eslint-config-next` | 16.4.6 | Baseline 16.3.x; 16.4.6 adalah rilis stabil terbaru |
| `react`, `react-dom` | 19.3.1 | Baseline 19.2.x |
| `typescript` | 5.9.3 | Rilis terbaru 7.0.2 **tidak dipakai**: baseline `^5.7`, dan kompatibilitasnya dengan `typescript-eslint` belum diperiksa |
| `eslint` | 9.39.5 | Rilis terbaru 10.x tidak dipakai (baseline `^9.17`) |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.3 | 4.3.4+ butuh Node ≥ 22.12 (`require()` atas `magic-string` ESM-only); mesin dev memakai Node 22.11 |
| `vitest` | 4.1.12 | Vitest 5 butuh Node ≥ 22.12 |
| `three`, `@types/three` | 0.187.0 | Baseline `^0.184` |
| `gsap` / `lenis` | 3.15.1 / 1.3.27 | Baseline `^3.13` / `^1.1` |

Paket tipe (`@types/node`, `@types/react`, `@types/react-dom`, `@types/three`) ditambahkan sebagai devDependency pendukung TypeScript. `vitest.config.mts` memakai ekstensi `.mts` karena `package.json` tidak ber-`"type": "module"`. Bila Node di mesin dev dinaikkan ke ≥ 22.12, Tailwind dan Vitest bisa dinaikkan ke rilis terbaru.
16. Versi Hardhat + `@layerzerolabs/toolbox-hardhat` yang kompatibel dengan layout Foundry-root + Next. Hanya relevan bila PM mensyaratkan keluaran task devtools; pembacaan `cast call` sudah setara.
17. Bentuk `deployments/local.json` untuk tiga chain simulasi (§10.3).
18. Desain CREATE3 untuk alamat token seragam yang tidak bisa didahului pihak lain (P39).
