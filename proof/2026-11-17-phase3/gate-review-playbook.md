# Gate review — Phase 3 & kesesuaian dengan playbook pre-CA

- **Tanggal:** 17 Nov 2026
- **Branch:** `phase-3/contracts` (belum ada commit)
- **Sifat:** laporan baca-saja. Tidak ada kode, dokumen, konfigurasi, atau commit yang diubah saat laporan ini disusun.
- **Rujukan:** `ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md` (playbook), `deployguide-xofn.md`, `CLAUDE.md`, `PRD.md`, `proof/2026-11-17-phase3/notes.md`.

```
GATE REVIEW — Phase 3 & kesesuaian dengan playbook pre-CA
Status       : BELUM SIAP (untuk commit Phase 3)
Sudah selesai: 149 tes lulus, 0 gagal, 3 dilewati. Audit FROZEN bersih.
               Tidak ada rahasia di file kandidat commit.
Belum / risiko:
  - Pin lib/forge-std yang ter-stage adalah 15b2df9, bukan v1.9.7 (77041d2) yang dites.
  - Batas native drop 0 di Robinhood testnet membuat ekspansi testnet tidak mungkin
    dengan desain sekarang. Keterangan di catatan bukti dan di opsi pertanyaan P2 keliru.
  - launch() terbuka untuk publik begitu Graduator ter-deploy.
  - Review independen membaca versi sebelum perbaikan PoolSeeder; perbaikannya
    belum direview ulang pihak lain.
Butuh keputusan/aksi manusia:
  Untuk owner: setujui ruang lingkup commit; tentukan lokasi playbook; izinkan koreksi
               catatan bukti dan PRD; putuskan apakah editan doc di luar daftar file
               Phase 3 ikut commit atau dipisah.
  Untuk PM   : P1, P41, P42, P43, mekanisme gerbang launch, metode reservasi alamat,
               owner awal (Safe sejak constructor atau EOA lalu transfer), "launch terbatas".
Rekomendasi  : Jangan commit dulu. Perbaiki pin submodule dan dua koreksi dokumen, lalu
               putuskan mekanisme gerbang launch sebelum Phase 5, karena parameter ekonomi
               terkunci di constructor Graduator.
```

---

# Bagian 1 — Pertanyaan atas laporan Phase 3

## 1. Tes yang dilewati

Ketiga tes yang dilewati adalah fork test yang sama (`test/fork/ForkRecipe.t.sol`).

```
$ forge test --match-path "test/fork/*"          # tanpa env, dijalankan ulang
[SKIP] test_fork_arbitrum_recipeToRobinhood()
[SKIP] test_fork_base_recipeToRobinhood()
[SKIP] test_fork_robinhood_recipeToBase()
Suite result: ok. 0 passed; 0 failed; 3 skipped
```

```
$ FORK_RPC_BASE=https://mainnet.base.org FORK_RPC_ARBITRUM=https://arb1.arbitrum.io/rpc \
  FORK_RPC_ROBINHOOD=https://rpc.mainnet.chain.robinhood.com \
  forge test --match-path "test/fork/*" -vv
[PASS] ×3   (quote Standard 0,000145–0,000152 ETH; renounce + verify ±162k gas)
```

Output lengkap ada di `raw/forge-test-fork.txt`. Sesi review tidak menjalankannya ulang dengan jaringan.

- RPC yang dipakai publik, tanpa kredensial, alamatnya dari registry chain.
- `vm.createSelectFork` hanya membaca state lewat `eth_call` dan `getStorageAt`. Deploy token dan Registry di dalam tes terjadi di EVM lokal milik forge.
- Tidak ada key dan tidak ada transaksi ke jaringan.
- Fork test tidak menyentuh Uniswap asli. Asumsi fee 0,3% di `PoolSeeder` hanya teruji di AMM tiruan.

## 2. Cacat kebocoran likuiditas

- **Akar masalah.** `PoolSeeder` pertama menukar sebagian setoran untuk menggeser harga pool yang sudah ada ke harga target, lalu menyetor sisanya apa adanya. Setelah swap itu, aset yang dipegang tidak lagi seimbang. `mint` Uniswap v2 hanya menghargai sisi yang lebih kecil, jadi kelebihan di sisi lain menjadi cadangan milik semua LP secara pro rata. Pool tandingan seukuran likuiditas graduation mengambil ±98 juta token dan ±0,7 ETH di home, dan ±47% token likuiditas di chain ekspansi.
- **Perbaikan.** Swap sekarang menuju titik di mana rasio aset yang dipegang sama dengan rasio pool (`sqrt(k·(x+T)/(y+E))`), baru seluruhnya disetor. Tidak ada sisi berlebih yang tersisa.
- **Tes yang menangkapnya:**
  - `Graduate.t.sol`: `test_frontRun_largeOverpricedPoolDoesNotProfit`, `test_frontRun_largeUnderpricedPoolDoesNotProfit`, `testFuzz_frontRun_anyPoolDoesNotProfit`.
  - `Composer.t.sol`: `test_frontRun_largeSkewedPoolWithBridgedTokensDoesNotProfit`, `testFuzz_frontRun_anyRemotePoolDoesNotProfit`.
  - Keduanya memeriksa nilai LP protokol ≥ 99,7% dari setoran dan nilai keluar penyerang ≤ nilai masuk plus toleransi. Toleransi itu pilihan penulis kode.
- **Home vs ekspansi.** Satu library dipakai keduanya, jadi risikonya ada di dua tempat.
  - Home: atomik. Penyerang membeli token di curve lalu melakukan semuanya dalam satu transaksi `graduate`.
  - Ekspansi: perlu membridge token di jendela antara ack CONFIGURED dan compose.
  - Keduanya sekarang tertutup oleh perbaikan yang sama.
- **Risiko sisa:**
  - Perbaikan tidak direview ulang oleh pihak independen.
  - Dengan pool tandingan besar, harga pembukaan adalah harga gabungan, bukan harga target. Nilai LP protokol terlindungi, tetapi harga awal pool bisa digeser.
  - Fee AMM selain 0,3% bisa membuat swap penyeimbang gagal di pemeriksaan K dan mengunci `graduate()`. Fee Uniswap v2 di Robinhood belum diverifikasi.
  - P42 dan P43 dari review.

## 3. Library terhubung (P44)

**Kenapa perlu.** Bytecode `XofNToken` tertanam di `XofNGraduator` (41,8 KB) dan `XofNRemote` (32,3 KB), melewati batas 24.576 byte. Ketiga library dipakai oleh Graduator dan Remote (dari `linkReferences` artefak):

| Library | Isi | Ukuran |
|---|---|---|
| `XofNTokenDeployer` | bytecode token + CREATE3 | 15,9 KB |
| `PoolSeeder` | pembuatan dan pengisian pool | kecil |
| `TierLib` | fungsi eksternal `applyRecipe` dan `configHashOf` | kecil |

- **Urutan deploy.** Library harus ada sebelum Graduator dan Remote dibuat. Guide §5.2 menulis Registry → Curve → Graduator, jadi satu langkah harus ditambah di depan. `forge script` otomatis men-deploy library (di Anvil: tx 0–2). Bila memakai CreateX, initcode terhubung harus disusun manual.
- **Alamat CREATE3.** Alamat Graduator dan Remote tidak bergantung bytecode, jadi linking tidak mengubahnya. Alamat token = f(kontrak pen-deploy, salt). Library dijalankan lewat delegatecall, sehingga pen-deploynya tetap Graduator atau Remote. Bytecode Graduator dan Remote berbeda per chain bila alamat library berbeda per chain. Itu tidak memengaruhi alamat, hanya verifikasi.
- **Verifikasi source.** API Blockscout diblokir, jadi verifikasinya manual lewat UI:
  - tiga library, tanpa constructor args;
  - Registry, Curve, dan Graduator dengan peta `libraries` di standard JSON;
  - Remote dan Registry di tiap chain ekspansi;
  - token hasil `launch()` dibuat dari bytecode di library, jadi tiap token mungkin perlu verifikasi manual. Apakah Blockscout mencocokkan bytecode identik otomatis belum diuji.
- **Transaksi tambahan.** +3 per chain (tiga library): +9 untuk tiga chain mainnet dan +9 lagi untuk testnet. Gas-nya belum diukur terpisah. Permukaan audit bertambah tiga kontrak tanpa state dan tanpa dana.

## 4. Parameter yang terkunci di constructor

"Immutable" berarti variabel `immutable` atau storage tanpa setter.

| Kontrak | Parameter | Immutable? | Nilai tes lokal | Keputusan | Sebelum Phase 5? |
|---|---|---|---|---|---|
| Graduator | `endpoint` | ya | endpoint tiruan EID 1 | endpoint Robinhood | – |
| Graduator | `_owner` | tidak (Ownable); juga delegate OApp | Safe tiruan | owner awal (Bagian 2) | **ya** |
| Graduator | `Infra.registry`, `curveImplementation`, `router` (+ `factory`, `weth` diturunkan) | ya | mock | P9 | alamat saat deploy |
| Graduator | `Infra.lpRecipient` | ya | `0xdEaD` | **P41** | **ya** |
| Graduator | `saleSupply` | ya | 799,2 juta | **P16** | **ya** |
| Graduator | `startPrice` | ya | 1,5e9 wei/token | **P8** | **ya** |
| Graduator | `graduationThreshold` | ya | 4 ETH | **P8** | **ya** |
| Graduator | `callerReward` | ya | 0,01 ETH | **P15** | **ya** |
| Graduator | `expansionPairEth` | ya | 0,04 ETH | **P16, P42, P43** | **ya** |
| Graduator | per pathway: `sendLib`, `receiveLib`, `executor`, `maxMessageSize` 10.000, `confirmations` 15 | ya (storage, tanpa setter) | mock | P1 | **ya** |
| Graduator | per pathway: `receiveGas` 300k, `composeGas` 100k | ya | – | P4 | ukur ulang |
| Graduator | per pathway: `standardRequired[2]`, `fortressRequired[3]` (boleh kosong), `optionalDvns[2]` | ya | 5 DVN tiruan | **P1, P32, P36** | **ya** |
| Graduator | `ExpansionGas`: `deployGas` 7M, `deployAckValue` 0,01, `seedGas` 5M, `seedAckValue` 0,01 | ya | – | P4, **P42** | **ya** |
| Remote | `endpoint`, `_owner` | ya / tidak (Ownable) | – | – | owner: ya |
| Remote | `Infra`: `registry`, `router`, `lpRecipient`, `homeEid`, `ackConfiguredGas` 1,5M, `ackLockedGas` 1,5M | ya | – | P9, P41, P4 | ya (P41) |
| Remote | `pathwayToHome` (struktur sama dengan pathway Graduator) | ya | – | P1, P32 | **ya** |
| Registry | `endpoint` | ya | – | – | – |
| Registry | `_owner` | tidak (Ownable) | Safe tiruan | owner (Safe) | **ya** |
| Registry | `registrar` | sekali pasang oleh owner | Graduator atau Remote | go-live (Bagian 2 no. 4) | **ya** |
| Registry | `dvnAllowed` | owner bisa ubah | 5 DVN | **P37** | daftar awal: ya |

`XofNCurve` tidak punya parameter constructor; parameternya diberikan Graduator lewat `initialize` pada clone.

## 5. Fungsi admin dan berizin khusus

| Kontrak | Fungsi berizin | Pemegang di desain | Dampak: token belum Locked / sudah Locked |
|---|---|---|---|
| Registry | `setRegistrar` (sekali), `setDvnAllowed`, `transferOwnership`, `renounceOwnership` | Safe | Daftar putih hanya memengaruhi launch baru (P37). `setRegistrar` yang salah tidak bisa dibatalkan. Registrar jahat bisa mendaftarkan token palsu sebagai "XofN", jadi konsumen `verify` harus memeriksa bahwa `registrar` adalah Graduator yang dikenal. |
| Registry | `register`, `recordLock` | hanya registrar (Graduator atau Remote) | Tier dan hash tidak bisa diubah setelah `register`. `recordLock` revert bila `verify` belum true. |
| Graduator | `setPeer` (sekali per EID), `setDelegate` (OApp), `transferOwnership`, `renounceOwnership` | Safe | Menyangkut pathway infrastruktur. Delegate infrastruktur bisa mengubah DVN pathway itu dan memalsukan ack untuk token **belum** Locked (P38). Token Locked tidak terpengaruh. |
| Graduator | `launch`, `graduate`, `expandAndLock`, `retryRemote` | **siapa pun** | Jalur produk. |
| Graduator | `lzReceive` (ack) | endpoint + peer | Ack CONFIGURED memasang peer token. Ack LOCKED mengunci home. |
| Graduator | `sendLiquidityFromSelf` | kontrak itu sendiri | – |
| Remote | `setPeer` (sekali, hanya home EID), `setDelegate`, `transferOwnership`, `renounceOwnership` | Safe | Sama seperti Graduator. |
| Remote | `lzReceive`, `lzCompose`, `reAck`, `sendAckFromSelf` | endpoint / siapa pun (`reAck`) / diri sendiri | `reAck` hanya mengirim ulang ack. |
| Curve | `initialize` (sekali), `graduate` | pembuat clone / Graduator | – |
| Token | `setPeer`, `setDelegate`, `setEnforcedOptions`, `setMsgInspector`, `setPreCrime`, `renounceOwnership` | **Graduator atau Remote** (hanya jalur kode) | Tidak ada fungsi yang meneruskan panggilan bebas ke token. Setelah Locked tidak ada pemegang. |
| Token | `transferOwnership` | ditutup, selalu revert | – |
| Library | tidak ada | – | Fungsi eksternal tanpa state. Dipanggil langsung oleh siapa pun, dampaknya nol: `TierLib` ditolak endpoint, `PoolSeeder` hanya memakai saldonya sendiri. |

**Temuan yang harus masuk script deploy.** `OApp.setDelegate` hanya bisa dipanggil owner. `transferOwnership(Safe)` saja **tidak** memindahkan delegate Graduator dan Remote di endpoint, sehingga EOA lama tetap menjadi delegate pathway infrastruktur. `02_TransferToSafe` di guide wajib memanggil `setDelegate(Safe)` **sebelum** `transferOwnership`.

## 6. P37, P38, P39: dasar implementasi dan biaya bila diputuskan lain

Dasar yang dipakai adalah rekomendasi di kolom P# bila ada, selain itu usulan penulis kode. Keduanya tanpa konfirmasi PM. CLAUDE.md §2 menyuruh "ikuti rekomendasi tertulis, atau tanyakan", dan pertanyaan tidak diajukan. Untuk P37, kolom itu hanya memuat contoh ("mis. Registry milik Safe"), jadi dasarnya lemah.

| # | Bergantung pada pilihan | Bila PM memutuskan lain |
|---|---|---|
| P37 | `XofNRegistry.dvnAllowed/setDvnAllowed`, `TierLib.validate` dan `requireAllowed`, constructor Graduator dan Remote, `Graduator._registerLaunch` | DVN hanya dari constructor: **kecil** (hapus daftar putih, sederhanakan `validate`, ubah tes `Factory.t.sol` dan `Registry.t.sol`). Daftar putih dinamis yang menambah DVN di luar constructor: **besar**, karena pathway tersimpan dan hash tier berubah. |
| P38 | `setPeer` sekali pasang, `_requireInfraPinned`, `_lzReceive` yang memercayai alamat token remote di ack | Kunci penuh (delegate 0): kode kecil, tetapi pathway tidak pernah bisa diperbaiki. Opsi murah: Graduator menghitung alamat token remote dari `XofNTokenDeployer.predict(remote, salt)` dan menolak ack yang berbeda. Perubahan kecil di satu fungsi, tetapi menyentuh kontrak yang sudah lulus tes. |
| P39 | `Create3.sol`, `XofNTokenDeployer`, salt di `launch`, `Remote._lzReceive`, `homeTokenOf`, `Create3.t.sol` | Alamat seragam sebagai syarat: tanpa kode baru, tetapi Graduator dan Remote harus beralamat sama (deploy via CreateX dengan salt terjaga di kedua chain). Tanpa CREATE3 sama sekali: **sedang** (hapus salt dan prediksi, ubah tes). |

## 7. P42 dan testnet (analisis)

`nativeCap` Robinhood testnet → Base Sepolia dan Arbitrum Sepolia = 0 (`proof/2026-11-17-phase0-addendum/notes.md`).

- `ExecutorFeeLib` asli (`node_modules/@layerzerolabs/lz-evm-messagelib-v2/contracts/ExecutorFeeLib.sol:196`) me-revert `Executor_NativeAmountExceedsCap` bila total value di opsi melebihi cap.
- Desain sekarang mengirim value di **tiga** tempat: `deployAckValue` pada pesan DEPLOY, serta `expansionPairEth` + `seedAckValue` pada compose.
- Dengan cap 0, `quote` revert. `expandAndLock` revert di langkah pertama, dan `retryRemote` juga tidak bisa jalan.
- **Kesimpulan: ekspansi testnet tidak mungkin dengan desain sekarang, dan Fase 2a di guide tidak bisa dijalankan.**
- **Koreksi.** Catatan bukti dan opsi pertanyaan P2 menulis bahwa ETH pasangan di testnet "harus disetor pemanggil retry compose". Itu salah: kegagalannya terjadi di `quote`, bukan di compose. Pilihan P2 yang diambil sebagian bersandar pada klaim itu.
- Di mainnet, cap Robinhood→Base 0,05 ETH sudah pas-pasan. Compose value di tes = 0,04 + 0,01 = 0,05 ETH, sehingga pool ekspansi di Base praktis ≤ 0,04 ETH.

Opsi (keputusan di PM):

1. Pisahkan pendanaan ETH pasangan dari value executor. Remote memakai ETH yang sudah ada di saldonya, dan PM mengirimnya langsung di testnet. Menyentuh Graduator, Remote, dan tes.
2. Konfigurasi khusus testnet dengan semua value 0 plus pendanaan lewat Remote. Perubahan kode sama dengan opsi 1; constructor harus menerima `expansionPairEth` yang tidak lewat executor.
3. Minta LayerZero menaikkan `nativeCap` testnet (bisa berubah kapan saja).
4. Pool satu sisi (opsi P2 lain), tanpa ETH lintas chain. Composer baru.
5. Lewati rehearsal omnichain di testnet dan andalkan fork test. Lebih lemah, dan guide §7 mensyaratkan 2a.

## 8. Kutipan keputusan owner

Ketiganya bukan ketikan owner. Owner memilih opsi dari `AskUserQuestion` yang ditulis agent, dengan opsi rekomendasi di urutan pertama. Jawaban persis dari alat:

> `"P28 — urutan ekspansi. …"="Resep dulu (Recommended)"`
> `"Dependency Phase 3. … Boleh dipasang (devDependencies, versi exact)?"="Setuju, pasang (Recommended)"`
> `"P2/P9 — aset pasangan dan AMM untuk pool di chain ekspansi. … Desain mana yang dibangun di Phase 3 …?"="Uniswap v2 + ETH (Recommended)"`

Instruksi awal owner: *"sekarang lanjutkan phase 3 sampai selesai pokok phase deploy testnet dan mainnet jangan di sentuh dulu"*.

Catatan:

- Kalimat "Saya catat sebagai keputusan owner 17 Nov 2026" ada di teks opsi buatan agent, bukan ucapan owner.
- Opsi P2/P9 menyebut "v2 di ketiga chain", jadi mencakup pool home. Opsi itu juga memuat klaim testnet yang keliru (no. 7).
- PRD P28 dan P2 menyebut keputusan "Owner/PM". Pembuatan CA dan launch ada di PM. Apakah pilihan owner mengikat PM tidak diketahui.

## 9. Gerbang

- Dasar untuk perpindahan Phase 2 → 3 hanya instruksi "lanjutkan phase 3". Persetujuan gerbang tidak ditanyakan, padahal CLAUDE.md §4 mencatat Phase 0, 1, dan 2 "menunggu persetujuan gerbang".
- Untuk Phase 0 → 1 dan 1 → 2 tidak ada catatan persetujuan eksplisit di sesi ini. Yang ada hanya commit Phase 1 dan Phase 2 oleh pengguna git `crazysmile` pada hari yang sama. Itu petunjuk, bukan persetujuan.
- Agent seharusnya bertanya sebelum Phase 3.

## 10. Audit FROZEN (CLAUDE.md §5.1)

| Butir | Hasil |
|---|---|
| `broadcast/` | Tiga file `run-*.json`, semuanya `chain 31337`, dari `DeployLocal.s.sol` (percobaan pertama yang macet, ulangan, dan terbaru). Satu pengirim: akun dev Anvil `0xf39F…`. |
| `deployments/` | Hanya `local.json`. |
| `script/` | Hanya `script/local/DeployLocal.s.sol` dan `script/local/LocalRelay.sol`. Keduanya revert bila `block.chainid != 31337` (`DeployLocal.s.sol:101`, `LocalRelay.sol:55`). |
| `foundry.toml` | Tanpa `[etherscan]`, verifier, atau profil deploy. `[rpc_endpoints]` hanya tiga alias `FORK_RPC_*` dari env. |
| `.env*`, keystore | Tidak ada `.env*` di repo. Tidak ada keystore xofn di `~/.foundry/keystores` (hanya nama berkas yang dilihat, termasuk keystore proyek lain; isinya tidak dibuka). |
| Perintah berisiko di repo | Tidak ada `--account`, `--private-key`, atau `--ledger` di berkas non-dokumen. `--broadcast` hanya muncul di komentar script, README, dan catatan bukti, semuanya untuk Anvil. |
| Supabase | `git status supabase src` kosong. Hanya migrasi `0001` lama. CLI `supabase` dan `vercel` tidak terpasang. |
| Deploy aplikasi | `npm run build` hanya lokal; tidak ada deploy. |

**Yang tidak bisa dibuktikan dengan artefak:** log shell lengkap. Pernyataan ini bersandar pada transkrip sesi:

- `cast send` hanya ke `http://127.0.0.1:8546`, lewat skrip `/tmp/xofn-local-smoke.sh`.
- `forge script --broadcast --unlocked --sender` hanya ke node yang sama.
- Fork test hanya membaca dari RPC publik.

## 11. Kesiapan commit

- **56 berkas** (daftar penuh di `/tmp/xofn-commit-files.txt`):
  - `contracts/` (13), `test/` (19), `script/local/` (2), `proof/2026-11-17-phase3/` (8);
  - `config/tiers.json`, `deployments/local.json`, `foundry.toml`, `foundry.lock`, `remappings.txt`, `.gitmodules`;
  - `package.json` (+8 devDependency exact), `package-lock.json`;
  - lima dokumen: PRD, ARCHITECTURE, CLAUDE, USER_FLOWS, README;
  - `ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md` (belum ter-track, ditambahkan owner).
- **Pemindaian rahasia: bersih.**
  - Tidak ada private key, mnemonic, atau URL RPC berisi key.
  - Satu-satunya string `0x`+64 hex adalah konstanta codehash dan slot EIP-1967 di playbook.
  - URL di kode hanya `http://127.0.0.1:8545` dan `https://metadata.layerzero-api.com/v1/metadata`.
- **Submodule `lib/forge-std`: masalah.**
  - Gitlink yang ter-stage: `15b2df92a05d4d2f76a06653872fefb287e0e01c`.
  - Worktree dan tes memakai v1.9.7 `77041d2ce690e692d6e03cc812b57d1ddaa4d505`. Status `AM` menunjukkan selisih itu.
  - Bila dicommit apa adanya, repo mengunci versi yang tidak pernah dites. Perbaikannya `git add lib/forge-std` setelah owner setuju.
- **`deployments/local.json`.** Alasan ikut commit: mode `simulation` di Phase 4 butuh manifest, dan guide menyebut `local.json` sebagai satu-satunya manifest yang boleh ada. Catatan:
  - Alamat hanya valid di Anvil baru dengan script yang sama.
  - `deployBlock: 0` bukan blok deploy sebenarnya.
  - Owner-nya akun dev `0xf39F…`, yang di mainnet berisi delegasi 7702 (playbook §12 #1). Jangan pernah dipakai di luar lokal.
  - Alternatif: masukkan ke `.gitignore` dan buat ulang dengan satu perintah. Keputusan owner.
- **Usulan pesan commit** (belum dijalankan):

```
feat(contracts): phase 3 local-only contracts and tests (OFT token, curve, graduator, remote, registry)

XofNToken/Curve/Graduator/Remote/Registry + linked libraries, 149 forge tests
(unit, fuzz, invariant, multi-endpoint, read-only fork), local Anvil deploy
script. No public-network scripts, manifests, keys or transactions.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

**Pengakuan tambahan:**

- Editan dokumen (PRD, ARCHITECTURE, CLAUDE, USER_FLOWS, README) ada di luar daftar "Boleh" Phase 3 di CLAUDE.md §5.2. Pembenarannya CLAUDE.md §11 (tabel status), tetapi PRD dan ARCHITECTURE diubah lebih luas dari itu.
- Pengukuran gas dilakukan dalam satu transaksi tes, jadi angkanya lebih rendah dari kenyataan.

---

# Bagian 2 — Meluruskan soal deploy, CA, dan launch

## 1–2. Konteks dan bagian playbook yang relevan

- **Cognita, Fademan, Assize:** kontrak inti menyimpan alamat token sebagai `immutable`. Token dibuat PM lewat launchpad, jadi dev menunggu CA. Reservasi alamat dengan factory sekali-pakai menyelesaikan itu.
- **XofN:** tidak ada token luar. Token adalah **hasil** `Graduator.launch()`, dan tiap pemanggil publik membuat token baru dengan alamat baru. Reservasi alamat anak per token tidak relevan. Yang ada adalah kontrak infrastruktur yang tetap (Registry, Curve impl, Graduator, Remote). Begitu Graduator ter-deploy, `launch()` terbuka untuk siapa pun dan uang nyata bisa masuk lewat `buy`. Masalah yang sebenarnya adalah **kapan launchpad boleh hidup**.

| Tetap relevan | Tidak relevan / perlu adaptasi |
|---|---|
| §1.1–1.3 (larangan agent, dry-run dipin, format gate) | Premis "menunggu CA" dan `deploy(token, decimals, roles)` |
| §4 fakta Robinhood | §3.3 #3 "sekali pakai", #4 validasi token, #6 validasi peran |
| §5 peran, §6 status alamat | Phase H (validasi CA), Phase I (aktivasi dengan token) |
| §9.3–9.5 Safe v1.4.1 + guard script | Prediksi `CREATE(factory, n)` untuk anak per token |
| §9.4, §9.8, §9.10 (guard, Verify, gladi) | Factory yang menyimpan initcode anak (tidak muat, lihat no. 3) |
| §11–12 jebakan | – |

## 3. Perbandingan deployguide vs playbook vs kontrak

| Aspek | deployguide | Playbook | Kontrak sekarang | Risiko & rekomendasi |
|---|---|---|---|---|
| Reservasi alamat | CreateX CREATE3 + `DEPLOY_SALT=xofn-v1` | Factory + `CREATE(factory, nonce)` | `Create3` hanya untuk token. Alamat infrastruktur belum ditentukan. Library menambah 3 deploy per chain. | CREATE3 dengan salt polos (tidak terjaga pemanggil) rawan diserobot. **Rekomendasi:** salt CreateX yang terikat deployer. Factory playbook membawa initcode anak di runtime, sedangkan initcode Graduator saja 28.142 B > batas runtime 24.576 B, jadi pola aslinya **tidak muat**; playbook sendiri menyuruh melaporkannya. Bila tetap mau factory, ia harus menerima initcode lewat calldata dengan hash dipin. |
| Owner awal | deployer EOA lalu `02_TransferToSafe` | Safe sejak constructor | Parameter `_owner`. Delegate OApp = `_owner` saat constructor. | Safe sejak constructor berarti seluruh wiring (`setRegistrar`, `setPeer`, pathway, `setDvnAllowed`) butuh tanda tangan Safe, dan Safe UI di 4663 belum terbukti. EOA lalu transfer berarti ada jendela kunci tunggal. **Rekomendasi:** deployer EOA menyelesaikan wiring selama launch masih tertutup, lalu `setDelegate(Safe)` → `transferOwnership(Safe)`. Tambahkan cek Safe v1.4.1 dan EOA polos di script. |
| Kapan launchpad terbuka | di 1a/1b, tidak diatur | Reserved ≠ live; Safe mengaktifkan | **Segera setelah deploy**, tanpa gerbang | Risiko tertinggi. Lihat no. 4. |
| Smoke test dan "launch terbatas" | guide §5.3 dan §6 menyebut keduanya tanpa pelaksana | CA dan launch urusan PM | Tidak ada mekanisme "terbatas" | Pelaksana harus PM. "Terbatas" tidak bisa ditegakkan on-chain tanpa fungsi admin, yang dilarang brief. Putuskan pembatasan sosial/UI/ekonomi. |
| Siapa broadcast | keystore `--account xofn-deployer` | hanya manusia (keystore/ledger) | tidak ada script publik | Selaras. Script `01_`, `02_`, `10_`, `11_` belum ada. Bila dibuat, wajib memakai pola `GuardedScript` (DRY RUN vs BROADCAST). |
| Status alamat | `verifiedSource` saja | P0–P4 (Reserved/Deployed/Live) | `mode.ts`: ada manifest → `live` | Aplikasi bisa menganggap "ada manifest = live". **Rekomendasi:** field `status` di manifest, dan `resolveMode` mensyaratkannya. |
| EIP-7702 | tidak disebut | owner wajib EOA polos, cek `code.length == 0` | constructor menerima owner apa pun | Cek di script deploy (tanpa mengubah kontrak). Opsional: cek di constructor (ubah kontrak, uji ulang). Jangan pakai akun Anvil di fork. |
| Blockscout API diblokir | `--verify --verifier blockscout` | verifikasi manual lewat UI | – | Perintah di guide pasti gagal. Verifikasi enam sampai delapan kontrak per chain lewat UI, termasuk library. |
| Safe UI untuk 4663 | guide §5.4 mengandalkan Safe | jalur CLI (`cast wallet sign`) | – | Siapkan jalur CLI. Wiring Safe yang panjang makin berat (lihat baris Owner awal). |
| `block.number` = L1 | tidak disebut | ambil blok L2 dari receipt | `DeployLocal` menulis `deployBlock` dari `block.number` | Di Orbit nilainya blok L1. `deployBlock` di manifest publik wajib blok L2 dari receipt. Registry memakai `block.timestamp`, jadi aman. |
| RPC publik bukan archive | – | jangan `eth_getCode` historis | `verify` dan Check membaca state sekarang | Aman untuk `verify`. Indexer dan backfill butuh provider (P21). |

## 4. Usulan pola "reservasi sekarang, aktivasi oleh Safe" (tidak dikerjakan)

**Temuan yang memudahkan.** `launch()` memanggil `registry.register`, yang hanya boleh dipanggil `registrar`. Selama Safe belum memanggil `Registry.setRegistrar(graduator)` (sekali, tidak bisa dibatalkan), `launch()` revert di `OnlyRegistrar`. Jadi **`setRegistrar` sudah berfungsi sebagai saklar go-live** tanpa fungsi admin baru di Graduator, sesuai batasan brief. Perilaku ini terlihat lewat versi awal tes yang kemudian diganti, jadi belum punya tes khusus dan harus ditambah.

**Opsi A — deploy dorman + `setRegistrar` oleh Safe.**

- Graduator, Curve impl, dan Registry di-deploy, tetapi launch tertutup sampai Safe memanggil `setRegistrar`.
- Tidak mengubah kontrak yang sudah lulus tes; hanya menambah tes.
- Parameter ekonomi dan pathway sudah **beku saat deploy** (P36), jadi P1, P8, P15, P16, P41, P42, P43 harus final sebelum itu.
- Alamat "reserved" berarti kontraknya sudah ada tetapi dorman.

**Opsi B — reservasi murni lewat factory** (aktivasi membuat Graduator saat PM siap).

- Parameter bisa diputuskan belakangan.
- Butuh factory baru (initcode lewat calldata, hash dipin), audit tambahan, dan melenceng dari playbook §3.3.
- Wiring setelah aktivasi tetap butuh tanda tangan Safe.

**Pertimbangan P38, P39, P44:**

- P38: pasang peer dan pathway infrastruktur **sebelum** `setRegistrar`, supaya tidak ada token yang lahir di atas pathway belum terkunci.
- P39: alamat token seragam butuh Graduator dan Remote beralamat sama, jadi ikut keputusan metode reservasi.
- P44: library menambah tiga deploy dan tiga verifikasi per chain, dan harus ada sebelum Graduator atau Remote dibuat.

**Keputusan PM:**

- Opsi A atau B.
- Siapa dan kapan memanggil `setRegistrar` (pelaksana, kuorum, tanda tangan tertulis).
- Bahwa "launch terbatas" tidak bisa ditegakkan on-chain setelah `setRegistrar` dipanggil.

**Dampak pada kontrak yang sudah lulus tes:**

| Pilihan | Dampak |
|---|---|
| Opsi A | Kontrak tidak berubah; hanya tes tambahan. |
| Opsi B | Kontrak baru dan tes baru; kontrak lama tidak diubah. |
| Pengerasan opsional (cek EOA/7702 di constructor, validasi alamat token remote di ack) | Mengubah kontrak, sehingga **seluruh tes harus diulang**. |

## 5. Usulan perubahan dokumen (tidak dikerjakan)

**Lokasi playbook.** Simpan di root repo, seperti Fademan. Tambahkan ke CLAUDE.md §2 (urutan baca) dengan label "acuan saat Phase 6–7 dibuka; tidak membuka deploy". `docs/deployment/` baru dibuat saat `DEPLOYMENT_PLAN.md` ditulis.

**CLAUDE.md §5.1 (tambah):**

```
+ - Memanggil launch(), buy, sell, graduate, expandAndLock, retryRemote, retryCompose, reAck
+   atau fungsi produk lain di jaringan publik (testnet maupun mainnet), termasuk untuk
+   smoke test. Hanya boleh di Anvil lokal.
+ - Membuat CA token atau me-launch token di jaringan publik. Itu tugas PM, bukan tugas agent.
+ - Menyiapkan perintah broadcast dengan --private-key. Deploy hanya lewat --account atau
+   --ledger, dijalankan manusia.
```

**CLAUDE.md §9 (tambah):**

```
+ - ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md §1 berlaku sebagai aturan agent untuk Phase 6–7.
+   Agent memakai format gate §1.3 pada tiap akhir phase.
+ - Reserved ≠ Deployed ≠ Live. Aplikasi tidak boleh diarahkan ke alamat berstatus Reserved.
```

**ARCHITECTURE §5.6 (ubah):**

- Tambahkan urutan deploy: library (3 per chain) → Registry → Curve impl → Graduator; peer dan pathway infrastruktur → `setRegistrar` sebagai saklar go-live yang dipanggil Safe.
- Ubah `02_TransferToSafe`: `setDelegate(Safe)` dulu, lalu `transferOwnership`, untuk Registry, Graduator, dan Remote.
- Verifikasi source lewat UI. `deployBlock` dari receipt (blok L2). Manifest memuat `status`.
- Tulis bahwa broadcast hanya oleh manusia dengan keystore atau ledger.

**PRD §11, nomor baru:**

| # | Topik |
|---|---|
| P47 | Gerbang launch dan saklar go-live (Opsi A/B; pelaksana `setRegistrar`) |
| P48 | Metode reservasi alamat (CreateX terjaga vs factory dengan initcode calldata vs deploy dorman) dan dampak library |
| P49 | Owner awal (Safe sejak constructor vs EOA lalu transfer), termasuk `setDelegate` |
| P50 | "Launch terbatas" yang tidak bisa ditegakkan on-chain; pembatasan di UI/sosial |
| P51 | Pendanaan ETH pasangan di testnet (cap 0) |
| P52 | Status manifest dan mode aplikasi (Reserved/Deployed/Live) |
| P53 | CA dan launch adalah tugas PM (aturan, bukan keputusan teknis) |

**Koreksi atas kesalahan sendiri:**

- Catatan bukti dan PRD P42/P2: hapus klaim "disetor pemanggil retry compose" di testnet.
- Perbaiki pin submodule `lib/forge-std`.
- Ganti label "keputusan owner" di PRD sesuai catatan Bagian 1 no. 8.
