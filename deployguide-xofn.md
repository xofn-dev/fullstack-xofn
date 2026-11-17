# XofN — Deploy Guide

> *Never one of one.*
> Versi 1.0 · 17 Nov 2026 · Pegangan deploy untuk developer XofN. Baca bersama **XofN — Developer Brief**.

**Perubahan dari brief:** home chain XofN sekarang **Robinhood Chain**, bukan Base. **Base dan Arbitrum menjadi chain ekspansi** saat graduation. Semua bagian brief yang menyebut "Base (home)" dibaca sebagai "Robinhood Chain (home)".

Deploy dilakukan dalam dua fase:

| Fase | Jaringan | Isi |
|---|---|---|
| **1a** | Robinhood Testnet | XofNToken (OFT), bonding curve, graduation lokal, XofNRegistry, XofN Check |
| **1b** | Robinhood Chain mainnet | Launch dan graduation lokal. Token yang lulus **menunggu ekspansi**, belum dikunci. XofN Check dirilis publik. |
| **2a** | Robinhood Testnet + Base Sepolia + Arbitrum Sepolia | Ekspansi lzCompose, tier DVN, penguncian, `verify()` lintas chain |
| **2b** | Robinhood Chain + Base + Arbitrum One | Token yang sudah lulus diperluas, lalu dikunci |

**Aturan yang tidak boleh dilanggar:**
1. Token dideploy sebagai **OFT sejak fase 1**.
2. Selama bonding dan sampai ekspansi selesai, owner dan delegate token adalah **kontrak `XofNGraduator`**, bukan wallet orang.
3. **Jangan renounce atau menolkan delegate token di fase 1**, termasuk token yang sudah lulus graduation lokal.
4. Konfigurasi 1-of-1 ditolak di level kontrak. Tier yang tersedia hanya **Standard (2+1/2)** dan **Fortress (3+1/2)**.
5. Graduator dan composer **diaudit sebelum fase 1b**, karena keduanya memegang token selama bonding.

---

## 1. Prasyarat

| Tool | Versi minimum | Keterangan |
|---|---|---|
| Foundry (`forge`, `cast`) | terbaru stabil | Build, test, deploy, verifikasi |
| Node.js | 20 LTS | LayerZero devtools, frontend, indexer XofN Check |
| LayerZero devtools | terbaru | Task `lz:oapp:*` untuk inspeksi config |
| Safe{Wallet} | — | Owner kontrak infrastruktur (2-of-3) |
| PostgreSQL / Redis | — | Cache hasil XofN Check |

**Kunci deployer:** keystore Foundry, bukan private key di `.env`.

```bash
cast wallet import xofn-deployer --interactive
# lalu di setiap perintah: --account xofn-deployer
```

---

## 2. Struktur repo

```
xofn/
├─ contracts/
│  ├─ XofNToken.sol         # OFT, override renounceOwnership
│  ├─ XofNCurve.sol         # bonding curve di home chain
│  ├─ XofNGraduator.sol     # owner sementara token, graduate() + expandAndLock()
│  ├─ XofNRemote.sol        # OApp + composer di chain ekspansi (fase 2)
│  └─ XofNRegistry.sol      # tier per token + verify(token)
├─ script/
│  ├─ 01_DeployCore.s.sol
│  ├─ 02_TransferToSafe.s.sol
│  ├─ 10_DeployRemote.s.sol # fase 2
│  └─ 11_WireInfra.s.sol    # fase 2
├─ check/                   # indexer + API XofN Check
├─ deployments/
│  ├─ robinhood-testnet.json
│  ├─ robinhood.json
│  ├─ base-sepolia.json     # fase 2
│  ├─ arbitrum-sepolia.json # fase 2
│  ├─ base.json             # fase 2
│  └─ arbitrum.json         # fase 2
├─ config/
│  ├─ tiers.json            # Standard dan Fortress per pathway
│  └─ dvn-labels.json       # alamat DVN → nama operator, untuk XofN Check
├─ layerzero.config.ts
└─ proof/
```

**`deployments/<network>.json` adalah satu-satunya sumber alamat.**

```json
{
  "chainId": 0,
  "eid": 0,
  "endpointV2": "0x...",
  "contracts": {
    "XofNGraduator": "0x...",
    "XofNCurveImplementation": "0x...",
    "XofNRegistry": "0x...",
    "XofNRemote": "0x..."
  },
  "owner": "0xSAFE...",
  "deployBlock": 0,
  "verifiedSource": true
}
```

Format `config/tiers.json`:

```json
{
  "standard": { "badge": "XofN 2+1/2", "required": ["layerzero", "googlecloud|polyhedra"], "optional": ["dtmms", "fcat"], "optionalThreshold": 1 },
  "fortress": { "badge": "XofN 3+1/2", "required": ["layerzero", "googlecloud", "polyhedra"], "optional": ["dtmms", "fcat"], "optionalThreshold": 1 }
}
```

---

## 3. Jaringan

Semua alamat endpoint, EID, library, executor, dan DVN **wajib dikonfirmasi** dari halaman deployment LayerZero: https://docs.layerzero.network/v2/deployments/chains/robinhood, https://docs.layerzero.network/v2/deployments/chains/base.md, https://docs.layerzero.network/v2/deployments/chains/arbitrum.md. Nilai di bawah adalah titik awal.

| Jaringan | Fase | Peran | Chain ID | LayerZero EID | Explorer |
|---|---|---|---|---|---|
| Robinhood Testnet | 1a, 2a | Home | 46630 | cek docs | cek docs Robinhood |
| Robinhood Chain | 1b, 2b | Home | 4663 (konfirmasi) | cek docs | robinhoodchain.blockscout.com |
| Base Sepolia | 2a | Ekspansi | 84532 | 40245 (konfirmasi) | sepolia.basescan.org |
| Arbitrum Sepolia | 2a | Ekspansi | 421614 | 40231 (konfirmasi) | sepolia.arbiscan.io |
| Base | 2b | Ekspansi | 8453 | 30184 (konfirmasi) | basescan.org |
| Arbitrum One | 2b | Ekspansi | 42161 | 30110 (konfirmasi) | arbiscan.io |

`EndpointV2` di banyak chain EVM memakai alamat yang sama (mainnet `0x1a44076050125825900e736c501f859c50fE728c`, testnet `0x6EDCE65403992e310A62460808c4b910D972f10f`), tapi chain yang lebih baru bisa berbeda. Cocokkan dengan docs untuk Robinhood Chain.

### `.env.example`

```bash
RH_TESTNET_RPC=
RH_MAINNET_RPC=
BASE_SEPOLIA_RPC=
ARB_SEPOLIA_RPC=
BASE_RPC=
ARB_RPC=

RH_BLOCKSCOUT_API=https://robinhoodchain.blockscout.com/api/
BASESCAN_API_KEY=
ARBISCAN_API_KEY=

SAFE_ADDRESS=
CREATEX=0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed   # cek ada di setiap chain
DEPLOY_SALT=xofn-v1

# Parameter bonding (diputuskan owner)
CURVE_START_PRICE=
GRADUATION_THRESHOLD_ETH=
GRADUATE_CALLER_REWARD=

# XofN Check (server-only)
CHECK_DATABASE_URL=
CHECK_RPC_ROBINHOOD=
CHECK_RPC_BASE=
CHECK_RPC_ARBITRUM=
```

---

## 4. P0 — Verifikasi sebelum menulis script deploy

Catat hasilnya di `proof/<tanggal>-p0/notes.md`.

### 4.1 Endpoint dan EID Robinhood

```bash
cast code <ENDPOINT_V2> --rpc-url $RH_TESTNET_RPC | head -c 20
cast code <ENDPOINT_V2> --rpc-url $RH_MAINNET_RPC | head -c 20
cast call <ENDPOINT_V2> "eid()(uint32)" --rpc-url $RH_MAINNET_RPC
```

### 4.2 Tier DVN per pathway

Pathway yang dicek: **Robinhood ↔ Base** dan **Robinhood ↔ Arbitrum**, di testnet dan mainnet.

| Pertanyaan | Kalau tidak terpenuhi |
|---|---|
| Ada 2 DVN wajib dari operator berbeda + 2 Witness? (Standard) | Ekspansi ke chain itu ditunda |
| Ada 3 DVN wajib dari operator berbeda + 2 Witness? (Fortress) | Fortress tidak ditawarkan untuk chain itu, dan UI menjelaskan alasannya |

Cek dengan tiga cara:
1. https://docs.layerzero.network/v2/developers/evm/technical-reference/dvn-addresses
2. `npx hardhat lz:oapp:config:get:default`
3. Transaksi OFT yang sudah ada di pathway itu di LayerZero Scan

### 4.3 Likuiditas di chain ekspansi

- AMM di Robinhood Chain, Base, dan Arbitrum (router, factory, versi V2/V3/V4).
- **Aset pasangan pool di chain ekspansi.** OFT hanya mengirim token XofN. Bandingkan:
  - Native drop ETH lewat executor option (cek batas jumlahnya)
  - Stablecoin OFT di kedua chain (misalnya USDG atau USDT0, kalau tersedia)
  - Pool satu sisi
- Keputusan akhir di tangan owner. Catat biaya dan risikonya di `notes.md`.

### 4.4 lzRead (untuk fase P6, bukan blocker)

Apakah Robinhood Chain didukung ReadLib1002? Kalau belum, graduation lintas chain dengan lzRead di P6 harus menunggu atau dijalankan dari chain lain yang didukung.

### 4.5 Infrastruktur pendukung

```bash
cast code $CREATEX --rpc-url $RH_MAINNET_RPC | head -c 20
```

- `UlnBase.sol`: apakah nilai `0` berarti default? Kalau iya, isi semua field eksplisit.

---

## 5. Fase 1a — Robinhood Testnet

### 5.1 Build dan test lokal

```bash
forge build
forge test -vvv
forge test --match-contract Invariant -vvv
```

Tes wajib di fase ini:
- Supply 999M di curve, tidak ada mint lain.
- `graduate()` gagal sebelum ambang, hanya bisa sekali.
- Tidak ada pihak selain Graduator yang bisa memanggil fungsi owner/delegate token.
- Graduator tidak punya fungsi di luar jalur graduation dan ekspansi.
- `XofNRegistry.verify(token)` mengembalikan `false` selama token belum terkunci.

Tes ekspansi dan composer dijalankan dengan mock endpoint LayerZero.

### 5.2 Deploy inti

```bash
forge script script/01_DeployCore.s.sol \
  --rpc-url $RH_TESTNET_RPC \
  --account xofn-deployer \
  --broadcast \
  --verify --verifier blockscout --verifier-url <RH_TESTNET_BLOCKSCOUT_API>
```

Urutan di dalam script (semua lewat CreateX + `DEPLOY_SALT`):
1. `XofNRegistry`
2. `XofNCurve` implementation
3. `XofNGraduator` dengan parameter: endpoint, router AMM, registry, `config/tiers.json` (alamat DVN dikunci di constructor)
4. Tulis alamat ke `deployments/robinhood-testnet.json`

### 5.3 Smoke test

```bash
# Setelah launch satu token dan membeli sampai ambang
cast call $TOKEN "totalSupply()(uint256)" --rpc-url $RH_TESTNET_RPC                    # 999000000e18
cast call $TOKEN "owner()(address)" --rpc-url $RH_TESTNET_RPC                          # = XofNGraduator
cast call $ENDPOINT "delegates(address)(address)" $TOKEN --rpc-url $RH_TESTNET_RPC     # = XofNGraduator
cast call $REGISTRY "verify(address)(bool,uint8,uint32[])" $TOKEN --rpc-url $RH_TESTNET_RPC   # false selama belum terkunci
```

- Badge tampil sebagai `XofN 2+1/2 · Bonding`.
- Setelah `graduate()`: pool di Robinhood Testnet terbentuk, status berubah menjadi `XofN 2+1/2 · Lulus, menunggu ekspansi`.
- XofN Check: periksa 3 OFT yang sudah ada di testnet atau mainnet (bisa token publik) dan bandingkan dengan pembacaan manual `getConfig`.

### 5.4 Ownership infrastruktur ke Safe

```bash
forge script script/02_TransferToSafe.s.sol --rpc-url $RH_TESTNET_RPC --account xofn-deployer --broadcast
cast call $REGISTRY "owner()(address)" --rpc-url $RH_TESTNET_RPC   # = SAFE_ADDRESS
```

Safe hanya mengelola daftar label DVN dan daftar putih untuk token **baru**. Safe tidak bisa menyentuh token yang sudah ada.

**Gerbang 1a → 1b:** semua tes lulus, smoke test lulus, audit eksternal selesai (Graduator, curve, registry, composer), tidak ada temuan critical/high terbuka.

---

## 6. Fase 1b — Robinhood Chain mainnet

1. **Rilis XofN Check lebih dulu** (hanya membaca data, tidak perlu kontrak) untuk membangun audiens.
2. Ulangi 5.2 dengan `--rpc-url $RH_MAINNET_RPC` dan `--verifier-url $RH_BLOCKSCOUT_API`.
3. Pindahkan ownership infrastruktur ke Safe mainnet.
4. Verifikasi source di https://robinhoodchain.blockscout.com, update `deployments/robinhood.json` dan `/contracts`.
5. Launch terbatas. Token yang lulus graduation lokal berstatus **"Lulus, menunggu ekspansi"**.
6. Simpan output smoke test token mainnet pertama di `proof/`.

**Klaim fase 1b:** "Live on Robinhood Chain", "Check any OFT's X-of-N", "Built on LayerZero OFT". **Belum boleh:** "Omnichain", "Every XofN token: 2+ DVNs, owner 0, delegate 0".

**Gerbang 1b → 2a:** P0 4.2 dan 4.3 selesai dengan keputusan owner soal aset pasangan, dan minimal satu token mainnet lulus graduation lokal tanpa insiden.

---

## 7. Fase 2a — Omnichain testnet (Robinhood Testnet + Base Sepolia + Arbitrum Sepolia)

### 7.1 Deploy `XofNRemote` di chain ekspansi

```bash
forge script script/10_DeployRemote.s.sol --rpc-url $BASE_SEPOLIA_RPC --account xofn-deployer --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
forge script script/10_DeployRemote.s.sol --rpc-url $ARB_SEPOLIA_RPC  --account xofn-deployer --broadcast --verify --etherscan-api-key $ARBISCAN_API_KEY
```

- `XofNRemote` (OApp + composer) dan `XofNRegistry` lokal di setiap chain ekspansi.
- Alamat harus **sama** dengan di Robinhood Testnet. Cek manual.

### 7.2 Wire infrastruktur

```bash
forge script script/11_WireInfra.s.sol --rpc-url <setiap chain> --account xofn-deployer --broadcast
```

Pasangan Graduator (Robinhood) ↔ `XofNRemote` (Base, Arbitrum), di kedua arah, dengan **tier Fortress** untuk pesan infrastruktur:
1. Library eksplisit
2. ULN config (alamat DVN diurutkan naik)
3. Executor config
4. Enforced options: gas `lzReceive` (deploy token) **dan** `lzCompose` (buat pool)
5. Peer

Ownership dan delegate infrastruktur ke Safe.

```bash
npx hardhat lz:oapp:config:get --oapp-config layerzero.config.ts
```

### 7.3 Ekspansi dan penguncian satu token yang sudah lulus

1. Panggil `XofNGraduator.expandAndLock(token)` dari UI. Pemanggil membayar biaya hasil `quoteSend`.
2. Untuk setiap chain ekspansi (Base Sepolia, Arbitrum Sepolia):
   1. Pesan deploy → `XofNRemote` men-deploy `XofNToken` di alamat yang sama.
   2. Graduator memanggil `send` + `composeMsg` berisi porsi token likuiditas. `XofNRemote` membuat **dan** mengisi pool di dalam satu panggilan `lzCompose`.
   3. Resep immutable sesuai tier token: library, ULN config, executor config, enforced options, peer.
3. Setelah semua chain terkonfirmasi: verifikasi on-chain, lalu `setDelegate(address(0))` dan `renounceOwnership()` di setiap chain.
4. Kalau satu chain gagal: `retryRemote(eid)` dengan parameter yang sama. Token tidak boleh tampil "Terkunci" sebelum semua chain selesai.
5. `XofNRegistry` mencatat token sebagai **Terkunci** dengan tier final.

### 7.4 Verifikasi penguncian (setiap chain, setiap pathway)

```bash
cast call $TOKEN "owner()(address)" --rpc-url $RPC                                   # 0x0
cast call $ENDPOINT "delegates(address)(address)" $TOKEN --rpc-url $RPC              # 0x0
cast call $ENDPOINT "isDefaultSendLibrary(address,uint32)(bool)" $TOKEN $DST_EID --rpc-url $RPC      # false
cast call $ENDPOINT "getReceiveLibrary(address,uint32)(address,bool)" $TOKEN $SRC_EID --rpc-url $RPC  # bool = false
cast call $ENDPOINT "getConfig(address,address,uint32,uint32)(bytes)" $TOKEN $SEND_LIB $DST_EID 2 --rpc-url $RPC  # ULN
cast call $ENDPOINT "getConfig(address,address,uint32,uint32)(bytes)" $TOKEN $SEND_LIB $DST_EID 1 --rpc-url $RPC  # executor
cast call $TOKEN "peers(uint32)(bytes32)" $DST_EID --rpc-url $RPC

# Hasil akhir yang dibaca publik
cast call $REGISTRY "verify(address)(bool,uint8,uint32[])" $TOKEN --rpc-url $RH_TESTNET_RPC   # true, tier, [EID Base, EID Arbitrum]
```

Decode ULN config: Standard → `requiredDVNCount = 2`; Fortress → `3`. Operator wajib berbeda, `optionalDVNCount = 2`, `optionalDVNThreshold = 1`.

### 7.5 Tes composer dan bridge

- [ ] `lzCompose` dari alamat selain endpoint ditolak.
- [ ] Coba front-run pembuatan pool di chain ekspansi: harus gagal atau tidak berpengaruh.
- [ ] Simulasikan `lzCompose` kehabisan gas: catat apa yang terjadi pada token, dan pastikan `retryCompose` aman.
- [ ] Bridge Robinhood ↔ Base dan Robinhood ↔ Arbitrum dua arah, dilacak di LayerZero Scan testnet.
- [ ] Total supply tetap 999M di ketiga chain.
- [ ] XofN Check menampilkan token ini hijau di semua pathway.

**Gerbang 2a → 2b:** 7.3–7.5 lulus, audit tambahan composer dan `expandAndLock` selesai.

---

## 8. Fase 2b — Omnichain mainnet (Robinhood Chain + Base + Arbitrum One)

1. Deploy `XofNRemote` di Base dan Arbitrum One (7.1), verifikasi source.
2. Wire dengan tier Fortress, serahkan ke Safe (7.2).
3. Ekspansi token mainnet pertama yang sudah lulus (7.3).
4. Jalankan seluruh 7.4 dan 7.5 di mainnet dan simpan output-nya di `proof/`.
5. Update semua file `deployments/*.json` dan `/contracts`.
6. Setelah `verify()` mengembalikan `true` untuk token pertama: klaim "Every XofN token: 2+ DVNs, owner 0, delegate 0" boleh dipakai.

---

## 9. Kalau terjadi masalah

| Situasi | Tindakan |
|---|---|
| Satu chain gagal saat `expandAndLock` | `retryRemote(eid)` dengan parameter sama. Token tetap "Menunggu ekspansi" sampai semua chain selesai. |
| `lzCompose` gagal, token sudah tiba tapi pool belum terbentuk | Jangan buat pool manual dari wallet tim. Jalankan `retryCompose` sesuai desain yang sudah diaudit. |
| Tier Fortress tidak tersedia di satu pathway | Jangan turunkan diam-diam. UI menjelaskan, creator memilih Standard atau menunda ekspansi ke chain itu. |
| `verify()` mengembalikan `false` untuk token yang tercatat terkunci | Insiden serius. Badge berubah merah otomatis, umumkan, investigasi. |
| Hasil XofN Check salah untuk token pihak lain | Perbaiki, tampilkan koreksi dengan waktu pengecekan baru, kabari tim token terkait. |
| Private key deployer bocor | Infrastruktur sudah di Safe. Rotasi wallet deployer. |

---

## 10. Bukti per milestone

Folder `proof/YYYY-MM-DD-<milestone>/` dengan `notes.md`.

- [ ] P0: endpoint, EID, tier per pathway, AMM, keputusan aset pasangan, status lzRead Robinhood
- [ ] 1a: alamat testnet + explorer + output smoke test + perbandingan XofN Check vs pembacaan manual
- [ ] 1b: XofN Check live + alamat mainnet + source terverifikasi + graduation lokal pertama
- [ ] 2a: tx ekspansi per chain + output `getConfig` + `verify()` = true + LayerZero Scan bridge
- [ ] 2b: sama dengan 2a, di mainnet

**Dilarang muncul di bukti:** private key, seed phrase, isi `.env`, kredensial RPC, dashboard admin.

---

**Referensi:** [OFT quickstart](https://docs.layerzero.network/v2/developers/evm/oft/quickstart) · [Composer overview](https://docs.layerzero.network/v2/developers/evm/composer/overview) · [OFT composing](https://docs.layerzero.network/v2/developers/evm/oft/composing) · [lzRead overview](https://docs.layerzero.network/v2/developers/evm/lzread/overview) · [Production DVN Configuration](https://docs.layerzero.network/v2/concepts/modular-security/production-dvn-configuration) · [DVN addresses](https://docs.layerzero.network/v2/developers/evm/technical-reference/dvn-addresses) · [Transfer ownership](https://docs.layerzero.network/v2/developers/evm/technical-reference/transfer-ownership) · [Uniform address](https://docs.layerzero.network/v2/developers/evm/tooling/uniform-address)
