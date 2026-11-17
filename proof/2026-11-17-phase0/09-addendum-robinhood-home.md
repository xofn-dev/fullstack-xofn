# 09 — Addendum: Phase 0 dibaca ulang dengan Robinhood sebagai home

- **Tanggal:** 17 Nov 2026
- **Pemicu:** `deployguide-xofn.md` (Deploy Guide v1.0 dari PM, 17 Nov 2026) mengubah home chain dari **Base** menjadi **Robinhood Chain**. Base dan Arbitrum menjadi chain ekspansi, dengan topologi hub lewat Robinhood.
- **Sifat pekerjaan:** pemetaan ulang data Phase 0 yang sudah ada (file 01–08 dan `raw/`). **Tidak ada pembacaan chain baru, transaksi, atau kode.**
- **Status:** menunggu persetujuan gerbang Phase 0 dan keputusan PM di §3.

---

## 1. Data Phase 0 yang tetap berlaku

| Topik | Fakta | Sumber |
|---|---|---|
| Chain ID / EID | Robinhood 4663 / **30416**; Robinhood testnet 46630 / **40451**; Base 8453 / 30184; Arbitrum 42161 / 30110; Base Sepolia 84532 / 40245; Arbitrum Sepolia 421614 / 40231 | `01-chains-eid.md` |
| EndpointV2 Robinhood | `0x6f475642a6e85809b1c36fa62763669b1b48dd5b`, **berbeda** dari Base/Arbitrum (`0x1a44076050125825900e736c501f859c50fe728c`). Guide §3 meminta pencocokan; hasilnya cocok dengan docs | `01-chains-eid.md` |
| CreateX | Ada di Robinhood (mainnet & testnet), Base, Arbitrum; bytecode identik | `06-robinhood-chain.md` |
| Cancun | Didukung di Robinhood kecuali `BLOBBASEFEE` | `06-robinhood-chain.md` |
| ULN semantics | 0 = default; `getConfig` = konfigurasi efektif; `CONFIG_TYPE_EXECUTOR = 1`, `CONFIG_TYPE_ULN = 2` | `03-uln-semantics.md` |
| Dead DVN | Default semua pathway ke/dari Robinhood = Dead DVN, jadi konfigurasi eksplisit wajib di kedua sisi | `02-dvn-pathways.md` |
| AMM | Uniswap v2/v3/v4 ada di ketiga chain | `04-amm-pair-asset.md` |
| lzRead | Robinhood **tidak** punya ReadLib1002 | `01-chains-eid.md` |
| Paket | Versi `@layerzerolabs/*` terbaru terkompilasi dengan solc 0.8.24 + cancun + OZ 5.6.1 | `05-packages.md` |

## 2. Data yang berubah makna karena Robinhood menjadi home

### 2.1 Pathway yang relevan
- Sebelumnya: Base↔Arbitrum dan Base↔Robinhood.
- **Sekarang (guide §4.2):** **Robinhood↔Base** dan **Robinhood↔Arbitrum**. Base↔Arbitrum tidak di-wire (hub).
- Tabel DVN di `02-dvn-pathways.md` sudah mencakup keenam arah, termasuk Robinhood→Base, Base→Robinhood, Robinhood→Arbitrum, dan Arbitrum→Robinhood. Jadi data tidak perlu dibaca ulang.

### 2.2 Tier DVN — dampak paling besar
| Operator (brief/guide) | Robinhood | Base | Arbitrum |
|---|---|---|---|
| LayerZero Labs | ada | ada | ada |
| Google Cloud | **tidak ada** | ada | ada |
| Polyhedra | **tidak ada** | deprecated | deprecated |
| Deutsche Telekom MMS | ada | ada | ada |
| FCAT | ada | ada | ada |

Karena **setiap** pathway XofN sekarang melewati Robinhood:
- `config/tiers.json` versi guide (Standard: `layerzero` + `googlecloud|polyhedra`; Fortress: `layerzero` + `googlecloud` + `polyhedra`) **tidak bisa dipenuhi di pathway mana pun**.
- Ini lebih berat daripada temuan awal. Saat Base menjadi home, pathway Base↔Arbitrum masih memenuhi Standard; dengan Robinhood sebagai hub, tidak ada satu pun pathway yang memenuhi.
- Opsional (Witness) DT MMS + FCAT tetap tersedia di semua pathway.
- Operator wajib pengganti dipilih dari 13 kandidat yang tersedia di ketiga chain (`02-dvn-pathways.md`). Secara teknis operator boleh berbeda per pathway. Rekomendasi developer: satu operator X yang **seragam** di kedua pathway, karena keduanya bertumpu di Robinhood dan itu lebih sederhana untuk dijelaskan dan diaudit.
- Kriteria guide §4.2 ditulis berbasis jumlah ("2 DVN wajib dari operator berbeda + 2 Witness" untuk Standard, 3 untuk Fortress). Menurut kriteria itu, kedua tier **terpenuhi** di mainnet pada Robinhood↔Base dan Robinhood↔Arbitrum. Yang tidak terpenuhi hanya nama operator di `tiers.json` guide.

### 2.3 Batas native drop (aset pasangan, P2)
Arah yang relevan sekarang berasal dari Robinhood (`raw/executor.txt`):

| Arah | `nativeCap` | `lzReceiveBaseGas` | `lzComposeBaseGas` |
|---|---|---|---|
| Robinhood → Base | **0,05 ETH** | 85 000 | 85 000 |
| Robinhood → Arbitrum | **0,24 ETH** | 1 | 1 |

- Native drop ke Base dibatasi 0,05 ETH per pesan. Opsi "native drop + Uniswap v2" hanya masuk akal bila likuiditas pasangan di Base sangat kecil.
- Stablecoin yang disebut guide:
  - **USDG**: ada di Robinhood dan Arbitrum, tidak tercatat di Base;
  - **USDT0**: tidak ada di Robinhood.
- **USDe** satu-satunya yang tercatat sebagai OFT di ketiga chain (`04-amm-pair-asset.md`). Rute USDe dari Robinhood belum diperiksa.

### 2.4 Testnet (relevan untuk Fase 2a, FROZEN)
- Dari lima operator brief, hanya **LayerZero Labs** yang ada di Base Sepolia, Arbitrum Sepolia, dan Robinhood testnet.
- Robinhood testnet punya 4 DVN: Labs, Paxos, Twinstake, Horizen.
- **Koreksi (review 17 Nov 2026):** Base Sepolia dan Arbitrum Sepolia **tidak** hanya punya Labs. Metadata LayerZero (`https://metadata.layerzero-api.com/v1/metadata`, dibaca 17 Nov 2026 10:03 UTC) mencatat DVN aktif non-lzRead:
  - Base Sepolia (6): Labs, Twinstake, Horizen, P2P, FurtherFP, Paxos;
  - Arbitrum Sepolia (11): termasuk Labs, Paxos, Twinstake, Horizen;
  - ada di **ketiga** testnet: **Labs, Paxos, Twinstake, Horizen**.
- Akibatnya, Standard bisa direplikasi di testnet secara **jumlah** (4 operator: 2 wajib + 2 opsional) tetapi tidak dengan operator mainnet (DT/FCAT tidak ada). Fortress butuh 5 operator dan **tidak** bisa direplikasi. `dstConfig` DVN testnet belum dibaca on-chain. PM perlu menetapkan konfigurasi tier khusus testnet (P32).
- Verifikasi guide §7.4 ("Standard → `requiredDVNCount = 2`, operator wajib berbeda, `optionalDVNCount = 2`, `optionalDVNThreshold = 1`") dengan demikian bisa dipenuhi secara bentuk untuk Standard, dengan operator yang berbeda dari mainnet.
- Karena guide §5.2 mengunci DVN di constructor Graduator, keputusan P32 dibutuhkan sebelum Fase **1a** (P36).

### 2.5 Keputusan terbuka yang terselesaikan oleh guide
| # | Sebelumnya | Sekarang |
|---|---|---|
| P13 | Opsi A (Registry per chain + ack) direkomendasikan, belum diputuskan | **Terselesaikan:** guide §7.1 memasang `XofNRegistry` lokal di setiap chain ekspansi |
| P29 | Mesh penuh vs hub | **Terselesaikan:** hub lewat Robinhood (guide hanya mencantumkan Robinhood↔Base dan Robinhood↔Arbitrum) |

### 2.6 Keputusan yang tetap terbuka
| # | Isi | Catatan |
|---|---|---|
| P28 | Resep (library/ULN/executor/options/peer) harus dipasang **sebelum** likuiditas dikirim | Guide §7.3 masih menaruh resep setelah `send` + compose. Tanpa peer dan ULN eksplisit, `send` revert `NoPeer` atau pesan macet di Dead DVN |

## 3. Daftar keputusan untuk PM (ringkas)

1. **P1 — operator DVN wajib pengganti:** X (slot ke-2, Standard) dan Y (slot ke-3, Fortress), dari 13 kandidat. Phase 3a tetap bisa jalan dengan DVN mock.
2. **P28 — urutan ekspansi:** setujui "resep sebelum likuiditas".
3. **P2 — aset pasangan:** native drop (batas ke Base 0,05 ETH), pool satu sisi Uniswap v3, atau stablecoin. USDG/USDT0 di guide tidak tersedia lengkap di ketiga chain.
4. **P32 — tier testnet**, dibutuhkan sebelum Fase 1a (lihat §2.4).
5. **P36–P40** (ditambahkan saat review dokumen 17 Nov 2026, `PRD.md` §11): waktu keputusan vs Graduator immutable, letak daftar putih DVN, pathway infrastruktur (kunci vs Safe), alamat token seragam, dan ekonomi `expandAndLock`.
6. **P35 — konfirmasi arah chain:** chat PM 15 Nov merujuk post X LayerZero ("tunggu chain mereka"), yang isinya tidak bisa dibaca (HTTP 402). Guide 17 Nov menetapkan Robinhood. Mohon konfirmasi bahwa guide v1.0 final.

## 4. Tugas pelengkap Phase 0 (belum dikerjakan, read-only)

- [x] Guide §4.2 metode 2, **mainnet**: default library, default ULN, dan default executor config keenam arah sudah dibaca lewat `cast call` di Phase 0 (`02-dvn-pathways.md` bagian "Konfigurasi default pathway", `raw/chains-defaults.txt`, `raw/executor.txt`). Ini data yang sama dengan keluaran `lz:oapp:config:get:default`.
- [ ] Guide §4.2 metode 2, **testnet**: default config Robinhood testnet ↔ Base Sepolia / Arbitrum Sepolia, plus `dstConfig` DVN testnet. Dikerjakan dengan `cast call`; Hardhat + `@layerzerolabs/toolbox-hardhat` hanya bila PM mensyaratkan keluaran task devtools (butuh persetujuan dependency).
- [ ] Guide §4.2 metode 3: contoh transaksi OFT yang sudah ada di pathway Robinhood↔Base / Robinhood↔Arbitrum di LayerZero Scan (situs merespons 429 saat Phase 0).
- [ ] P2: konfirmasi USDG / USDT0 / USDe sebagai OFT beserta peer dari/ke Robinhood.
- [ ] Guide §4.1 dengan RPC guide (`RH_TESTNET_RPC`, `RH_MAINNET_RPC`): `cast code` + `eid()` sudah setara dengan pembacaan Phase 0 lewat RPC publik. Ulangi hanya bila PM meminta bukti dengan RPC tim.
