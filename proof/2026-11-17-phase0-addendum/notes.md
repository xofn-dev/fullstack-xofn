# Phase 0 — Pelengkap (read-only) untuk home Robinhood

- **Tanggal:** 17 Nov 2026 (semua sumber diakses UTC 10:13–10:27)
- **Branch:** `phase-0/addendum`
- **Lingkup:** tugas pelengkap di `proof/2026-11-17-phase0/09-addendum-robinhood-home.md` §4 dan `PRD.md` §9.1.
- **Sifat pekerjaan:** hanya `cast call` / `cast code` ke RPC publik dan GET ke API publik. Tidak ada transaksi, key, dependency, atau kode produk.
- **Status:** menunggu persetujuan gerbang Phase 0.

## Sumber

| # | Sumber |
|---|---|
| S1 | On-chain lewat RPC publik: Robinhood `https://rpc.mainnet.chain.robinhood.com`, Base `https://mainnet.base.org`, Arbitrum `https://arb1.arbitrum.io/rpc`, Ethereum `https://ethereum-rpc.publicnode.com`, Robinhood testnet `https://rpc.testnet.chain.robinhood.com`, Base Sepolia `https://sepolia.base.org`, Arbitrum Sepolia `https://sepolia-rollup.arbitrum.io/rpc` |
| S2 | Metadata LayerZero: `https://metadata.layerzero-api.com/v1/metadata` |
| S3 | OFT API: `https://metadata.layerzero-api.com/v1/metadata/experiment/ofts/list?symbols=USDT0,USDG,USDe` |
| S4 | LayerZero Scan API: `https://scan.layerzero-api.com/v1` (spesifikasi di `/v1/openapi`) |

## Indeks bukti

| File | Satu kalimat konteks |
|---|---|
| [raw/default-config.txt](raw/default-config.txt) | Default library, default ULN, default executor, dan `Executor.dstConfig` untuk Robinhood↔Base dan Robinhood↔Arbitrum di mainnet dan testnet, kedua arah. |
| [raw/lz-metadata-dvns-testnet.txt](raw/lz-metadata-dvns-testnet.txt) | Daftar DVN V2 di ketiga testnet menurut metadata LayerZero. |
| [raw/dvn-testnet.txt](raw/dvn-testnet.txt) | `dstConfig` empat operator bersama (Labs, Paxos, Twinstake, Horizen) di keempat arah testnet. |
| [raw/stable-peers.txt](raw/stable-peers.txt), [raw/stable-peers-extra.txt](raw/stable-peers-extra.txt) | `endpoint()`, `token()`, dan `peers()` USDe, USDG, USDT0 di Robinhood, Base, Arbitrum, Ethereum. |
| [raw/robinhood-oapp-peers.txt](raw/robinhood-oapp-peers.txt) | Pemindaian 84 OApp Robinhood: mana yang punya peer langsung ke Base atau Arbitrum. |
| [raw/scan-and-live-config.txt](raw/scan-and-live-config.txt) | Contoh pesan terkirim di pathway itu dari LayerZero Scan API, dan konfigurasi ULN yang dipakai tujuh OFT nyata. |

---

## 1. Default config per pathway (guide §4.2 metode 2)

Cara: `cast call` ke `EndpointV2.defaultSendLibrary/defaultReceiveLibrary/isSupportedEid`, `SendUln302/ReceiveUln302.getUlnConfig(address(0), eid)`, `SendUln302.getExecutorConfig(address(0), eid)`, dan `Executor.dstConfig(eid)`. Ini data yang sama dengan keluaran `lz:oapp:config:get:default`, tanpa memasang Hardhat.

### Mainnet (blok Robinhood 116499469, Base 58600358, Arbitrum 525005650)

| Arah | Default send ULN | Default receive ULN | Default executor | `nativeCap` |
|---|---|---|---|---|
| Robinhood → Base | 5 konfirmasi · 1 wajib: **Dead DVN** | 10 · Dead DVN | maxMessageSize 10 000 · executor Robinhood | 0,05 ETH |
| Base → Robinhood | 10 · **Dead DVN** | 5 · Dead DVN | 10 000 · executor Base | 0,301 ETH |
| Robinhood → Arbitrum | 5 · **Dead DVN** | 20 · Dead DVN | 10 000 · executor Robinhood | 0,24 ETH |
| Arbitrum → Robinhood | 20 · **Dead DVN** | 5 · Dead DVN | 10 000 · executor Arbitrum | 0,301 ETH |

Semua `isSupportedEid` = true, dan default library = SendUln302 / ReceiveUln302 setempat. Hasilnya identik dengan pembacaan Phase 0 (`proof/2026-11-17-phase0/raw/chains-defaults.txt`, 08:55 UTC).

### Testnet (blok Robinhood testnet 154467491, Base Sepolia 59943134, Arbitrum Sepolia 330065984)

| Arah | Default send ULN | Default receive ULN | `nativeCap` |
|---|---|---|---|
| Robinhood testnet → Base Sepolia | 1 konfirmasi · 1 wajib: **LayerZero Labs** | 2 · Labs | **0** |
| Base Sepolia → Robinhood testnet | 2 · Labs | 1 · Labs | 0,01 ETH |
| Robinhood testnet → Arbitrum Sepolia | 1 · Labs | 5 · Labs | **0** |
| Arbitrum Sepolia → Robinhood testnet | 5 · Labs | 1 · Labs | 0,01 ETH |

Semua `isSupportedEid` = true. `lzReceiveBaseGas` dan `lzComposeBaseGas` = 85 000 di keempat arah.

**Temuan:**
1. Mainnet dan testnet **berbeda sifat**: default mainnet adalah Dead DVN (pesan tidak akan terkirim tanpa konfigurasi eksplisit), sedangkan default testnet adalah satu DVN LayerZero Labs (pesan tetap terkirim dengan konfigurasi 1-of-1). Tes testnet yang lupa memasang konfigurasi tidak akan gagal, padahal di mainnet akan macet. Konfigurasi eksplisit tetap wajib di keduanya.
2. **Native drop dari Robinhood testnet ke Base Sepolia dan Arbitrum Sepolia dibatasi 0.** Opsi aset pasangan "native drop" tidak bisa diuji di Fase 2a.

## 2. DVN testnet (bahan P32)

Metadata LayerZero mencatat DVN aktif (bukan lzRead, tidak deprecated):
- Robinhood testnet (4): LayerZero Labs, Paxos, Twinstake (id `nethermind`), Horizen.
- Base Sepolia (6): Labs, Twinstake, Horizen, P2P, FurtherFP, Paxos.
- Arbitrum Sepolia (11): termasuk Labs, Paxos, Twinstake, Horizen.

Empat operator ada di ketiga testnet. Pembacaan `dstConfig(eid)` (blok Robinhood testnet 154467895, Base Sepolia 59943407, Arbitrum Sepolia 330066100):

| Operator | Robinhood testnet → Base Sepolia | Robinhood testnet → Arbitrum Sepolia | Base Sepolia → Robinhood testnet | Arbitrum Sepolia → Robinhood testnet |
|---|---|---|---|---|
| LayerZero Labs | gas 90 000 | 90 000 | 90 000 | 90 000 |
| Paxos | 90 000 | 90 000 | 90 000 | 90 000 |
| Twinstake | 90 000 | 90 000 | 90 000 | 90 000 |
| Horizen | 90 000 | 90 000 | 90 000 | 90 000 |

Alamat lengkap ada di `raw/dvn-testnet.txt`.

**Kesimpulan:** di testnet, tier **Standard bisa dipasang secara bentuk** (2 wajib + 1 dari 2 opsional = 4 operator) dengan empat operator ini. **Fortress tidak bisa** (butuh 5 operator berbeda; hanya 4 yang ada di ketiganya). Deutsche Telekom dan FCAT tidak ada di testnet, jadi susunan operator testnet pasti berbeda dari mainnet.

## 3. Stablecoin sebagai aset pasangan (P2)

| Aset | Robinhood | Base | Arbitrum | Peer yang terpasang |
|---|---|---|---|---|
| **USDe** | OFT `0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34` | OFT, alamat sama | OFT, alamat sama | Di ketiga chain, `peers()` hanya terisi untuk **Ethereum (30101)**. `peers(30416)`, `peers(30184)`, `peers(30110)` kosong |
| **USDG** | Token `0x5fc5360d0400a0fd4f2af552add042d716f1d168` + OFT `0x0d54755f5106bfdb43f7a35f5d49a23f940628d1` | **tidak ada** di metadata LZ maupun OFT API | Token `0x004b506865409877c9fa29bfb1eba929984b9bbc` + OFT `0xc3274ec3f772d8534575eaad5231cf250a48b6b6` | Robinhood dan Arbitrum masing-masing hanya ber-peer ke **Ethereum** (`0x147bde4f997f0d4c7544ed0c55eacf1e5e6bf9c4`) |
| **USDT0** | **tidak ada** | Varian Stargate `0xeab8fa7ab28f05d7600558b873d5c7f805412304`; `peers(30416)`, `peers(30110)`, `peers(30101)` kosong | Tiga OFT, semuanya ber-peer ke Ethereum saja | Tiga adapter USDT0 di Ethereum: `peers(30416)` kosong |

Di Ethereum: adapter USDe ber-peer ke Robinhood, Base, dan Arbitrum; adapter USDG `0x147bde…` ber-peer ke Robinhood dan Arbitrum (tidak ke Base).

**Kesimpulan:** tidak satu pun dari USDG, USDT0, atau USDe punya rute OFT **langsung** dari Robinhood ke Base atau ke Arbitrum.
- USDe: bisa sampai ke keduanya, tetapi lewat Ethereum (dua pesan per chain, ditambah gas Ethereum).
- USDG: hanya bisa sampai ke Arbitrum, lewat Ethereum. Tidak ada di Base.
- USDT0: tidak ada di Robinhood.

Opsi "stablecoin OFT" di guide §4.3 dengan demikian membutuhkan Ethereum sebagai perantara dan menambah chain keempat ke alur ekspansi. Ini memperkuat rekomendasi Phase 0 untuk tidak memakainya di MVP. Keputusan tetap milik owner (P2).

## 4. Transaksi OFT nyata di pathway (guide §4.2 metode 3)

Situs `https://layerzeroscan.com` masih merespons 429 terhadap `curl`. **API-nya bisa dibaca** tanpa key: `GET https://scan.layerzero-api.com/v1/messages/oapp/{eid}/{address}`.

**Pathway sudah dipakai di produksi.** Dari 84 OApp Robinhood yang tercatat di metadata LayerZero (blok 116503952): **36** punya peer langsung ke Base dan **16** ke Arbitrum.

Contoh pesan (40 pesan terakhir per OApp, semua berstatus DELIVERED):

| OApp di Robinhood | Arah | Jumlah | DVN yang memverifikasi |
|---|---|---|---|
| `0xa3d68b74…914b` (etherfi) | Base → Robinhood 31, Robinhood → Base 3 | 34 | Twinstake, Horizen, P2P, Labs (+1 alamat terpotong) |
| `0x0830a9dd…0c32` (degen) | Base → Robinhood 33, Robinhood → Base 7 | 40 | Twinstake, Horizen, Canary |
| `0x8f86a15e…2b79` (apecoin) | Robinhood → Arbitrum 9, Arbitrum → Robinhood 3 | 12 | Horizen, Labs, Canary (alamat sisi Arbitrum) |
| `0x79bbf450…e07c` (heyanon) | Base → Robinhood 4, Robinhood → Base 1 | 5 | Twinstake, Canary, Labs |

GUID dan hash transaksi ada di `raw/scan-and-live-config.txt`.

Konfigurasi send ULN efektif tujuh OFT nyata di Robinhood (delapan pembacaan, dari endpoint):

| OFT | Tujuan | DVN wajib | Opsional |
|---|---|---|---|
| etherfi | Base | 4: Twinstake, Horizen, P2P, Labs | 0 |
| degen | Base, Arbitrum | 3: Twinstake, Horizen, Canary | 0 |
| derive | Base | 3: Horizen, Canary, Labs | 0 |
| apecoin | Arbitrum | 3: Horizen, Canary, Labs | 0 |
| heyanon | Base | 3: Twinstake, Canary, Labs | 0 |
| ample | Arbitrum | 2: Twinstake, Labs | 0 |
| bankr | Base | 2: Twinstake, Labs | 0 |

Pemetaan alamat ke operator memakai metadata LayerZero untuk Robinhood: `0x0ffe02df…` Twinstake, `0x1258a278…` Horizen, `0x8ed0a851…` P2P, `0x8d77d356…` Canary, `0xd01ae690…` LayerZero Labs.

**Bacaan (fakta, bukan penilaian terhadap token mana pun):**
- Pesan di kedua pathway terkirim dengan konfigurasi 2 sampai 4 DVN wajib. Jadi tier berbasis jumlah bisa dijalankan di pathway Robinhood.
- Dalam sampel ini tidak ada yang memakai DVN opsional, Google Cloud, Deutsche Telekom, atau FCAT.
- Operator yang muncul berulang: LayerZero Labs, Twinstake, Horizen, Canary, P2P. Ini data pendukung untuk P1, bukan rekomendasi operator.
- Semua OFT dalam sampel masih punya owner dan delegate bukan nol, dan sebagian memakai library default.

## Status tugas pelengkap

| Tugas (`09-addendum` §4, `PRD.md` §9.1) | Status |
|---|---|
| Default config mainnet Robinhood↔Base/Arbitrum | Selesai (dibaca ulang; identik dengan Phase 0) |
| Default config testnet | **Selesai** |
| `dstConfig` DVN testnet | **Selesai** |
| Contoh transaksi di LayerZero Scan (metode 3) | **Selesai** lewat API Scan; situs web tetap 429 |
| USDG / USDT0 / USDe sebagai OFT + peer ke/dari Robinhood | **Selesai** |
| Guide §4.1 dengan RPC tim (`RH_TESTNET_RPC`, `RH_MAINNET_RPC`) | Tidak dikerjakan; setara dengan pembacaan RPC publik. Diulang hanya bila PM meminta |

## Yang gagal atau tetap `[Belum]`

| Hal | Keterangan |
|---|---|
| Halaman web LayerZero Scan | 429 terhadap `curl`; pola URL halaman pesan belum dipastikan. API Scan bisa dipakai |
| `lz:oapp:config:get:default` secara harfiah | Tidak dijalankan (butuh Hardhat + `@layerzerolabs/toolbox-hardhat`). Data yang sama dibaca dengan `cast call` |
| Fee native drop (apakah kena multiplier executor) | `ExecutorFeeLib` belum dibaca |
| Kemampuan nyata DVN testnet memverifikasi pesan | `dstConfig` hanya membuktikan DVN dikonfigurasi untuk EID tujuan; pengiriman nyata baru terbukti di Fase 2a (FROZEN) |
| Rute USDe/USDG lewat Ethereum: biaya dan konfigurasi DVN-nya | Tidak diperiksa; di luar kebutuhan bila stablecoin OFT tidak dipilih |

## Dampak ke keputusan PM

- **P1:** kriteria jumlah di guide §4.2 terbukti berjalan di pathway Robinhood (pesan nyata dengan 2–4 DVN wajib). Yang perlu diputuskan tetap nama operator pengganti.
- **P2:** stablecoin OFT butuh Ethereum sebagai perantara; native drop dari Robinhood dibatasi 0,05 ETH (Base) dan 0,24 ETH (Arbitrum) di mainnet, dan **0 di testnet**.
- **P32:** Standard bisa diuji di testnet dengan Labs, Paxos, Twinstake, Horizen; Fortress tidak. Default testnet 1-of-1 Labs, bukan Dead DVN.
- **P28:** tidak berubah.
