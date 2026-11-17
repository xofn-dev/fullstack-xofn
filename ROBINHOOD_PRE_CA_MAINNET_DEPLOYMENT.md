# Robinhood Chain: Deploy Mainnet Sebelum CA Token Tersedia

### Playbook Reservasi Alamat Kontrak (Pre-CA Mainnet Deployment)

| | |
|---|---|
| **Versi** | 1.0 — 13 November 2026 |
| **Chain target** | Robinhood Chain mainnet (chain ID `4663`); rehearsal opsional di testnet (`46630`) |
| **Pembaca utama** | AI coding agent (Claude Code, OpenCode, Cursor, dll.) yang ditugaskan menyiapkan dan memandu deployment |
| **Pembaca kedua** | Operator manusia: pemegang wallet deployer, signer Safe, approver |
| **Status template kode** | Sudah dikompilasi dan diuji pada 13 Nov 2026 (Foundry 1.8.3, solc 0.8.24): 11 unit/fuzz test lulus, 2 fork test lulus dengan Safe v1.4.1 asli di fork mainnet 4663, dan gladi end-to-end 8 langkah lulus di Anvil fork 4663 |
| **Sifat** | Pola ini sudah pernah dijalankan di Robinhood Chain mainnet (reservasi + aktivasi). Dokumen ini bukan audit. Factory adalah kode baru yang harus di-review per proyek |

---

## 0. Cara memakai dokumen ini (wajib dibaca AI agent)

Kamu adalah agent yang ditugaskan membawa sebuah proyek dari "kontrak siap, CA token belum ada" sampai "kontrak live di mainnet dan terhubung ke aplikasi". Kerjakan dengan urutan berikut:

1. **Baca seluruh dokumen ini sekali**, terutama §1 (aturan mutlak) dan §7 (peta phase).
2. **Kerjakan Phase A (Discovery)**: pelajari repo proyek, lalu tulis `docs/deployment/DEPLOYMENT_PLAN.md` memakai template §10.1. **Jangan menulis kode kontrak sebelum plan disetujui manusia (Gate G1).**
3. Jalankan phase berikutnya satu per satu. Setiap phase punya bagian **Prasyarat**, **Langkah**, **Artefak**, **Kriteria selesai**, dan **Stop**.
4. Pada setiap **Gate** (G1–G5), berhenti. Laporkan status dengan format §1.3 dan tunggu persetujuan eksplisit.
5. Untuk langkah yang dilabeli **[MANUSIA]**: siapkan perintah lengkap dengan nilai yang sudah terisi, serahkan ke operator, tunggu sampai operator melaporkan hasil, lalu verifikasi sendiri secara read-only.
6. Simpan setiap bukti (tx hash, blok, output Verify) ke artefak yang ditentukan. Jangan hanya menyebutnya di chat.

Label yang dipakai di dokumen:

| Label | Arti |
|---|---|
| **[AGENT]** | Boleh dikerjakan agent sendiri: baca repo, tulis kode/test/dokumen, perintah read-only, dry-run tanpa key, test di fork lokal |
| **[MANUSIA]** | Hanya operator manusia: membuat wallet, memasukkan password, menandatangani, broadcast, mengisi env produksi |
| **[KEPUTUSAN]** | Butuh keputusan approver (manajemen/lead). Agent memberi rekomendasi, bukan memutuskan |
| **[ON-CHAIN]** | Fakta yang dibaca dari chain (sebutkan tanggal/blok) |
| **[MANUAL]** | Harus dicek manusia di browser (explorer, X resmi) |

---

## 1. Aturan mutlak

### 1.1 Agent DILARANG

1. Membaca, menampilkan, meminta, menyalin, atau menyimpan **private key, mnemonic, password keystore**, atau isi `.env*` yang berisi rahasia. Kalau user menempelkan salah satunya ke chat, hentikan pekerjaan, beri tahu bahwa wallet itu harus dianggap bocor dan dibuat ulang, dan jangan memakainya.
2. Menjalankan `--broadcast`, `cast send`, atau transaksi apa pun ke **mainnet 4663** atau **testnet 46630**. Broadcast hanya boleh ke Anvil lokal (`127.0.0.1`) yang dijalankan agent sendiri.
3. Menyetel `ALLOW_MAINNET_BROADCAST=1` di luar gladi fork lokal.
4. Memakai `--private-key` atau `DEPLOYER_PRIVATE_KEY` untuk mainnet, termasuk di perintah yang disiapkan untuk manusia. Mainnet hanya memakai `--account <keystore>` atau `--ledger`.
5. Mengarang alamat, tx hash, atau hasil. Setiap alamat harus berasal dari output script atau dibaca dari chain.
6. Mengubah source kontrak anak (escrow, splitter, dll.) demi pola ini. Yang ditambahkan hanya factory + script + test.
7. Memakai token sementara/placeholder di mainnet, atau mengarahkan aplikasi ke alamat yang statusnya masih **RESERVED**.
8. Melakukan commit/push, deploy aplikasi, migrasi database, atau mengubah env produksi tanpa diminta.
9. Melewati Gate atau menafsirkan diamnya user sebagai persetujuan.

### 1.2 Agent WAJIB

1. Menjalankan dry-run (tanpa `--broadcast`) sebelum setiap broadcast yang diserahkan ke manusia, dan memastikan output berlabel `MODE: DRY RUN`.
2. Mem-pin hasil dry-run ke broadcast (`EXPECTED_FACTORY_ADDRESS`, `SAFE_NONCE`), supaya broadcast batal sendiri bila keadaan berubah.
3. Menjalankan script Verify (read-only) setelah setiap broadcast, dan memakai statusnya (§6) apa adanya.
4. Menulis laporan per tahap (§10) berisi nilai yang dibaca dari chain, bukan dari ingatan.
5. Memakai bahasa status yang tepat (§6). "Reserved" bukan "deployed"; "deployed" bukan "live".

### 1.3 Format laporan di setiap Gate

```
GATE <id> — <nama>
Status       : SIAP / BELUM SIAP
Sudah selesai: <daftar + bukti (file/tx/blok)>
Belum / risiko: <daftar>
Butuh keputusan/aksi manusia: <daftar spesifik, dengan perintah siap jalan bila ada>
Rekomendasi  : <satu kalimat>
```

---

## 2. Ringkasan eksekutif

**Masalah.** Token proyek diluncurkan oleh tim terpisah (biasanya lewat launchpad), dan tim dev hanya menerima **contract address (CA)**, sering kali mepet jadwal. Kontrak inti (escrow, splitter, dsb.) menyimpan alamat token sebagai `immutable`, jadi tidak bisa di-deploy sebelum CA ada. Di sisi lain, alamat produksi ingin sudah pasti dan bisa diumumkan lebih dulu.

**Solusi.** Deploy **factory sekali-pakai** sekarang, dengan admin = **Safe multisig** (immutable). Alamat kontrak anak sudah pasti sejak factory ada: `CREATE(factory, 1)`, `CREATE(factory, 2)`, dst. Setelah CA datang, Safe memanggil `deploy(token, decimals, roles)` **satu kali**, dan semua kontrak anak tercipta di alamat pesanan, atomik, dengan token immutable.

**Biaya.** 3 transaksi mainnet (Safe, factory, aktivasi). Total gas sekitar 7 juta, tergantung ukuran kontrak anak: Safe ±0,3 jt, factory ±3–4 jt, aktivasi ±3 jt. Pada gas price ±0,02 gwei, totalnya kurang lebih **0,00015 ETH**.

**Alur singkat:**

```
Discovery → Keputusan(G1) → Wallet → Implementasi → Gladi → P1 Reservasi(G2)
   → [menunggu CA] → Validasi token(G3) → P2 Aktivasi(G4) → Integrasi app → Go-live(G5)
```

---

## 3. Konsep teknis

### 3.1 Kenapa alamat bisa dipesan

```
alamat CREATE = keccak256(RLP([sender, nonce]))[12:]
untuk 1 ≤ nonce ≤ 0x7f:  keccak256(0xd6 ‖ 0x94 ‖ sender(20 byte) ‖ nonce(1 byte))[12:]
```

- Alamat hanya bergantung pada **pembuat + nonce**. Argumen constructor, termasuk token, tidak ikut menentukan alamat.
- Kontrak baru mulai dengan nonce **1** (EIP-161). Factory hanya melakukan CREATE di `deploy()`, dengan urutan tetap. Jadi alamat anak #1 = `CREATE(factory, 1)`, anak #2 = `CREATE(factory, 2)`, dan seterusnya.
- `deploy()` yang revert ikut me-revert kenaikan nonce. Alamat pesanan **tidak pernah hangus** karena percobaan gagal.
- Alamat factory sendiri = `CREATE(deployer, nonce_deployer)`. Karena itu deployer harus wallet baru dengan nonce 0: tx #0 membuat Safe, tx #1 membuat factory.

### 3.2 Kenapa bukan alternatif lain

| Alternatif | Alasan tidak dipakai |
|---|---|
| Tunggu CA, lalu deploy biasa | Alamat baru diketahui setelah launch; tidak memenuhi tujuan |
| Token sementara/placeholder | Alamatnya bukan alamat produksi, wajib deploy ulang, dan token palsu di mainnet bisa dikira asli |
| Setter token sekali pakai (`setToken`) | Mengubah kontrak inti yang sudah diuji, sehingga seluruh uji harus diulang; menambah kuasa admin |
| Reservasi nonce EOA saja | Satu tx tak sengaja menggeser alamat. Kunci bocor berarti kode apa pun bisa ditaruh di alamat itu. Tidak ada bukti on-chain |
| CREATE2 biasa | Alamat bergantung pada initcode, padahal initcode memuat token |
| CREATE3 / CreateX | Tidak ada ikatan kode; Safe bisa menaruh kode apa pun. Boleh dijadikan cadangan |
| Proxy upgradeable | Admin permanen bisa mengganti logika dan menguras dana |

### 3.3 Properti keamanan factory (harus dipertahankan saat adaptasi)

| # | Properti | Cara |
|---|---|---|
| 1 | Admin = Safe, immutable | Constructor menolak 0, EOA, dan EOA ber-delegasi EIP-7702 |
| 2 | Hanya admin yang bisa memanggil `deploy()` | `msg.sender != admin → NotAdmin` |
| 3 | Sekali pakai | Flag `used` + lapisan kedua: alamat ≠ prediksi → `DeploymentMismatch` |
| 4 | Validasi token | Ada code, `totalSupply`/`balanceOf` menjawab, `decimals == expected`, bukan token denylist/factory/admin/alamat pesanan |
| 5 | Owner kontrak anak = Safe admin | `OwnerNotAdmin` |
| 6 | Validasi peran | ≠ 0, tidak saling konflik, tidak sama dengan token/factory/alamat pesanan |
| 7 | Hasil = prediksi, dan kontrak anak saling terikat | Assert setelah CREATE |
| 8 | Atomik | Satu transaksi; gagal berarti semuanya revert |
| 9 | Tidak ada fungsi lain | Tanpa setter, transfer admin, cancel, `receive`/`fallback`, `selfdestruct` |
| 10 | Factory tidak memegang peran atau dana di kontrak anak | Peran diteruskan langsung ke constructor anak |

---

## 4. Fakta Robinhood Chain yang relevan

Diverifikasi read-only pada November 2026. **Agent wajib mengecek ulang** dengan perintah di kolom terakhir sebelum memakainya.

| Item | Nilai | Cek ulang |
|---|---|---|
| Mainnet chain ID | `4663` | `cast chain-id --rpc-url $RPC` |
| Testnet chain ID | `46630` | idem |
| RPC publik mainnet | `https://rpc.mainnet.chain.robinhood.com` | Ada rate limit. Untuk produksi pakai provider (mis. Alchemy) |
| Explorer mainnet | `https://robinhoodchain.blockscout.com` | — |
| Explorer testnet | `https://explorer.testnet.chain.robinhood.com` | — |
| Jenis chain | Arbitrum Orbit (EVM, `evm_version = cancun` terbukti jalan) | — |
| `block.number` di kontrak/script | **Nomor blok L1**, bukan L2 | Ambil nomor blok L2 dari receipt atau explorer |
| Safe v1.4.1 SafeL2 singleton | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` | `cast codehash` = `0xb1f9…81ff` |
| SafeProxyFactory v1.4.1 | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` | codehash `0x50c3…3317` |
| CompatibilityFallbackHandler | `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99` | codehash `0x7c60…42f9` |
| Runtime SafeProxy 1.4.1 | codehash `0xd7d408eb…fb4c` (171 byte) | `cast codehash <safe>` |
| Safe{Wallet} UI untuk 4663 | **Tidak terbukti.** Pakai jalur CLI (script + `cast wallet sign`) | — |
| **EIP-7702 aktif** | Akun publik Anvil (`0xf39F…`, `0x7099…`, dll.) di mainnet berisi code delegasi sweeper `0xef0100…` | `cast code 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url $RPC` |
| API Blockscout mainnet | Diblokir Cloudflare (HTTP 403) untuk akses otomatis. `forge verify-contract` gagal, jadi verifikasi lewat UI | — |
| RPC publik | **Bukan archive node**; kadang mengembalikan receipt kosong | Jangan memakai `eth_getCode` historis; cari blok lewat event `Transfer` |
| Gas price (Nov 2026) | ±0,02 gwei | `cast gas-price --rpc-url $RPC` |
| Token launchpad | Token launchpad (mis. Pons) umumnya ERC-20 tanpa owner/mint/pause, dengan getter `launchFactory()`, `curve()`, `deployer()` | Validasi tetap wajib (§8 Phase H) |

---

## 5. Peran dan tanggung jawab

| Pihak | Tanggung jawab | Tidak boleh |
|---|---|---|
| **Approver** (manajemen/lead) | Keputusan arsitektur dan peran; go/no-go tertulis di G1, G2, G4, G5 | — |
| **Tim launch token** | Meluncurkan token, lalu mengirim **CA saja** | Tim dev tidak perlu meminta data lain; semuanya diturunkan dari chain |
| **Operator** (pemegang deployer) | Membuat wallet, mengisi ETH, broadcast T1/T2, menjadi executor tx aktivasi | Mengirim tx lain dari deployer sebelum T2 |
| **Signer Safe** (≥ 2 dari 3) | Memeriksa sendiri CA, peran, dan calldata; menandatangani `safeTxHash` | Menandatangani hash yang tidak mereka cek sendiri |
| **AI agent** | Discovery, plan, kode, test, gladi, dry-run, validasi read-only, laporan, menyiapkan perintah | Semua yang ada di §1.1 |

---

## 6. Model status alamat

| Status | Definisi | Klaim yang boleh | Klaim yang **dilarang** |
|---|---|---|---|
| **P0 Diprediksi** | Dihitung off-chain atau lewat simulasi | "Alamat hasil simulasi …" | "Alamat proyek sudah ada" |
| **P1 Reserved** | Factory live; `predicted*()` bisa dibaca on-chain; kontrak anak **tanpa code** | "Alamat X dikunci oleh factory F (cek `predictedX()`)" | "Sudah deploy", "kirim token ke sini" |
| **P2 Deployed** | `deploy()` sukses; code, token, dan peran sudah terpasang; Verify lulus | "Kontrak deployed dengan token T" | "App sudah live", "production-ready" |
| **P3 Terintegrasi** | App diarahkan ke alamat P2 dan lulus uji staging | "Staging lulus" | "Live untuk publik" |
| **P4 Aktif** | App produksi memakai kontrak ini; smoke test lulus | "Live" | "Sudah diaudit", kecuali memang sudah |

> ⚠️ Selama status masih **P1**, alamat kontrak anak **tidak boleh** dipasang di app/env, dan **tidak boleh** menerima token/ETH. Dana yang terkirim ke sana akan terkunci selamanya.

---

## 7. Peta phase dan gate

| Phase | Nama | Pelaksana | Tx mainnet | Output utama | Gate keluar |
|---|---|---|---|---|---|
| A | Discovery & plan | AGENT | — | `DEPLOYMENT_PLAN.md` | **G1** |
| B | Keputusan | KEPUTUSAN | — | Keputusan tertulis (di plan) | G1 |
| C | Wallet | MANUSIA (dipandu agent) | — | Keystore deployer + 3 owner; alamat tercatat | — |
| D | Implementasi | AGENT | — | Factory + script + test lulus | — |
| E | Gladi | AGENT | — | Gladi fork lulus; (opsional) rehearsal testnet | **G2** |
| F | P1 Reservasi | MANUSIA (agent menyiapkan + verifikasi) | **2** | Safe, factory, alamat anak RESERVED; laporan P1 | — |
| G | Masa tunggu | — | — | Pengumuman "reserved"; akses Safe terjaga | — |
| H | Validasi CA | AGENT | — | `TOKEN_VALIDATION.md` (GO/NO-GO) | **G3** |
| I | P2 Aktivasi | MANUSIA (agent menyiapkan + verifikasi) | **1** | Kontrak anak DEPLOYED; laporan P2 | **G4** (sebelum broadcast) |
| J | Integrasi app | AGENT (+ MANUSIA untuk env) | — | Branch integrasi; staging lulus | — |
| K | Go-live | MANUSIA | operasional | Smoke test; go/no-go | **G5** |

---

## 8. Detail per phase

### Phase A — Discovery & plan [AGENT]

**Tujuan:** memahami kontrak proyek dan menyusun rencana konkret.

**Langkah:**
1. Petakan kontrak di `contracts/src/**` (atau setara). Untuk setiap kontrak, catat:
   - parameter constructor;
   - mana yang menyimpan token sebagai `immutable`;
   - peran (owner, operator, arbiter, treasury, …) beserta batasannya (mis. `operator ≠ owner`);
   - dependensi antar-kontrak (mis. escrow perlu tahu alamat splitter, splitter perlu alamat escrow).
2. Tentukan **urutan CREATE**. Kontrak yang perlu alamat kontrak lain sebelum kontrak itu ada akan menerima **alamat prediksi**. Contoh: escrow (nonce 1) menerima alamat splitter = `CREATE(factory, 2)`.
3. Cari script deploy yang sudah ada, guard chain, dan test suite. Jalankan `forge build` dan `forge test` untuk baseline. Catat SHA-256 source kontrak anak (`shasum -a 256 src/*.sol`).
4. Petakan titik integrasi aplikasi: env var alamat, ABI, indexer (blok awal), key server untuk peran operasional.
5. Tulis `docs/deployment/DEPLOYMENT_PLAN.md` (template §10.1), termasuk daftar keputusan §8 Phase B dengan rekomendasi.

**Kriteria selesai:** plan lengkap; semua kontrak dan peran terpetakan; tidak ada asumsi tanpa label.
**Stop:**
- Kontrak tidak memakai token sebagai immutable. Pola ini mungkin tidak dibutuhkan; laporkan.
- Kontrak upgradeable. Butuh analisis terpisah.
- Lebih dari 127 kontrak anak (batas rumus RLP 1 byte). Praktis tidak pernah terjadi.

### Phase B — Keputusan [KEPUTUSAN] → Gate G1

Agent menyajikan keputusan berikut di plan, masing-masing dengan rekomendasi:

| ID | Keputusan | Rekomendasi default |
|---|---|---|
| K1 | Arsitektur pre-CA | Factory sekali-pakai (dokumen ini) |
| K2 | Admin factory = owner kontrak anak | Safe v1.4.1, 2-of-3, owner EOA polos |
| K3 | Peran ditentukan saat factory dibuat atau saat `deploy()` | Saat `deploy()`, supaya reservasi tidak menunggu keputusan peran |
| K4 | `expectedDecimals` sebagai parameter | Ya |
| K5 | Denylist token (token lama/placeholder yang pernah dipakai di repo atau env) | Ya, isi `DENIED_TOKENS`. **Pastikan** token proyek adalah kontrak baru, bukan token lama yang di-denylist |
| K6 | Rehearsal testnet sebelum mainnet | Disarankan. Bila dilewati, catat sebagai risiko yang diterima |
| K7 | Peran operasional (operator/server) | EOA baru khusus; key di env server (Sensitive) |
| K8 | Arbiter & treasury | Safe atau multisig lain. **Kunci arbiter tidak boleh di server** |
| K9 | Kapan dan di mana alamat reserved diumumkan | Setelah Verify P1 lulus, dengan label "reserved — not active, do not send tokens" |

**Gate G1:** approver menyetujui plan + K1–K9 secara tertulis.

### Phase C — Wallet [MANUSIA, dipandu AGENT]

Semua wallet adalah **keystore terenkripsi Foundry** (`~/.foundry/keystores/<nama>`), dipakai lewat `--account <nama>`. Agent hanya menerima **alamat publik**.

**Inventaris:**

| Keystore | Peran | Kapan | ETH |
|---|---|---|---|
| `<proyek>-mainnet-deployer` | T1 (Safe), T2 (factory), executor aktivasi. Tidak punya kuasa setelah P1 | Sebelum P1 | ±0,0005 |
| `<proyek>-mainnet-owner1..3` | Owner Safe (threshold 2) | Sebelum P1 | 0 |
| `<proyek>-mainnet-operator` | Peran operasional server | Menjelang P2 | ±0,001 sebelum go-live |
| *(bila K8 memilih EOA)* `<proyek>-mainnet-arbiter`, `-treasuryA`, … | Sesuai K8 | Menjelang P2 | 0 |
| *(opsional)* `<proyek>-tn-*` | Wallet testnet | Rehearsal | dari faucet |

Admin Safe **bukan** keystore. Safe adalah kontrak yang dibuat di T1.

**Langkah [MANUSIA]** (agent menyerahkan blok ini apa adanya):

```bash
foundryup && cast --version
cast wallet list                         # pastikan nama belum terpakai
P=<proyek>

# Membuat wallet: prompt password tersembunyi; hanya mencetak path + alamat (TANPA private key)
cast wallet new $P-mainnet-deployer
cast wallet new $P-mainnet-owner1
cast wallet new $P-mainnet-owner2
cast wallet new $P-mainnet-owner3

# Verifikasi password SEGERA (bukan nanti saat aktivasi)
cast wallet address --account $P-mainnet-owner1     # ulangi untuk setiap wallet

# Pastikan EOA polos, dan nonce deployer 0
RPC=https://rpc.mainnet.chain.robinhood.com
cast code  <alamat> --rpc-url $RPC       # harus 0x
cast nonce <deployer> --rpc-url $RPC     # harus 0
```

Aturan:
- **Jangan** memakai `cast wallet new` tanpa nama (mencetak private key), `--unsafe-password`, atau `cast wallet import --private-key` (masuk shell history).
- Gunakan password berbeda untuk setiap wallet, dan langsung simpan di password manager. Backup file keystore secara offline, **terpisah** dari password-nya.
- Owner Safe idealnya dipegang orang/perangkat berbeda, atau hardware wallet (`--ledger`). Kalau keempat keystore ada di satu laptop, multisig tidak melindungi apa pun.
- Owner Safe **wajib EOA polos**. Jangan aktifkan "smart account" / upgrade akun 7702 di wallet mana pun.
- Isi ETH hanya ke deployer. **Jangan ada tx keluar dari deployer** sebelum T2. Menerima ETH tidak menaikkan nonce.

**Operator key ke server (menjelang P2, [MANUSIA]):**
```bash
cast wallet new $P-mainnet-operator
cast wallet address --account $P-mainnet-operator
# Salin key langsung ke clipboard tanpa tampil di layar, tempel ke env hosting (Sensitive, Production)
cast wallet decrypt-keystore $P-mainnet-operator | awk '{print $NF}' | tr -d '\n' | pbcopy
pbcopy < /dev/null      # kosongkan clipboard setelah ditempel
```

**Artefak:** alamat (bukan key) tercatat di plan dan di `contracts/.env.mainnet` (di-ignore git; hanya RPC + alamat publik).
**Kriteria selesai:** semua wallet lolos `cast wallet address --account` dan `cast code == 0x`; nonce deployer 0; deployer berisi ETH.

### Phase D — Implementasi [AGENT]

**Langkah:**
1. Salin template §9 ke repo proyek. Sesuaikan:
   - import kontrak anak, struct `Roles`, dan urutan/argumen `new …` di `deploy()`;
   - assert pasca-deploy (binding, allowlist, token, owner);
   - getter di `_assertDeployed` (script Activate) dan salinan lokal di script Verify;
   - `SafeV141.isExposed()`: isi dengan alamat wallet yang pernah bocor (mis. wallet testnet yang password-nya pernah dibagikan).
2. **Jangan ubah source kontrak anak.** Pastikan SHA-256-nya sama dengan baseline Phase A.
3. Tambahkan test minimal berikut (template §9.8 sudah memuat sebagian besar):
   - prediksi alamat = rumus CREATE;
   - deploy mendarat di alamat pesanan dengan binding benar;
   - admin EOA ditolak, admin EOA ber-delegasi 7702 ditolak;
   - fuzz: non-admin ditolak;
   - `deploy()` kedua ditolak;
   - percobaan gagal (decimals salah) tidak memakai nonce, dan retry sukses di alamat sama;
   - token denylist, token tanpa code, owner ≠ admin, dan konflik peran ditolak;
   - **fork test dengan Safe v1.4.1 asli**: Safe 2-of-3 mengaktifkan factory dengan 2 tanda tangan; 1 owner sendirian ditolak.
4. Jalankan:
   - `forge build`
   - `forge test`
   - `forge test --profile ci` (fuzz ≥ 10.000)
   - `FORK_RPC_URL=https://rpc.mainnet.chain.robinhood.com forge test --match-contract Fork`
   - `forge coverage` untuk factory
   - Slither bila tersedia
5. Catat ukuran: runtime factory harus < 24.576 byte dan initcode < 49.152 byte (`forge build --sizes`). Factory memuat initcode semua kontrak anak, jadi kontrak anak yang besar bisa melampaui batas. Bila itu terjadi, laporkan; jangan mengakalinya diam-diam.

**Kriteria selesai:** semua test lulus; SHA-256 kontrak anak tidak berubah; ukuran di bawah batas.
**Stop:** test gagal yang membutuhkan perubahan kontrak anak; ukuran melebihi batas.

### Phase E — Gladi [AGENT] → Gate G2

1. **Gladi fork lokal (wajib):** jalankan `script/fork-rehearsal.sh` (template §9.9) terhadap RPC mainnet. Seluruh alur (T1 → T2 → Verify P1 → token uji → Activate dengan 2 tanda tangan → Verify P2) berjalan di Anvil. Log broadcast ditulis ke direktori sementara supaya tidak tertukar dengan bukti asli.
2. **Rehearsal testnet 46630 (bila K6 = ya) [MANUSIA]:** alur yang sama di testnet sungguhan + verifikasi Blockscout. Alamat Safe testnet deterministik lintas chain, jadi **jangan pernah** memakai alamat Safe testnet di mainnet.
3. Commit + tag kode factory/script (oleh manusia), atau catat SHA-256 setiap file di laporan.

**Gate G2 (izin reservasi mainnet):** gladi lulus, test lulus, wallet siap, approver memberi go tertulis untuk P1.

### Phase F — P1 Reservasi mainnet (2 tx) [MANUSIA; AGENT menyiapkan + verifikasi]

Siapkan env bersama (di shell operator):
```bash
cd contracts
export RPC=https://rpc.mainnet.chain.robinhood.com
export ROBINHOOD_MAINNET_RPC_URL=$RPC     # dipakai alias robinhood_mainnet di foundry.toml
export EXPECTED_CHAIN_ID=4663
DEPLOYER=<alamat deployer>; KS=<proyek>-mainnet-deployer
```

**T1 — Safe 2-of-3**
```bash
# [AGENT boleh] dry-run: cukup --sender, tanpa key
SAFE_OWNERS=<o1>,<o2>,<o3> SAFE_THRESHOLD=2 SAFE_SALT_NONCE=<angka unik> \
  forge script script/CreateSafe.s.sol --rpc-url $RPC --sender $DEPLOYER
# → catat "Predicted Safe"

# [MANUSIA] broadcast
ALLOW_MAINNET_BROADCAST=1 SAFE_OWNERS=<o1>,<o2>,<o3> SAFE_THRESHOLD=2 SAFE_SALT_NONCE=<sama> \
  forge script script/CreateSafe.s.sol --rpc-url $RPC --account $KS --sender $DEPLOYER --broadcast
```

**T2 — Factory**
```bash
# [AGENT boleh] dry-run → catat factory, Escrow (reserved), Splitter (reserved)
ADMIN_SAFE=<SAFE> DENIED_TOKENS=<t1>,<t2> \
  forge script script/DeployReservedDeployer.s.sol --rpc-url $RPC --sender $DEPLOYER

# [MANUSIA] broadcast; alamat factory dipin. JANGAN ada tx lain dari deployer di antara dry-run dan ini.
ALLOW_MAINNET_BROADCAST=1 ADMIN_SAFE=<SAFE> DENIED_TOKENS=<t1>,<t2> \
  EXPECTED_FACTORY_ADDRESS=<factory dari dry-run> \
  forge script script/DeployReservedDeployer.s.sol --rpc-url $RPC --account $KS --sender $DEPLOYER --broadcast
```
Bila `DENIED_TOKENS` kosong, hapus variabel itu dari kedua perintah.

**Verifikasi P1 [AGENT]**
```bash
FACTORY_ADDRESS=<factory> EXPECTED_ADMIN_SAFE=<SAFE> EXPECTED_ESCROW=<..> EXPECTED_SPLITTER=<..> \
  forge script script/VerifyReservedDeployer.s.sol --rpc-url $RPC
# Harus:
#   Factory:  DEPLOYED (code == this build, used() == false, nonce 1)
#   Escrow:   RESERVED - NOT DEPLOYED (no code)
#   Splitter: RESERVED - NOT DEPLOYED (no code)

cast compute-address $DEPLOYER --nonce 1 # = factory (bila Safe dibuat di nonce 0)
cast compute-address <factory> --nonce 1 # = Escrow reserved
cast compute-address <factory> --nonce 2 # = Splitter reserved
cast receipt <txhash> --rpc-url $RPC     # status 1, blok, gasUsed, effectiveGasPrice
```

**Verifikasi source Blockscout [MANUSIA via UI]:**
```bash
# [AGENT] buat file standard JSON input
forge verify-contract <factory> src/ReservedDeployer.sol:ReservedDeployer --chain 4663 \
  --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api \
  --compiler-version 0.8.24 --show-standard-json-input > docs/deployment/ReservedDeployer.standard-input.json
cast abi-encode "constructor(address,address[])" <SAFE> "[<t1>,<t2>]"   # constructor args (hapus 0x)
```
Di explorer: alamat → *Contract* → *Verify & Publish* → *Solidity (Standard JSON input)*, compiler `v0.8.24+commit.e11b9ed9`.

**Artefak:** `docs/deployment/P1_RESERVATION_REPORT.md` (§10.2) dan `ADDRESSES.md` (§10.5).
**Kriteria selesai:** Verify P1 lulus; laporan lengkap; alamat diumumkan dengan label reserved (K9).

### Phase G — Masa tunggu

- Setelah factory live, nonce deployer **tidak lagi memengaruhi** alamat pesanan.
- Jaga **akses Safe**: minimal 2 owner harus tetap bisa menandatangani. Uji `cast wallet address --account` berkala. Rotasi owner (`swapOwner`) bila ada keystore yang hilang atau bocor.
- Jangan pasang alamat reserved di app/env.
- Bila token batal: factory dibiarkan saja dan ditandai deprecated. Factory tidak menyimpan dana.

### Phase H — CA diterima & validasi token [AGENT] → Gate G3

Tim launch hanya mengirim CA. **Jangan meminta data lain**; semuanya diturunkan dari chain.

```bash
CA=<alamat token>
cast chain-id --rpc-url $RPC                                       # 4663
cast codesize $CA --rpc-url $RPC                                   # > 0
cast call $CA "name()(string)"          --rpc-url $RPC
cast call $CA "symbol()(string)"        --rpc-url $RPC
cast call $CA "decimals()(uint8)"       --rpc-url $RPC
cast call $CA "totalSupply()(uint256)"  --rpc-url $RPC
cast call $CA "owner()(address)"        --rpc-url $RPC             # revert = tanpa owner (baik)
# Bukan proxy: slot EIP-1967 implementation / beacon / admin harus 0
cast storage $CA 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc --rpc-url $RPC
cast storage $CA 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50 --rpc-url $RPC
cast storage $CA 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103 --rpc-url $RPC
cast call $CA "launchFactory()(address)" --rpc-url $RPC            # khusus token launchpad
cast codehash $CA --rpc-url $RPC
```

| Cek | Kriteria lolos |
|---|---|
| L1 Keberadaan | Ada code di 4663 |
| L2 Identitas | name/symbol sesuai proyek; cocok dengan pengumuman resmi (X/website) **[MANUAL]** |
| L3 Decimals/supply | Sesuai brief |
| L4 Sifat | Tanpa owner/mint/pause/blacklist/fee transfer; bukan proxy. Bila ada fungsi tambahan, baca source verified-nya |
| L5 Denylist | Bukan token di `DENIED_TOKENS` |
| L6 Kompatibilitas | Fork test terhadap token asli: alur inti (lock → release → split → burn/withdraw) berhasil; jumlah masuk tepat (tidak ada fee-on-transfer) |
| L7 Source verified | Cek di Blockscout **[MANUAL]**: `https://robinhoodchain.blockscout.com/token/<CA>?tab=contract` |
| L8 Tx launch | Explorer → alamat token → *Details*. Untuk token launchpad, *Creator* = kontrak launcher; cocokkan field *From* di tx tersebut. Cari blok launch lewat event `Transfer` pertama (RPC bukan archive) |

**Artefak:** `docs/deployment/TOKEN_VALIDATION.md` (§10.3) dengan kesimpulan GO/NO-GO.
**Gate G3:** GO dari sisi token, plus item [MANUAL] sudah dicentang manusia.

### Phase I — P2 Aktivasi (1 tx Safe) [MANUSIA; AGENT menyiapkan + verifikasi] → Gate G4

**Prasyarat:** G3 lulus; keputusan peran final (K7/K8); wallet operator sudah dibuat (Phase C); executor (deployer) punya ETH ±3 jt gas **plus cadangan**.

```bash
export FACTORY_ADDRESS=<factory> EXPECTED_ADMIN_SAFE=<SAFE> \
  TOKEN_ADDRESS=$CA TOKEN_EXPECTED_DECIMALS=<d> TOKEN_EXPECTED_SYMBOL=<SYM> \
  OPERATOR_ADDRESS=<..> ARBITER_ADDRESS=<..> TREASURY_A_ADDRESS=<..> TREASURY_B_ADDRESS=<..>

# 1. [AGENT] dry-run: validasi + simulasi deploy() sebagai Safe; cetak calldata + safeTxHash
forge script script/ActivateReservedDeployer.s.sol --rpc-url $RPC
```

**Gate G4:** serahkan ke approver dan setiap signer: CA, semua peran, alamat target, calldata, `safeTxHash`, dan Safe nonce. Setiap signer **memeriksa sendiri** sebelum menandatangani.

```bash
# 2. [MANUSIA] setiap signer, di perangkatnya sendiri (lokal, tanpa gas)
cast wallet sign --no-hash <safeTxHash> --account <proyek>-mainnet-owner2
cast wallet sign --no-hash <safeTxHash> --account <proyek>-mainnet-owner3      # atau --ledger

# 3. [AGENT boleh] dry-run dengan tanda tangan → harus "DRY RUN: execTransaction simulated ... NOT sent"
SAFE_SIGNATURES=<sig1>,<sig2> SAFE_NONCE=<nonce dari langkah 1> \
  forge script script/ActivateReservedDeployer.s.sol --rpc-url $RPC --sender $DEPLOYER

# 4. [MANUSIA] broadcast dari executor
ALLOW_MAINNET_BROADCAST=1 SAFE_SIGNATURES=<sig1>,<sig2> SAFE_NONCE=<sama> \
  forge script script/ActivateReservedDeployer.s.sol --rpc-url $RPC \
  --account <proyek>-mainnet-deployer --sender $DEPLOYER --broadcast

# 5. [AGENT] verifikasi
TOKEN_ADDRESS=$CA forge script script/VerifyReservedDeployer.s.sol --rpc-url $RPC
#   Factory:  DEPLOYED, USED
#   Escrow:   DEPLOYED (code == this build)
#   Splitter: DEPLOYED (code == this build), allowlisted, bound
```

Catatan:
- Tanda tangan **terikat** pada chain ID, alamat Safe, Safe nonce, dan calldata persis. Kalau salah satunya berubah, tanda tangan ulang.
- Tx yang gagal di RPC (mis. `insufficient funds`) tidak memakai Safe nonce. Isi ETH, lalu ulangi perintah yang sama dengan tanda tangan yang sama.
- Bila `deploy()` revert (mis. peran salah), nonce Safe tidak terpakai dan alamat pesanan tetap. Perbaiki input, dry-run ulang, lalu tanda tangan ulang.
- Verifikasi source kontrak anak di Blockscout lewat UI, sama seperti factory. Constructor args = argumen persis yang dipakai factory, termasuk alamat prediksi untuk dependensi.

**Artefak:** `docs/deployment/P2_ACTIVATION_REPORT.md` (§10.4); `ADDRESSES.md` diperbarui.

### Phase J — Integrasi aplikasi [AGENT; env oleh MANUSIA]

1. Kerjakan di **branch baru**.
2. Perbarui ABI dan alamat (env publik dan server). Cari alamat yang di-hard-code (`grep -rn 0x` di folder web3/indexer).
3. Indexer: blok awal = **blok tx P2** (nomor blok L2). Data pasar token mulai dari **blok launch token**. Hapus/reset data indexer milik kontrak lama sebelum indexer diarahkan ke kontrak baru. Ini perubahan database, jadi butuh persetujuan.
4. Key operator di env server hosting (Sensitive, Production). Key arbiter **tidak** di server. Key operator harus sama dengan peran operator di **semua** kontrak anak.
5. Preflight app: tolak berjalan bila alamat tidak punya code atau chain ID salah.
6. Uji staging dengan token asli dalam jumlah kecil, mencakup seluruh alur inti.

**Kriteria selesai:** staging lulus; diff hanya menyentuh integrasi.

### Phase K — Go-live [MANUSIA] → Gate G5

- [ ] Wallet operator berisi ETH (±0,001). Tanpa ETH, aksi server pertama akan gagal.
- [ ] Smoke test mainnet dengan token kecil: alur inti lengkap, split/burn sesuai.
- [ ] Kontrak lama (bila ada) ditutup: job/dana terbuka di-refund; tidak ada env yang masih mengarah ke alamat lama.
- [ ] Owner Safe yang hilang/bocor sudah dirotasi.
- [ ] Source semua kontrak "Verified" di explorer.
- [ ] **G5:** go/no-go tertulis dari approver.

---

## 9. Template kode (sudah diuji)

Struktur file yang diharapkan di proyek:

```
contracts/
├── foundry.toml
├── src/
│   ├── ReservedDeployer.sol          # BARU — factory (§9.2)
│   ├── Escrow.sol                    # kontrak anak proyek (TIDAK diubah)
│   └── Splitter.sol                  # kontrak anak proyek (TIDAK diubah)
├── script/
│   ├── SafeV141.sol                  # BARU — konstanta + check Safe + pengurut tanda tangan (§9.3)
│   ├── GuardedScript.sol             # BARU — DRY RUN vs BROADCAST + guard mainnet (§9.4)
│   ├── CreateSafe.s.sol              # BARU — T1 (§9.5)
│   ├── DeployReservedDeployer.s.sol  # BARU — T2 (§9.6)
│   ├── ActivateReservedDeployer.s.sol# BARU — P2 (§9.7)
│   ├── VerifyReservedDeployer.s.sol  # BARU — Verify P1/P2 (§9.8)
│   └── fork-rehearsal.sh             # BARU — gladi lokal (§9.10)
└── test/
    └── ReservedDeployer.t.sol        # BARU — unit + fuzz + fork Safe (§9.9)
```

`Escrow`/`Splitter` di template adalah **contoh dua kontrak anak**: escrow menerima alamat splitter sebagai `initialPayee` (allowlist), dan splitter menerima alamat escrow. Ganti dengan kontrak proyek. Untuk N kontrak anak, tambahkan `predictedX()` = `_createAddress(0x0N)` sesuai urutan `new`, dan sesuaikan script Verify agar mengecek nonce factory = N+1 setelah deploy.

Jangan lupa `forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts` bila belum ada.

### 9.1 `foundry.toml`

Pin compiler dan EVM, karena bytecode harus reproducible untuk verifikasi.

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.24"
evm_version = "cancun"
optimizer = true
optimizer_runs = 200
via_ir = false
remappings = ["@openzeppelin/=lib/openzeppelin-contracts/", "forge-std/=lib/forge-std/src/"]
```

Tambahkan juga alias RPC:
```toml
[rpc_endpoints]
robinhood_testnet = "${ROBINHOOD_TESTNET_RPC_URL}"
robinhood_mainnet = "${ROBINHOOD_MAINNET_RPC_URL}"
```

### 9.2 `src/ReservedDeployer.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// GANTI: import kontrak anak proyek. Source kontrak anak TIDAK diubah.
import { Escrow } from "./Escrow.sol";
import { Splitter } from "./Splitter.sol";

/// @title ReservedDeployer
/// @notice Factory sekali-pakai. Alamat kontrak anak dipesan sejak factory ini ada; kontraknya baru
/// dibuat (dengan token immutable) saat Safe memanggil `deploy()` setelah CA token tersedia.
/// @dev Alamat CREATE = f(pembuat, nonce). Nonce kontrak baru mulai dari 1 (EIP-161), dan satu-satunya
/// jalur CREATE di sini adalah `deploy()`: Escrow di nonce 1, lalu Splitter di nonce 2. `deploy()` yang
/// revert ikut me-revert kenaikan nonce, jadi retry tetap jatuh di alamat yang sama.
contract ReservedDeployer {
    // GANTI: sesuaikan dengan peran di constructor kontrak anak proyek.
    struct Roles {
        address operator; // EOA operasional (dipakai server)
        address arbiter; // penyelesai sengketa; jangan di server
        address owner; // WAJIB == admin (Safe)
        address treasuryA;
        address treasuryB;
    }

    /// @notice Satu-satunya pemanggil `deploy()`: Safe multisig. Immutable, tanpa transfer.
    address public immutable admin;
    /// @notice True setelah `deploy()` sukses. Percobaan yang revert membiarkannya false.
    bool public used;
    /// @notice Token yang tidak boleh dipakai (token lama / placeholder). Diisi sekali di constructor.
    mapping(address => bool) public deniedToken;

    event ReservedDeployerCreated(
        address indexed admin, address predictedEscrow, address predictedSplitter
    );
    event Deployed(
        address indexed escrow,
        address indexed splitter,
        address indexed token,
        uint8 decimals,
        Roles roles
    );

    error ZeroAddress();
    error AdminNotContract();
    error NotAdmin();
    error AlreadyUsed();
    error TokenNotAllowed();
    error TokenHasNoCode();
    error InvalidToken();
    error DecimalsMismatch();
    error OwnerNotAdmin();
    error RoleConflict();
    error InvalidRole();
    error DeploymentMismatch();

    constructor(address _admin, address[] memory _deniedTokens) {
        if (_admin == address(0)) revert ZeroAddress();
        if (!_isContract(_admin)) revert AdminNotContract();
        admin = _admin;
        for (uint256 i; i < _deniedTokens.length; ++i) {
            deniedToken[_deniedTokens[i]] = true;
        }
        emit ReservedDeployerCreated(_admin, predictedEscrow(), predictedSplitter());
    }

    function predictedEscrow() public view returns (address) {
        return _createAddress(0x01);
    }

    function predictedSplitter() public view returns (address) {
        return _createAddress(0x02);
    }

    /// @notice Membuat Escrow + Splitter di alamat pesanan, terikat ke `token` selamanya.
    /// Hanya admin, hanya sekali, atomik.
    function deploy(IERC20 token, uint8 expectedDecimals, Roles calldata r)
        external
        returns (Escrow escrow, Splitter splitter)
    {
        if (msg.sender != admin) revert NotAdmin();
        if (used) revert AlreadyUsed();
        used = true; // di-set sebelum external call; ikut ter-revert bila langkah apa pun gagal

        address escrowAddr = predictedEscrow();
        address splitterAddr = predictedSplitter();
        _validateToken(address(token), expectedDecimals, escrowAddr, splitterAddr);
        _validateRoles(r, address(token), escrowAddr, splitterAddr);

        // Urutan penting: Escrow (nonce 1) meng-allowlist alamat Splitter sebelum Splitter ada.
        escrow = new Escrow(token, r.operator, r.arbiter, r.owner, splitterAddr);
        splitter = new Splitter(token, escrow, r.operator, r.owner, r.treasuryA, r.treasuryB);

        if (
            address(escrow) != escrowAddr || address(splitter) != splitterAddr
                || address(splitter.escrow()) != escrowAddr
                || !escrow.isAllowedPayee(splitterAddr) || address(escrow.token()) != address(token)
                || address(splitter.token()) != address(token) || escrow.owner() != admin
                || splitter.owner() != admin
        ) revert DeploymentMismatch();

        emit Deployed(escrowAddr, splitterAddr, address(token), expectedDecimals, r);
    }

    /// @dev Menangkap kesalahan yang bisa dideteksi on-chain. Token ERC20 valid yang "bukan token
    /// proyek" TIDAK bisa dideteksi di sini; itu tugas verifikasi independen signer + simulasi fork.
    function _validateToken(address token, uint8 expectedDecimals, address a1, address a2)
        private
        view
    {
        if (token == address(0)) revert ZeroAddress();
        if (
            deniedToken[token] || token == address(this) || token == admin || token == a1
                || token == a2
        ) revert TokenNotAllowed();
        if (token.code.length == 0) revert TokenHasNoCode();
        if (!_returnsWord(token, abi.encodeCall(IERC20.totalSupply, ()))) revert InvalidToken();
        if (!_returnsWord(token, abi.encodeCall(IERC20.balanceOf, (address(this))))) {
            revert InvalidToken();
        }
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (!ok || ret.length < 32 || abi.decode(ret, (uint256)) != expectedDecimals) {
            revert DecimalsMismatch();
        }
    }

    function _validateRoles(Roles calldata r, address token, address a1, address a2)
        private
        view
    {
        if (
            r.operator == address(0) || r.arbiter == address(0) || r.owner == address(0)
                || r.treasuryA == address(0) || r.treasuryB == address(0)
        ) revert ZeroAddress();
        if (r.owner != admin) revert OwnerNotAdmin();
        if (r.operator == r.arbiter || r.operator == r.owner) revert RoleConflict();
        address[5] memory roles = [r.operator, r.arbiter, r.owner, r.treasuryA, r.treasuryB];
        for (uint256 i; i < roles.length; ++i) {
            address a = roles[i];
            if (a == token || a == address(this) || a == a1 || a == a2) revert InvalidRole();
        }
    }

    function _returnsWord(address target, bytes memory data) private view returns (bool) {
        (bool ok, bytes memory ret) = target.staticcall(data);
        return ok && ret.length >= 32;
    }

    /// @dev Kontrak sungguhan, bukan EOA ber-delegasi EIP-7702 (code = 0xef0100 || alamat, 23 byte).
    function _isContract(address a) private view returns (bool) {
        bytes memory code = a.code;
        if (code.length == 0) return false;
        if (code.length == 23 && code[0] == 0xef && code[1] == 0x01 && code[2] == 0x00) {
            return false;
        }
        return true;
    }

    /// @dev RLP([address(this), nonce]) untuk 1 <= nonce <= 0x7f.
    function _createAddress(bytes1 nonce) private view returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), address(this), nonce))
                )
            )
        );
    }
}
```

### 9.3 `script/SafeV141.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface minimal Safe v1.4.1.
interface ISafe {
    function VERSION() external view returns (string memory);
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
    function nonce() external view returns (uint256);
    function getStorageAt(uint256 offset, uint256 length) external view returns (bytes memory);
    function getModulesPaginated(address start, uint256 pageSize)
        external
        view
        returns (address[] memory array, address next);
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes32);
    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures
    ) external payable returns (bool success);
}

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
    function proxyCreationCode() external pure returns (bytes memory);
}

/// @notice Alamat + codehash kanonik Safe v1.4.1 (identik di Ethereum, Robinhood 4663 dan 46630;
/// dicek read-only November 2026) dan pemeriksaan Safe untuk script mainnet.
library SafeV141 {
    address internal constant SAFE_L2_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address internal constant SAFE_PROXY_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address internal constant SAFE_FALLBACK_HANDLER = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99;

    bytes32 internal constant SAFE_L2_SINGLETON_CODEHASH =
        0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff;
    bytes32 internal constant SAFE_PROXY_FACTORY_CODEHASH =
        0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317;
    bytes32 internal constant SAFE_FALLBACK_HANDLER_CODEHASH =
        0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9;
    /// @dev Runtime setiap proxy dari SafeProxyFactory 1.4.1 (171 byte).
    bytes32 internal constant SAFE_PROXY_RUNTIME_CODEHASH =
        0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c;

    address internal constant SENTINEL = address(0x1);
    /// @dev keccak256("guard_manager.guard.address")
    uint256 internal constant GUARD_SLOT =
        0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    /// @notice GANTI: alamat publik wallet yang key/password-nya pernah bocor (mis. wallet testnet
    /// yang password-nya pernah dibagikan). Tidak boleh memegang peran apa pun di mainnet.
    function isExposed(address a) internal pure returns (bool) {
        return a == address(0); // tambahkan: || a == 0x...
    }

    function _word(address safe, uint256 slot) private view returns (bytes32) {
        bytes memory w = ISafe(safe).getStorageAt(slot, 1);
        require(w.length == 32, "safe: malformed getStorageAt");
        return bytes32(w);
    }

    /// @notice Revert kecuali `safe` adalah proxy Safe v1.4.1 kanonik, threshold >= min, tanpa
    /// module dan guard. `strictOwners` (mainnet): semua owner EOA polos (tanpa code / delegasi
    /// EIP-7702) dan tidak ada yang terekspos.
    function check(address safe, uint256 minThreshold, bool strictOwners)
        internal
        view
        returns (address[] memory owners, uint256 threshold)
    {
        require(safe.code.length > 0, "safe: no code");
        require(safe.codehash == SAFE_PROXY_RUNTIME_CODEHASH, "safe: not canonical SafeProxy 1.4.1");
        require(
            address(uint160(uint256(_word(safe, 0)))) == SAFE_L2_SINGLETON,
            "safe: not a SafeL2 1.4.1 proxy"
        );
        require(
            SAFE_L2_SINGLETON.codehash == SAFE_L2_SINGLETON_CODEHASH,
            "safe: singleton codehash differs"
        );
        require(keccak256(bytes(ISafe(safe).VERSION())) == keccak256("1.4.1"), "safe: VERSION");
        owners = ISafe(safe).getOwners();
        threshold = ISafe(safe).getThreshold();
        require(threshold >= minThreshold, "safe: threshold below minimum");
        (address[] memory modules,) = ISafe(safe).getModulesPaginated(SENTINEL, 10);
        require(modules.length == 0, "safe: module enabled (bypasses threshold)");
        require(_word(safe, GUARD_SLOT) == bytes32(0), "safe: guard set");
        if (strictOwners) {
            for (uint256 i; i < owners.length; ++i) {
                require(!isExposed(owners[i]), "safe: owner is an exposed key");
                require(owners[i].code.length == 0, "safe: owner has code (contract/EIP-7702)");
            }
        }
    }

    /// @notice Recover signer tiap tanda tangan 65 byte (`cast wallet sign --no-hash`), urutkan
    /// naik berdasarkan alamat signer (syarat `execTransaction`), lalu gabungkan.
    function sortSignatures(bytes32 safeTxHash, bytes[] memory sigs)
        internal
        pure
        returns (bytes memory packed, address[] memory signers)
    {
        uint256 n = sigs.length;
        signers = new address[](n);
        for (uint256 i; i < n; ++i) {
            require(sigs[i].length == 65, "sig: must be 65 bytes");
            bytes memory s = sigs[i];
            bytes32 r_;
            bytes32 s_;
            uint8 v;
            assembly {
                r_ := mload(add(s, 32))
                s_ := mload(add(s, 64))
                v := byte(0, mload(add(s, 96)))
            }
            require(v == 27 || v == 28, "sig: v must be 27/28");
            address signer = ecrecover(safeTxHash, v, r_, s_);
            require(signer != address(0), "sig: invalid");
            signers[i] = signer;
        }
        for (uint256 i = 1; i < n; ++i) {
            address a = signers[i];
            bytes memory sa = sigs[i];
            uint256 j = i;
            while (j > 0 && signers[j - 1] > a) {
                signers[j] = signers[j - 1];
                sigs[j] = sigs[j - 1];
                --j;
            }
            signers[j] = a;
            sigs[j] = sa;
        }
        for (uint256 i; i < n; ++i) {
            if (i > 0) require(signers[i] != signers[i - 1], "sig: duplicate signer");
            packed = bytes.concat(packed, sigs[i]);
        }
    }
}
```

### 9.4 `script/GuardedScript.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { VmSafe } from "forge-std/Vm.sol";

/// @notice Base semua script: membedakan DRY RUN vs BROADCAST dan mengunci broadcast mainnet.
abstract contract GuardedScript is Script {
    uint256 internal constant MAINNET_CHAIN_ID = 4663;
    uint256 internal constant TESTNET_CHAIN_ID = 46630;
    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    function _isBroadcast() internal view returns (bool) {
        return vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)
            || vm.isContext(VmSafe.ForgeContext.ScriptResume);
    }

    function _banner() internal view {
        if (_isBroadcast()) {
            console2.log("MODE: BROADCAST -- final only after confirmation + Verify script");
        } else {
            console2.log("MODE: DRY RUN -- simulation only, NOTHING was sent");
        }
    }

    /// @dev Guard umum: chain yang didukung, EXPECTED_CHAIN_ID wajib di mainnet, tanpa private key
    /// di env untuk mainnet, dan broadcast mainnet hanya dengan ALLOW_MAINNET_BROADCAST=1
    /// (diset manusia, tidak pernah oleh AI agent).
    function _guardChain() internal view {
        uint256 expected = vm.envOr("EXPECTED_CHAIN_ID", uint256(0));
        if (expected != 0) require(expected == block.chainid, "EXPECTED_CHAIN_ID != RPC chain id");
        require(
            block.chainid == MAINNET_CHAIN_ID || block.chainid == TESTNET_CHAIN_ID
                || block.chainid == ANVIL_CHAIN_ID,
            "unsupported chain"
        );
        if (block.chainid == MAINNET_CHAIN_ID) {
            require(expected == MAINNET_CHAIN_ID, "mainnet: set EXPECTED_CHAIN_ID=4663");
            require(
                vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0)) == 0,
                "mainnet: use --account/--ledger, not DEPLOYER_PRIVATE_KEY"
            );
            if (_isBroadcast()) {
                require(
                    vm.envOr("ALLOW_MAINNET_BROADCAST", uint256(0)) == 1,
                    "mainnet broadcast requires ALLOW_MAINNET_BROADCAST=1 (human only)"
                );
            }
        }
    }
}
```

### 9.5 `script/CreateSafe.s.sol` (T1)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { console2 } from "forge-std/Script.sol";
import { GuardedScript } from "./GuardedScript.sol";
import { SafeV141, ISafe, ISafeProxyFactory } from "./SafeV141.sol";

/// @title CreateSafe (T1)
/// @notice Membuat Safe v1.4.1 (SafeL2) lewat SafeProxyFactory kanonik, tanpa Safe{Wallet} UI.
///   SAFE_OWNERS=<a>,<b>,<c> SAFE_THRESHOLD=2 SAFE_SALT_NONCE=<n> EXPECTED_CHAIN_ID=4663 \
///   forge script script/CreateSafe.s.sol --rpc-url robinhood_mainnet --sender <deployer> \
///   [--account <keystore> --broadcast]   # broadcast mainnet juga butuh ALLOW_MAINNET_BROADCAST=1
contract CreateSafe is GuardedScript {
    function run() external returns (address safe) {
        _guardChain();
        address[] memory owners = vm.envAddress("SAFE_OWNERS", ",");
        uint256 threshold = vm.envUint("SAFE_THRESHOLD");
        uint256 saltNonce = vm.envUint("SAFE_SALT_NONCE");

        require(threshold >= 1 && threshold <= owners.length, "invalid SAFE_THRESHOLD");
        for (uint256 i; i < owners.length; ++i) {
            require(
                owners[i] != address(0) && owners[i].code.length == 0,
                "owner must be a plain EOA (no code, no EIP-7702 delegation)"
            );
            for (uint256 j; j < i; ++j) {
                require(owners[i] != owners[j], "duplicate owner");
            }
        }
        if (block.chainid == MAINNET_CHAIN_ID) {
            require(threshold >= 2, "mainnet: threshold must be >= 2");
            for (uint256 i; i < owners.length; ++i) {
                require(!SafeV141.isExposed(owners[i]), "mainnet: owner is an exposed key");
            }
        }
        require(
            SafeV141.SAFE_L2_SINGLETON.codehash == SafeV141.SAFE_L2_SINGLETON_CODEHASH,
            "SafeL2 singleton not canonical on this chain"
        );
        require(
            SafeV141.SAFE_PROXY_FACTORY.codehash == SafeV141.SAFE_PROXY_FACTORY_CODEHASH,
            "SafeProxyFactory not canonical on this chain"
        );
        require(
            SafeV141.SAFE_FALLBACK_HANDLER.codehash == SafeV141.SAFE_FALLBACK_HANDLER_CODEHASH,
            "fallback handler not canonical on this chain"
        );

        bytes memory initializer = abi.encodeCall(
            ISafe.setup,
            (
                owners,
                threshold,
                address(0),
                "",
                SafeV141.SAFE_FALLBACK_HANDLER,
                address(0),
                0,
                payable(address(0))
            )
        );
        address predicted = _predict(initializer, saltNonce);
        require(predicted.code.length == 0, "a Safe already exists at the predicted address");
        console2.log("Predicted Safe:", predicted);

        vm.startBroadcast();
        safe = ISafeProxyFactory(SafeV141.SAFE_PROXY_FACTORY)
            .createProxyWithNonce(SafeV141.SAFE_L2_SINGLETON, initializer, saltNonce);
        vm.stopBroadcast();

        require(safe == predicted, "Safe address != prediction");
        (address[] memory got, uint256 th) = SafeV141.check(safe, threshold, false);
        require(th == threshold && got.length == owners.length, "Safe setup mismatch");
        _banner();
        console2.log("chainId:  ", block.chainid);
        console2.log("Safe:     ", safe);
        console2.log("threshold:", th);
        for (uint256 i; i < got.length; ++i) {
            console2.log("owner:    ", got[i]);
        }
    }

    function _predict(bytes memory initializer, uint256 saltNonce) internal view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(keccak256(initializer), saltNonce));
        bytes memory deploymentData = abi.encodePacked(
            ISafeProxyFactory(SafeV141.SAFE_PROXY_FACTORY).proxyCreationCode(),
            uint256(uint160(SafeV141.SAFE_L2_SINGLETON))
        );
        return vm.computeCreate2Address(
            salt, keccak256(deploymentData), SafeV141.SAFE_PROXY_FACTORY
        );
    }
}
```

### 9.6 `script/DeployReservedDeployer.s.sol` (T2)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { console2 } from "forge-std/Script.sol";
import { GuardedScript } from "./GuardedScript.sol";
import { SafeV141 } from "./SafeV141.sol";
import { ReservedDeployer } from "../src/ReservedDeployer.sol";

/// @title DeployReservedDeployer (T2, reservasi P1)
/// @notice Deploy factory dengan admin = Safe. Tidak membutuhkan token.
///   EXPECTED_CHAIN_ID=4663 ADMIN_SAFE=<safe> [DENIED_TOKENS=<a>,<b>] \
///   [EXPECTED_FACTORY_ADDRESS=<addr>] \
///   forge script script/DeployReservedDeployer.s.sol --rpc-url robinhood_mainnet \
///   --sender <deployer> [--account <keystore> --broadcast]
contract DeployReservedDeployer is GuardedScript {
    function run() external returns (ReservedDeployer factory) {
        _guardChain();
        address admin = vm.envAddress("ADMIN_SAFE");
        address expectedFactory = vm.envOr("EXPECTED_FACTORY_ADDRESS", address(0));
        address[] memory denied = vm.envOr("DENIED_TOKENS", ",", new address[](0));
        uint256 deployerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0)); // Anvil/testnet saja

        address deployer = deployerKey != 0 ? vm.addr(deployerKey) : tx.origin;
        // Tanpa --sender, simulasi berjalan sebagai default sender Foundry: prediksi jadi salah.
        require(deployer != DEFAULT_SENDER, "pass --sender <deployer> (and --account to broadcast)");
        require(admin != deployer, "admin must be the Safe, not the deployer");
        require(admin.code.length > 0, "ADMIN_SAFE has no code (an EOA cannot be admin)");
        if (block.chainid == MAINNET_CHAIN_ID) {
            require(!SafeV141.isExposed(deployer), "mainnet: deployer is an exposed key");
            SafeV141.check(admin, 2, true);
        } else if (block.chainid == TESTNET_CHAIN_ID) {
            SafeV141.check(admin, vm.envOr("SAFE_MIN_THRESHOLD", uint256(2)), false);
        }

        address predictedFactory = vm.computeCreateAddress(deployer, vm.getNonce(deployer));
        if (expectedFactory != address(0)) {
            require(
                predictedFactory == expectedFactory,
                "deployer nonce moved: factory would not land on EXPECTED_FACTORY_ADDRESS"
            );
        }
        address pEscrow = vm.computeCreateAddress(predictedFactory, 1);
        address pSplitter = vm.computeCreateAddress(predictedFactory, 2);
        require(
            pEscrow.code.length == 0 && pSplitter.code.length == 0,
            "reserved address already has code"
        );

        if (deployerKey != 0) vm.startBroadcast(deployerKey);
        else vm.startBroadcast();
        factory = new ReservedDeployer(admin, denied);
        vm.stopBroadcast();

        require(address(factory) == predictedFactory, "factory != prediction");
        require(factory.admin() == admin && !factory.used(), "factory state");
        require(vm.getNonce(address(factory)) == 1, "factory nonce != 1");
        require(
            factory.predictedEscrow() == pEscrow && factory.predictedSplitter() == pSplitter,
            "child prediction differs"
        );

        _banner();
        console2.log("chainId:              ", block.chainid);
        console2.log("deployer:             ", deployer);
        console2.log("factory:              ", address(factory));
        console2.log("admin (Safe):         ", admin);
        console2.log("Escrow   (reserved):  ", pEscrow);
        console2.log("Splitter (reserved):  ", pSplitter);
        console2.log("Children NOT DEPLOYED. Token NOT CONFIGURED. Do NOT send funds there.");
    }
}
```

### 9.7 `script/ActivateReservedDeployer.s.sol` (P2)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { GuardedScript } from "./GuardedScript.sol";
import { SafeV141, ISafe } from "./SafeV141.sol";
import { ReservedDeployer } from "../src/ReservedDeployer.sol";
import { Escrow } from "../src/Escrow.sol";
import { Splitter } from "../src/Splitter.sol";

/// @title ActivateReservedDeployer (P2)
/// @notice Tanpa SAFE_SIGNATURES: read-only -- validasi, simulasi `deploy()` sebagai Safe, cetak
/// calldata + safeTxHash. Dengan SAFE_SIGNATURES: urutkan tanda tangan lalu `execTransaction`.
///   EXPECTED_CHAIN_ID=4663 FACTORY_ADDRESS=.. EXPECTED_ADMIN_SAFE=.. TOKEN_ADDRESS=<CA> \
///   TOKEN_EXPECTED_DECIMALS=18 TOKEN_EXPECTED_SYMBOL=<SYM> OPERATOR_ADDRESS=.. ARBITER_ADDRESS=.. \
///   TREASURY_A_ADDRESS=.. TREASURY_B_ADDRESS=.. \
///   forge script script/ActivateReservedDeployer.s.sol --rpc-url robinhood_mainnet
contract ActivateReservedDeployer is GuardedScript {
    struct Inputs {
        ReservedDeployer factory;
        address token;
        uint8 decimals;
        string symbol;
        ReservedDeployer.Roles roles;
    }

    function run() external {
        _guardChain();
        Inputs memory p;
        p.factory = ReservedDeployer(vm.envAddress("FACTORY_ADDRESS"));
        p.token = vm.envAddress("TOKEN_ADDRESS");
        p.decimals = uint8(vm.envUint("TOKEN_EXPECTED_DECIMALS"));
        p.symbol = vm.envOr("TOKEN_EXPECTED_SYMBOL", string(""));
        p.roles = ReservedDeployer.Roles({
            operator: vm.envAddress("OPERATOR_ADDRESS"),
            arbiter: vm.envAddress("ARBITER_ADDRESS"),
            owner: p.factory.admin(), // selalu Safe admin
            treasuryA: vm.envAddress("TREASURY_A_ADDRESS"),
            treasuryB: vm.envAddress("TREASURY_B_ADDRESS")
        });
        require(vm.envAddress("EXPECTED_ADMIN_SAFE") == p.roles.owner, "factory admin != EXPECTED_ADMIN_SAFE");
        _validate(p);

        bytes memory data =
            abi.encodeCall(ReservedDeployer.deploy, (IERC20(p.token), p.decimals, p.roles));
        _simulateAsSafe(p, data);

        address safe = p.factory.admin();
        uint256 safeNonce = vm.envOr("SAFE_NONCE", ISafe(safe).nonce());
        bytes32 safeTxHash = ISafe(safe).getTransactionHash(
            address(p.factory), 0, data, 0, 0, 0, 0, address(0), address(0), safeNonce
        );

        _banner();
        console2.log("Safe:        ", safe);
        console2.log("Safe nonce:  ", safeNonce);
        console2.log("to (factory):", address(p.factory));
        console2.log("token:       ", p.token);
        console2.log("operator:    ", p.roles.operator);
        console2.log("arbiter:     ", p.roles.arbiter);
        console2.log("treasuryA:   ", p.roles.treasuryA);
        console2.log("treasuryB:   ", p.roles.treasuryB);
        console2.log("Escrow   ->  ", p.factory.predictedEscrow());
        console2.log("Splitter ->  ", p.factory.predictedSplitter());
        console2.log("calldata:");
        console2.logBytes(data);
        console2.log("safeTxHash (owners sign with `cast wallet sign --no-hash`):");
        console2.logBytes32(safeTxHash);

        bytes[] memory sigs = vm.envOr("SAFE_SIGNATURES", ",", new bytes[](0));
        if (sigs.length == 0) {
            console2.log("No SAFE_SIGNATURES: prepare/simulate only, nothing sent.");
            return;
        }
        bytes memory packed = _collect(safe, safeTxHash, sigs);

        vm.startBroadcast();
        bool ok = ISafe(safe).execTransaction(
            address(p.factory), 0, data, 0, 0, 0, 0, address(0), payable(address(0)), packed
        );
        vm.stopBroadcast();
        require(ok, "execTransaction returned false");
        _assertDeployed(p);
        console2.log(
            _isBroadcast()
                ? "Submitted. Confirm on the explorer, then run the Verify script."
                : "DRY RUN: execTransaction simulated with these signatures; NOT sent."
        );
    }

    function _validate(Inputs memory p) internal view {
        require(address(p.factory).code.length > 0, "no code at FACTORY_ADDRESS");
        require(!p.factory.used(), "factory already used");
        require(p.token.code.length > 0, "TOKEN_ADDRESS has no code");
        require(IERC20Metadata(p.token).decimals() == p.decimals, "decimals mismatch");
        if (bytes(p.symbol).length > 0) {
            require(
                keccak256(bytes(IERC20Metadata(p.token).symbol())) == keccak256(bytes(p.symbol)),
                "symbol mismatch"
            );
        }
        if (block.chainid == MAINNET_CHAIN_ID) {
            require(bytes(p.symbol).length > 0, "mainnet: TOKEN_EXPECTED_SYMBOL required");
            SafeV141.check(p.factory.admin(), 2, true);
            ReservedDeployer.Roles memory r = p.roles;
            require(
                !SafeV141.isExposed(r.operator) && !SafeV141.isExposed(r.arbiter)
                    && !SafeV141.isExposed(r.treasuryA) && !SafeV141.isExposed(r.treasuryB),
                "mainnet: a role is an exposed key"
            );
        }
    }

    /// @dev Menjalankan call persis sebagai Safe di fork, memeriksa hasil, lalu me-rollback.
    function _simulateAsSafe(Inputs memory p, bytes memory data) internal {
        uint256 snap = vm.snapshotState();
        vm.prank(p.factory.admin());
        (bool ok, bytes memory ret) = address(p.factory).call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        _assertDeployed(p);
        vm.revertToState(snap);
        console2.log("Simulation as the Safe: OK (state rolled back).");
    }

    function _assertDeployed(Inputs memory p) internal view {
        address e = p.factory.predictedEscrow();
        address s = p.factory.predictedSplitter();
        require(p.factory.used(), "factory not used");
        require(e.code.length > 0 && s.code.length > 0, "children missing");
        require(address(Escrow(e).token()) == p.token, "Escrow token");
        require(address(Splitter(s).token()) == p.token, "Splitter token");
        require(address(Splitter(s).escrow()) == e, "Splitter binding");
        require(Escrow(e).isAllowedPayee(s), "Splitter allowlist");
        require(Escrow(e).owner() == p.roles.owner, "Escrow owner");
        require(Escrow(e).operator() == p.roles.operator, "Escrow operator");
        require(Escrow(e).arbiter() == p.roles.arbiter, "Escrow arbiter");
        require(Splitter(s).treasuryA() == p.roles.treasuryA, "treasuryA");
        require(Splitter(s).treasuryB() == p.roles.treasuryB, "treasuryB");
    }

    function _collect(address safe, bytes32 h, bytes[] memory sigs)
        internal
        view
        returns (bytes memory packed)
    {
        address[] memory signers;
        (packed, signers) = SafeV141.sortSignatures(h, sigs);
        address[] memory owners = ISafe(safe).getOwners();
        require(signers.length >= ISafe(safe).getThreshold(), "fewer signatures than threshold");
        for (uint256 i; i < signers.length; ++i) {
            bool isOwner;
            for (uint256 j; j < owners.length; ++j) {
                if (owners[j] == signers[i]) isOwner = true;
            }
            require(isOwner, "signature not from a Safe owner (wrong hash or nonce?)");
            console2.log("signed by owner:", signers[i]);
        }
    }
}
```

### 9.8 `script/VerifyReservedDeployer.s.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { console2 } from "forge-std/Script.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { GuardedScript } from "./GuardedScript.sol";
import { SafeV141 } from "./SafeV141.sol";
import { ReservedDeployer } from "../src/ReservedDeployer.sol";
import { Escrow } from "../src/Escrow.sol";
import { Splitter } from "../src/Splitter.sol";

/// @title VerifyReservedDeployer (read-only, P1 & P2)
///   EXPECTED_CHAIN_ID=4663 FACTORY_ADDRESS=.. EXPECTED_ADMIN_SAFE=.. \
///   [EXPECTED_ESCROW=.. EXPECTED_SPLITTER=..] [TOKEN_ADDRESS=<CA>] \
///   forge script script/VerifyReservedDeployer.s.sol --rpc-url robinhood_mainnet
contract VerifyReservedDeployer is GuardedScript {
    function run() external {
        // Membuat salinan lokal untuk membandingkan bytecode: tidak boleh pernah di-broadcast.
        require(!_isBroadcast(), "read-only: run without --broadcast");
        ReservedDeployer f = ReservedDeployer(vm.envAddress("FACTORY_ADDRESS"));
        address expectedAdmin = vm.envAddress("EXPECTED_ADMIN_SAFE");
        require(block.chainid == vm.envUint("EXPECTED_CHAIN_ID"), "RPC chain id != EXPECTED_CHAIN_ID");
        require(address(f).code.length > 0, "no code at FACTORY_ADDRESS");
        address admin = f.admin();
        require(admin == expectedAdmin, "factory admin != EXPECTED_ADMIN_SAFE");
        if (block.chainid == MAINNET_CHAIN_ID || block.chainid == TESTNET_CHAIN_ID) {
            bool main = block.chainid == MAINNET_CHAIN_ID;
            SafeV141.check(admin, main ? 2 : 1, main);
        }

        // Bytecode factory = build ini (deniedToken ada di storage, tidak memengaruhi codehash).
        ReservedDeployer local = new ReservedDeployer(admin, new address[](0));
        require(address(local).codehash == address(f).codehash, "factory code != this build");

        address e = f.predictedEscrow();
        address s = f.predictedSplitter();
        require(e == vm.computeCreateAddress(address(f), 1), "Escrow prediction formula");
        require(s == vm.computeCreateAddress(address(f), 2), "Splitter prediction formula");
        address expE = vm.envOr("EXPECTED_ESCROW", address(0));
        address expS = vm.envOr("EXPECTED_SPLITTER", address(0));
        if (expE != address(0)) require(e == expE, "predictedEscrow != EXPECTED_ESCROW");
        if (expS != address(0)) require(s == expS, "predictedSplitter != EXPECTED_SPLITTER");

        console2.log("chainId:  ", block.chainid);
        console2.log("factory:  ", address(f));
        console2.log("admin:    ", admin);
        console2.log("Escrow:   ", e);
        console2.log("Splitter: ", s);

        if (!f.used()) {
            require(vm.getNonce(address(f)) == 1, "factory nonce != 1 while unused");
            require(e.code.length == 0 && s.code.length == 0, "reserved address has code");
            console2.log("Factory:  DEPLOYED (code == this build, used() == false, nonce 1)");
            console2.log("Escrow:   RESERVED - NOT DEPLOYED (no code)");
            console2.log("Splitter: RESERVED - NOT DEPLOYED (no code)");
            return;
        }

        require(vm.getNonce(address(f)) == 3, "factory nonce != 3 after deploy");
        Escrow escrow = Escrow(e);
        Splitter splitter = Splitter(s);
        address token = address(escrow.token());
        require(address(splitter.token()) == token, "token mismatch");
        address expectedToken = vm.envOr("TOKEN_ADDRESS", address(0));
        if (expectedToken != address(0)) require(token == expectedToken, "token != TOKEN_ADDRESS");
        require(address(splitter.escrow()) == e, "Splitter not bound");
        require(escrow.isAllowedPayee(s), "Splitter not allowlisted");
        require(escrow.owner() == admin && splitter.owner() == admin, "owner != admin Safe");

        // Kode anak = build ini: bandingkan dengan salinan lokal dari argumen yang sama.
        Escrow le = new Escrow(escrow.token(), escrow.operator(), escrow.arbiter(), admin, address(0));
        Splitter ls = new Splitter(
            escrow.token(), escrow, splitter.operator(), admin, splitter.treasuryA(), splitter.treasuryB()
        );
        require(address(le).codehash == e.codehash, "Escrow code != this build");
        require(address(ls).codehash == s.codehash, "Splitter code != this build");

        console2.log("Factory:  DEPLOYED, USED");
        console2.log("Escrow:   DEPLOYED (code == this build)");
        console2.log("Splitter: DEPLOYED (code == this build), allowlisted, bound");
        console2.log("token:    ", token);
        console2.log("symbol:   ", IERC20Metadata(token).symbol());
        console2.log("decimals: ", IERC20Metadata(token).decimals());
    }
}
```

### 9.9 `test/ReservedDeployer.t.sol`

Kontrak contoh yang dipakai test dan gladi (ganti dengan kontrak proyek; **jangan** di-deploy ke mainnet):

```solidity
// src/Escrow.sol (contoh)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
/// Contoh minimal kontrak anak #1 (hanya untuk menguji template).
contract Escrow {
    IERC20 public immutable token;
    address public immutable operator;
    address public immutable arbiter;
    address public immutable owner;
    mapping(address => bool) public isAllowedPayee;
    constructor(IERC20 _token, address _operator, address _arbiter, address _owner, address initialPayee) {
        require(address(_token) != address(0) && _operator != address(0) && _arbiter != address(0) && _owner != address(0), "zero");
        token = _token; operator = _operator; arbiter = _arbiter; owner = _owner;
        if (initialPayee != address(0)) isAllowedPayee[initialPayee] = true;
    }
}
```

```solidity
// src/Splitter.sol (contoh)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Escrow } from "./Escrow.sol";
/// Contoh minimal kontrak anak #2 (hanya untuk menguji template).
contract Splitter {
    IERC20 public immutable token;
    Escrow public immutable escrow;
    address public immutable operator;
    address public immutable owner;
    address public immutable treasuryA;
    address public immutable treasuryB;
    constructor(IERC20 _token, Escrow _escrow, address _operator, address _owner, address _a, address _b) {
        require(_a != address(0) && _b != address(0), "zero");
        token = _token; escrow = _escrow; operator = _operator; owner = _owner; treasuryA = _a; treasuryB = _b;
    }
}
```

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ReservedDeployer } from "../src/ReservedDeployer.sol";
import { Escrow } from "../src/Escrow.sol";
import { Splitter } from "../src/Splitter.sol";
import { SafeV141, ISafe, ISafeProxyFactory } from "../script/SafeV141.sol";

contract MockToken is ERC20 {
    uint8 private immutable _d;

    constructor(uint8 d) ERC20("Mock", "MOCK") {
        _d = d;
        _mint(msg.sender, 1e27);
    }

    function decimals() public view override returns (uint8) {
        return _d;
    }
}

/// Admin palsu (kontrak) untuk unit test tanpa Safe.
contract MockAdmin {
    function exec(address to, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = to.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }
}

contract ReservedDeployerTest is Test {
    MockAdmin admin;
    ReservedDeployer f;
    MockToken token;
    ReservedDeployer.Roles roles;

    function setUp() public {
        admin = new MockAdmin();
        f = new ReservedDeployer(address(admin), new address[](0));
        token = new MockToken(18);
        roles = ReservedDeployer.Roles({
            operator: makeAddr("operator"),
            arbiter: makeAddr("arbiter"),
            owner: address(admin),
            treasuryA: makeAddr("a"),
            treasuryB: makeAddr("b")
        });
    }

    function _deploy(address t, uint8 d, ReservedDeployer.Roles memory r) internal {
        admin.exec(address(f), abi.encodeCall(ReservedDeployer.deploy, (IERC20(t), d, r)));
    }

    function test_PredictionMatchesCreateFormula() public view {
        assertEq(f.predictedEscrow(), vm.computeCreateAddress(address(f), 1));
        assertEq(f.predictedSplitter(), vm.computeCreateAddress(address(f), 2));
        assertEq(f.predictedEscrow().code.length, 0);
    }

    function test_DeployLandsOnReservedAddresses() public {
        address pe = f.predictedEscrow();
        address ps = f.predictedSplitter();
        _deploy(address(token), 18, roles);
        assertTrue(f.used());
        assertGt(pe.code.length, 0);
        assertEq(address(Splitter(ps).escrow()), pe);
        assertTrue(Escrow(pe).isAllowedPayee(ps));
        assertEq(address(Escrow(pe).token()), address(token));
    }

    function test_RejectsEoaAdmin() public {
        vm.expectRevert(ReservedDeployer.AdminNotContract.selector);
        new ReservedDeployer(makeAddr("eoa"), new address[](0));
    }

    function test_Rejects7702DelegatedAdmin() public {
        address eoa = makeAddr("delegated");
        vm.etch(eoa, abi.encodePacked(hex"ef0100", address(0xBEEF)));
        vm.expectRevert(ReservedDeployer.AdminNotContract.selector);
        new ReservedDeployer(eoa, new address[](0));
    }

    function testFuzz_NonAdminRejected(address caller) public {
        vm.assume(caller != address(admin));
        vm.prank(caller);
        vm.expectRevert(ReservedDeployer.NotAdmin.selector);
        f.deploy(IERC20(address(token)), 18, roles);
    }

    function test_SecondDeployRejected() public {
        _deploy(address(token), 18, roles);
        vm.expectRevert(ReservedDeployer.AlreadyUsed.selector);
        _deploy(address(token), 18, roles);
    }

    function test_FailedAttemptKeepsAddressesAndAllowsRetry() public {
        address pe = f.predictedEscrow();
        vm.expectRevert(ReservedDeployer.DecimalsMismatch.selector);
        _deploy(address(token), 6, roles);
        assertFalse(f.used());
        assertEq(vm.getNonce(address(f)), 1);
        _deploy(address(token), 18, roles);
        assertGt(pe.code.length, 0);
    }

    function test_DeniedTokenRejected() public {
        address[] memory denied = new address[](1);
        denied[0] = address(token);
        ReservedDeployer f2 = new ReservedDeployer(address(admin), denied);
        vm.expectRevert(ReservedDeployer.TokenNotAllowed.selector);
        admin.exec(address(f2), abi.encodeCall(ReservedDeployer.deploy, (IERC20(address(token)), 18, roles)));
    }

    function test_OwnerMustBeAdmin() public {
        roles.owner = makeAddr("notAdmin");
        vm.expectRevert(ReservedDeployer.OwnerNotAdmin.selector);
        _deploy(address(token), 18, roles);
    }

    function test_RoleConflictRejected() public {
        roles.arbiter = roles.operator;
        vm.expectRevert(ReservedDeployer.RoleConflict.selector);
        _deploy(address(token), 18, roles);
    }

    function test_TokenWithoutCodeRejected() public {
        vm.expectRevert(ReservedDeployer.TokenHasNoCode.selector);
        _deploy(makeAddr("nocode"), 18, roles);
    }
}

/// Fork test dengan Safe v1.4.1 asli. Jalan hanya bila FORK_RPC_URL diset.
contract ReservedDeployerSafeForkTest is Test {
    uint256[3] keys;
    address[] owners;
    address safe;
    ReservedDeployer f;
    MockToken token;

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        for (uint256 i; i < 3; ++i) {
            keys[i] = uint256(keccak256(abi.encode("template-owner", i)));
            owners.push(vm.addr(keys[i]));
            assertEq(owners[i].code.length, 0);
        }
        bytes memory init = abi.encodeCall(
            ISafe.setup,
            (owners, 2, address(0), "", SafeV141.SAFE_FALLBACK_HANDLER, address(0), 0, payable(address(0)))
        );
        safe = ISafeProxyFactory(SafeV141.SAFE_PROXY_FACTORY).createProxyWithNonce(
            SafeV141.SAFE_L2_SINGLETON, init, uint256(keccak256("template-salt"))
        );
        SafeV141.check(safe, 2, true);
        f = new ReservedDeployer(safe, new address[](0));
        token = new MockToken(18);
    }

    function _roles() internal returns (ReservedDeployer.Roles memory) {
        return ReservedDeployer.Roles({
            operator: makeAddr("operator"),
            arbiter: makeAddr("arbiter"),
            owner: safe,
            treasuryA: safe,
            treasuryB: safe
        });
    }

    function test_Fork_SafeActivatesFactory() public {
        if (safe == address(0)) return;
        bytes memory data =
            abi.encodeCall(ReservedDeployer.deploy, (IERC20(address(token)), 18, _roles()));
        bytes32 h = ISafe(safe).getTransactionHash(
            address(f), 0, data, 0, 0, 0, 0, address(0), address(0), ISafe(safe).nonce()
        );
        bytes[] memory sigs = new bytes[](2);
        for (uint256 i; i < 2; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[i + 1], h); // = cast wallet sign --no-hash
            sigs[i] = abi.encodePacked(r, s, v);
        }
        (bytes memory packed,) = SafeV141.sortSignatures(h, sigs);
        address pe = f.predictedEscrow();
        address ps = f.predictedSplitter();
        bool ok = ISafe(safe).execTransaction(
            address(f), 0, data, 0, 0, 0, 0, address(0), payable(address(0)), packed
        );
        assertTrue(ok);
        assertTrue(f.used());
        assertGt(pe.code.length, 0);
        assertTrue(Escrow(pe).isAllowedPayee(ps));
        assertEq(Escrow(pe).owner(), safe);
    }

    function test_Fork_SingleOwnerCannotActivate() public {
        if (safe == address(0)) return;
        ReservedDeployer.Roles memory r = _roles();
        vm.prank(owners[0]);
        vm.expectRevert(ReservedDeployer.NotAdmin.selector);
        f.deploy(IERC20(address(token)), 18, r);
    }
}
```

Jalankan:
```bash
forge test                                                                   # unit + fuzz
FORK_RPC_URL=https://rpc.mainnet.chain.robinhood.com forge test --match-contract Fork -vv
```

### 9.10 `script/fork-rehearsal.sh`

```bash
#!/usr/bin/env bash
# Gladi LOKAL seluruh alur (T1 Safe -> T2 factory -> Verify P1 -> Activate -> Verify P2) di fork Anvil.
# Tidak ada transaksi ke chain sungguhan: semua broadcast menuju Anvil di 127.0.0.1.
#   ./script/fork-rehearsal.sh https://rpc.mainnet.chain.robinhood.com
set -euo pipefail
cd "$(dirname "$0")/.."
FORK_RPC="${1:?pemakaian: $0 <fork-rpc-url>}"
PORT="${REHEARSAL_PORT:-8549}"
RPC="http://127.0.0.1:$PORT"

# Kunci uji deterministik, HANYA untuk fork lokal. Jangan pakai akun bawaan Anvil:
# di Robinhood mainnet akun-akun itu sudah ter-delegasi EIP-7702 (punya code).
key() { cast keccak "pre-ca-rehearsal-$1"; }
K0=$(key 0); K1=$(key 1); K2=$(key 2); K3=$(key 3)
A0=$(cast wallet address $K0); A1=$(cast wallet address $K1)
A2=$(cast wallet address $K2); A3=$(cast wallet address $K3)

unset DEPLOYER_PRIVATE_KEY SAFE_SIGNATURES SAFE_NONCE TOKEN_ADDRESS
# Fork memakai chain id asli: log broadcast akan tampak seperti deploy sungguhan -> direktori sementara.
SCRATCH=$(mktemp -d)
export FOUNDRY_BROADCAST="$SCRATCH/broadcast" FOUNDRY_CACHE_PATH="$SCRATCH/cache"

anvil --fork-url "$FORK_RPC" --port "$PORT" --silent &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true; rm -rf "$SCRATCH"' EXIT
for _ in $(seq 1 60); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.5; done
kill -0 $ANVIL 2>/dev/null || { echo "anvil gagal start (port $PORT terpakai?)" >&2; exit 1; }
case "$(cast client --rpc-url "$RPC")" in anvil*) ;; *) echo "bukan Anvil, batal" >&2; exit 1 ;; esac
CHAIN=$(cast chain-id --rpc-url "$RPC")
export EXPECTED_CHAIN_ID=$CHAIN ALLOW_MAINNET_BROADCAST=1   # aman: target hanya Anvil lokal
for a in $A0 $A1 $A2 $A3; do [ "$(cast codesize $a --rpc-url "$RPC")" = "0" ] || { echo "$a punya code" >&2; exit 1; }; done
cast rpc anvil_setBalance $A0 0x56BC75E2D63100000 --rpc-url "$RPC" >/dev/null
echo "== fork chain $CHAIN"

bc() { forge script "$@" --rpc-url "$RPC" --private-key $K0 --broadcast --slow 2>&1; }
dry() { forge script "$@" --rpc-url "$RPC" --sender $A0 2>&1; }
addr() { grep -E "$1" | head -1 | grep -oE '0x[0-9a-fA-F]{40}' | head -1; }

echo "== 1. T1 CreateSafe"
OUT=$(SAFE_OWNERS=$A1,$A2,$A3 SAFE_THRESHOLD=2 SAFE_SALT_NONCE=4663001 bc script/CreateSafe.s.sol)
SAFE=$(echo "$OUT" | addr "Safe: ")
[ -n "$SAFE" ] || { echo "$OUT"; exit 1; }; echo "Safe $SAFE"

echo "== 2. T2 dry-run (tanpa key, hanya --sender)"
OUT=$(ADMIN_SAFE=$SAFE dry script/DeployReservedDeployer.s.sol)
echo "$OUT" | grep -q "MODE: DRY RUN" || { echo "$OUT"; exit 1; }
FACTORY=$(echo "$OUT" | addr "factory:"); ESC=$(echo "$OUT" | addr "Escrow   \(reserved\)"); SPL=$(echo "$OUT" | addr "Splitter \(reserved\)")
echo "predicted factory $FACTORY escrow $ESC splitter $SPL"

echo "== 3. T2 broadcast (alamat factory dipin)"
OUT=$(ADMIN_SAFE=$SAFE EXPECTED_FACTORY_ADDRESS=$FACTORY bc script/DeployReservedDeployer.s.sol)
echo "$OUT" | grep -q "MODE: BROADCAST" || { echo "$OUT"; exit 1; }

echo "== 4. Verify P1"
FACTORY_ADDRESS=$FACTORY EXPECTED_ADMIN_SAFE=$SAFE EXPECTED_ESCROW=$ESC EXPECTED_SPLITTER=$SPL \
  forge script script/VerifyReservedDeployer.s.sol --rpc-url "$RPC" 2>&1 | grep -E "RESERVED|DEPLOYED"

echo "== 5. Token uji di fork (pengganti CA)"
# --constructor-args bersifat variadic: WAJIB ditaruh paling akhir.
TOKEN=$(forge create test/ReservedDeployer.t.sol:MockToken --rpc-url "$RPC" --private-key $K0 \
  --broadcast --constructor-args 18 2>&1 | addr "Deployed to")
echo "token $TOKEN"

export FACTORY_ADDRESS=$FACTORY EXPECTED_ADMIN_SAFE=$SAFE TOKEN_ADDRESS=$TOKEN \
  TOKEN_EXPECTED_DECIMALS=18 TOKEN_EXPECTED_SYMBOL=MOCK \
  OPERATOR_ADDRESS=$(cast keccak op | cut -c1-42) ARBITER_ADDRESS=$SAFE \
  TREASURY_A_ADDRESS=$SAFE TREASURY_B_ADDRESS=$SAFE
export OPERATOR_ADDRESS=$(cast to-check-sum-address $OPERATOR_ADDRESS)

echo "== 6. Activate dry-run -> safeTxHash"
OUT=$(forge script script/ActivateReservedDeployer.s.sol --rpc-url "$RPC" 2>&1)
HASH=$(echo "$OUT" | grep -A1 "safeTxHash" | tail -1 | grep -oE '0x[0-9a-f]{64}')
[ -n "$HASH" ] || { echo "$OUT"; exit 1; }; echo "safeTxHash $HASH"

echo "== 7. Tanda tangan 2 owner (lokal) + broadcast"
S1=$(cast wallet sign --no-hash "$HASH" --private-key $K2)
S2=$(cast wallet sign --no-hash "$HASH" --private-key $K3)
OUT=$(SAFE_SIGNATURES=$S1,$S2 bc script/ActivateReservedDeployer.s.sol)
echo "$OUT" | grep -q "Submitted" || { echo "$OUT"; exit 1; }

echo "== 8. Verify P2"
EXPECTED_ESCROW=$ESC EXPECTED_SPLITTER=$SPL forge script script/VerifyReservedDeployer.s.sol --rpc-url "$RPC" 2>&1 | grep -E "DEPLOYED|token:"
echo "== GLADI LULUS"
```

Output yang diharapkan (diringkas dari run 13 Nov 2026):
```
== fork chain 4663
== 1. T1 CreateSafe
== 2. T2 dry-run (tanpa key, hanya --sender)
== 3. T2 broadcast (alamat factory dipin)
== 4. Verify P1
  Factory:  DEPLOYED (code == this build, used() == false, nonce 1)
  Escrow:   RESERVED - NOT DEPLOYED (no code)
  Splitter: RESERVED - NOT DEPLOYED (no code)
== 5. Token uji di fork (pengganti CA)
== 6. Activate dry-run -> safeTxHash
== 7. Tanda tangan 2 owner (lokal) + broadcast
== 8. Verify P2
  Factory:  DEPLOYED, USED
  Escrow:   DEPLOYED (code == this build)
  Splitter: DEPLOYED (code == this build), allowlisted, bound
== GLADI LULUS
```

---

## 10. Template artefak

Simpan semua artefak di `docs/deployment/` di repo proyek.

### 10.1 `DEPLOYMENT_PLAN.md`

```markdown
# Deployment Plan — <Proyek> (pre-CA, Robinhood Chain 4663)
Tanggal: <YYYY-MM-DD> · Disusun oleh: <agent/nama> · Status: DRAFT / DISETUJUI (G1)

## 1. Kontrak
| Kontrak | File | Constructor | Token immutable? | Peran | Dependensi |
|---|---|---|---|---|---|

SHA-256 source (baseline): <file: hash>

## 2. Urutan CREATE di factory
| Nonce factory | Kontrak | Argumen alamat prediksi |
|---|---|---|
| 1 | Escrow | initialPayee = CREATE(factory, 2) |
| 2 | Splitter | escrow = CREATE(factory, 1) |

## 3. Peran
| Peran | Pemegang (rencana) | Wallet/keystore | Di server? |
|---|---|---|---|

## 4. Keputusan (K1–K9)
| ID | Pertanyaan | Rekomendasi | Keputusan approver | Tanggal |
|---|---|---|---|---|

## 5. Wallet
| Keystore | Alamat | Diverifikasi (address/code/nonce) | ETH |
|---|---|---|---|

## 6. Integrasi aplikasi
Env var, ABI, indexer, file yang berisi alamat hard-code.

## 7. Risiko & asumsi
| Risiko | Mitigasi | Status |
|---|---|---|

## 8. Jadwal phase & gate
| Phase | Target | Status | Bukti |
|---|---|---|---|
```

### 10.2 `P1_RESERVATION_REPORT.md`

```markdown
# P1 — Reservasi Alamat (Robinhood Chain 4663)
Tanggal: · Toolchain: Foundry x.y.z, solc 0.8.24, cancun, optimizer 200

## 0. Status
| Komponen | Alamat | Status |
|---|---|---|
| Admin Safe (2-of-3) | | DEPLOYED |
| ReservedDeployer | | DEPLOYED, used() == false |
| Escrow | | RESERVED — NOT DEPLOYED |
| Splitter | | RESERVED — NOT DEPLOYED |
| Token | — | BELUM TERSEDIA |
> Jangan mengirim token/ETH ke alamat RESERVED.

## 1. Akun
Deployer (nonce sebelum/sesudah), owner 1–3 (EOA polos, code 0x).

## 2. Transaksi
| Tx | Hash | Blok (L2) | Waktu UTC | Gas used × harga = ETH | Status |
|---|---|---|---|---|---|
| T1 Safe | | | | | |
| T2 Factory | | | | | |

## 3. Bukti
- Output VerifyReservedDeployer (tempel apa adanya)
- `cast compute-address` cocok
- Safe: codehash proxy, singleton, VERSION, owners, threshold, module 0, guard 0
- SHA-256 file kontrak/script; keccak initcode factory

## 4. Verifikasi explorer
Status Blockscout per kontrak; lokasi file standard JSON.

## 5. Langkah berikutnya / prasyarat P2
```

### 10.3 `TOKEN_VALIDATION.md`

```markdown
# Validasi Token — <SYMBOL> (<CA>)
Sumber CA: <tim launch, kanal, waktu> · Sifat: read-only + fork lokal

## 0. Kesimpulan: GO / NO-GO
| Cek | Hasil | Bukti |
|---|---|---|
| L1 Keberadaan | | |
| L2 Identitas (+ pengumuman resmi [MANUAL]) | | |
| L3 Decimals/supply | | |
| L4 Sifat (owner/mint/pause/blacklist/fee/proxy) | | |
| L5 Bukan denylist | | |
| L6 Fork test kompatibilitas | | |
| L7 Source verified [MANUAL] | | |
| L8 Tx launch (hash, blok, pengirim) | | |

## 1. Getter on-chain
## 2. Selector fungsi / jenis kontrak
## 3. Fork test (perintah + output)
## 4. Item [MANUAL] untuk manusia
```

### 10.4 `P2_ACTIVATION_REPORT.md`

```markdown
# P2 — Aktivasi Factory
## 0. Status (Factory USED; Escrow/Splitter DEPLOYED; App NOT ACTIVE)
## 1. Transaksi: hash, blok L2, waktu, executor, Safe nonce, safeTxHash (script == on-chain), penanda tangan, gas
## 2. Argumen deploy(): token, decimals, setiap peran + sumber keputusan
## 3. Verifikasi: output Verify, getter on-chain, runtime codehash
## 4. Biaya kumulatif
## 5. Verifikasi explorer (constructor args ABI-encoded per kontrak)
## 6. Langkah berikutnya: integrasi app, ETH operator, kontrak lama, rotasi owner
## 7. Syarat tertulis yang belum ada (jujur)
```

### 10.5 `ADDRESSES.md`

```markdown
| Item | Alamat | Status | Tx / blok |
|---|---|---|---|
| Chain | Robinhood Chain mainnet 4663 | — | — |
| Admin Safe | | | |
| ReservedDeployer | | USED / UNUSED | |
| Escrow | | RESERVED / DEPLOYED | |
| Splitter | | RESERVED / DEPLOYED | |
| Token | | CONFIGURED | launch tx |
| Operator | | | |
| Arbiter / treasury | | | |
```

---

## 11. Troubleshooting

| Gejala | Penyebab | Tindakan |
|---|---|---|
| `pass --sender <deployer>` | Simulasi berjalan sebagai default sender Foundry | Tambahkan `--sender <deployer>` |
| `deployer nonce moved: factory would not land on EXPECTED_FACTORY_ADDRESS` | Ada tx dari deployer setelah dry-run | **Jangan dipaksa.** Dry-run ulang; bila alamat sudah diumumkan, laporkan ke approver |
| `mainnet broadcast requires ALLOW_MAINNET_BROADCAST=1` | Guard sengaja | Hanya manusia yang menyetelnya, saat broadcast yang disetujui |
| `mainnet: use --account/--ledger, not DEPLOYER_PRIVATE_KEY` | Ada key di env | `unset DEPLOYER_PRIVATE_KEY`; pakai keystore |
| `owner must be a plain EOA` / `safe: owner has code` | Owner punya code (kontrak/delegasi 7702) | Ganti owner dengan EOA polos |
| `safe: not canonical SafeProxy 1.4.1` | Alamat bukan Safe 1.4.1 kanonik | Periksa alamat Safe; buat lewat `CreateSafe` |
| `safe: module enabled` / `safe: guard set` | Safe punya module/guard | Hapus lewat tx Safe, atau pakai Safe baru |
| `a Safe already exists at the predicted address` | Kombinasi owner + salt sudah dipakai | Ganti `SAFE_SALT_NONCE` |
| `signature not from a Safe owner (wrong hash or nonce?)` | Hash/nonce/chain berbeda, atau salah keystore | Dry-run ulang, cocokkan `safeTxHash`, tanda tangan ulang |
| `fewer signatures than threshold` | Kurang tanda tangan | Kumpulkan ≥ threshold |
| `sig: v must be 27/28` | Tanda tangan bukan raw ECDSA atas hash | Pakai `cast wallet sign --no-hash` |
| `GS013` | Inner call (`deploy()`) revert di dalam Safe | Jalankan dry-run tanpa tanda tangan untuk melihat alasan revert |
| `GS020` / `GS026` | Tanda tangan terlalu pendek / signer bukan owner atau urutan salah | Gunakan script (otomatis mengurutkan); cek owner |
| `insufficient funds` | Executor kurang ETH | Isi ETH; tanda tangan lama tetap berlaku (Safe nonce belum terpakai) |
| `factory already used` | Aktivasi sudah terjadi | Jalankan Verify; jangan ulangi |
| `DecimalsMismatch` / `TokenNotAllowed` / `TokenHasNoCode` | Input token salah | Periksa CA dan decimals; cek denylist |
| `OwnerNotAdmin` / `RoleConflict` / `InvalidRole` | Peran salah | Perbaiki peran sesuai aturan constructor |
| `factory code != this build` | Commit/compiler berbeda dari yang di-deploy | Checkout commit/tag yang di-deploy; cek `foundry.toml` |
| `Error: Mac Mismatch` | Password keystore salah | Coba lagi; bila hilang, wallet itu tidak bisa dipakai (owner → `swapOwner`) |
| Forge mencoba `localhost:8545` walau `--rpc-url` diberikan | `--constructor-args` bersifat variadic dan menelan flag sesudahnya | Taruh `--constructor-args` **paling akhir** |
| `forge verify-contract` HTTP 403 | Cloudflare Blockscout | Verifikasi manual lewat UI dengan standard JSON |
| Receipt kosong / `null` | RPC publik tidak konsisten | Cek di explorer; jalankan Verify ulang; pertimbangkan RPC provider |

---

## 12. Jebakan yang sudah terbukti terjadi

| # | Kejadian | Pencegahan |
|---|---|---|
| 1 | EIP-7702 aktif di 4663: akun publik Anvil berisi delegasi sweeper | Jangan pakai akun Anvil bawaan di fork mainnet; owner wajib EOA polos; script mengecek `code.length == 0` |
| 2 | Code delegasi 7702 bisa menyetujui tx Safe tanpa private key (EIP-1271 `v=0` / `approveHash`) | Script mainnet menolak owner yang punya code |
| 3 | Private key tertempel di chat saat membuat wallet | Wallet dianggap bocor dan dibuat ulang (`…-v2`); pakai `cast wallet new <nama>` |
| 4 | Password keystore owner hilang dan baru ketahuan saat aktivasi | `cast wallet address --account` segera setelah membuat wallet |
| 5 | Semua keystore di satu laptop | Pisahkan owner ke orang/perangkat/hardware wallet |
| 6 | Executor kurang ETH saat aktivasi | Isi cadangan; tx gagal di RPC tidak memakai Safe nonce |
| 7 | Log `broadcast/` dari gladi fork tampak seperti deploy asli | Gladi menulis ke direktori sementara (`FOUNDRY_BROADCAST`) |
| 8 | Dry-run tanpa `--sender` menghasilkan prediksi salah | Script menolak default sender |
| 9 | `block.number` di script = blok L1 | Ambil blok L2 dari receipt/explorer untuk laporan dan indexer |
| 10 | Wallet operator 0 ETH setelah aktivasi | Isi sebelum go-live (Phase K) |
| 11 | Data indexer masih milik kontrak lama | Reset/backfill sebelum indexer diarahkan ke kontrak baru |
| 12 | Go/no-go hanya lisan | Minta tertulis di setiap gate |
| 13 | Rehearsal testnet dilewati | Boleh, asal dicatat sebagai risiko yang diterima |
| 14 | Kode factory belum di-commit saat deploy | Commit + tag dulu, atau catat SHA-256 setiap file |
| 15 | Alamat Safe testnet deterministik lintas chain | Jangan memakai alamat Safe testnet di mainnet |

---

## 13. Checklist induk

```markdown
### A–B Discovery & keputusan
- [ ] DEPLOYMENT_PLAN.md lengkap (kontrak, urutan CREATE, peran, integrasi, risiko)
- [ ] Baseline forge build/test lulus; SHA-256 kontrak anak dicatat
- [ ] G1: K1–K9 diputuskan tertulis

### C Wallet
- [ ] Keystore deployer + owner1–3 dibuat dengan `cast wallet new <nama>`
- [ ] `cast wallet address --account` lulus untuk setiap wallet
- [ ] Semua `cast code == 0x`; nonce deployer 0; deployer berisi ETH
- [ ] Owner dipisah perangkat/orang; backup keystore terpisah dari password

### D–E Implementasi & gladi
- [ ] Template diadaptasi; kontrak anak tidak berubah
- [ ] Unit + fuzz (ci) + fork Safe lulus; ukuran < batas
- [ ] fork-rehearsal.sh lulus
- [ ] (opsional) rehearsal testnet + verifikasi explorer
- [ ] Commit + tag / SHA-256 dicatat
- [ ] G2: go tertulis untuk P1

### F P1
- [ ] T1 dry-run → broadcast; Safe sesuai prediksi
- [ ] T2 dry-run → broadcast dengan EXPECTED_FACTORY_ADDRESS
- [ ] Verify P1: Factory DEPLOYED, anak RESERVED
- [ ] Verifikasi explorer factory (manual)
- [ ] P1_RESERVATION_REPORT.md + ADDRESSES.md; pengumuman "reserved"

### H Token
- [ ] CA diterima (hanya CA); L1–L8; fork test
- [ ] TOKEN_VALIDATION.md: GO; item [MANUAL] dicentang
- [ ] G3

### I P2
- [ ] Peran final; wallet operator dibuat & diverifikasi
- [ ] Activate dry-run → safeTxHash → G4 (go tertulis)
- [ ] ≥ 2 tanda tangan; dry-run dengan tanda tangan; broadcast
- [ ] Verify P2: DEPLOYED, terikat, token benar
- [ ] Verifikasi explorer kontrak anak; P2_ACTIVATION_REPORT.md

### J–K Integrasi & go-live
- [ ] Branch integrasi: ABI, alamat, env, indexer (blok P2), preflight
- [ ] Key operator di env server (Sensitive); arbiter tidak di server
- [ ] Staging lulus dengan token asli
- [ ] Operator berisi ETH; smoke test mainnet
- [ ] Kontrak lama ditutup; owner bermasalah dirotasi
- [ ] G5: go-live tertulis
```

---

## Lampiran A — Ringkasan perintah

```bash
# Chain & akun
cast chain-id --rpc-url $RPC
cast nonce <addr> --rpc-url $RPC ; cast code <addr> --rpc-url $RPC ; cast balance <addr> --rpc-url $RPC --ether
cast compute-address <sender> --nonce <n>

# Safe
cast call <safe> "getOwners()(address[])" --rpc-url $RPC
cast call <safe> "getThreshold()(uint256)" --rpc-url $RPC
cast call <safe> "nonce()(uint256)" --rpc-url $RPC
cast call <safe> "VERSION()(string)" --rpc-url $RPC
cast codehash <safe> --rpc-url $RPC        # 0xd7d408eb…fb4c

# Factory
cast call <factory> "admin()(address)" --rpc-url $RPC
cast call <factory> "used()(bool)" --rpc-url $RPC
cast call <factory> "predictedEscrow()(address)" --rpc-url $RPC

# Wallet (manusia)
cast wallet new <nama> ; cast wallet list ; cast wallet address --account <nama>
cast wallet sign --no-hash <safeTxHash> --account <nama>     # atau --ledger
cast wallet change-password <nama> ; cast wallet remove --name <nama>
```

## Lampiran B — Glosarium

| Istilah | Arti |
|---|---|
| CA | Contract address token |
| Factory / ReservedDeployer | Kontrak sekali-pakai yang memesan dan kemudian membuat kontrak anak |
| Kontrak anak | Kontrak inti proyek yang dibuat oleh factory (escrow, splitter, …) |
| Reserved | Alamat sudah pasti dan bisa dibaca on-chain, tetapi belum ada code |
| `safeTxHash` | Hash EIP-712 transaksi Safe (terikat chain, Safe, nonce, calldata) yang ditandatangani owner |
| Executor | Akun yang mengirim `execTransaction` (membayar gas); tidak perlu owner |
| EOA polos | Akun biasa tanpa code (tanpa delegasi EIP-7702) |
| Gate | Titik henti yang butuh persetujuan tertulis manusia |
