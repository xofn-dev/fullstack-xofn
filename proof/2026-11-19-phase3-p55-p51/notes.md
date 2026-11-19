# Phase 3 — Penutupan P55 dan implementasi P51 (lokal saja)

- **Tanggal:** 19 Nov 2026
- **Branch:** `phase-3/p55-p51` dari `main` (`b64cdc5`). Tanpa commit.
- **Dasar:** keputusan PM 19 Nov 2026 di `proof/2026-11-19-keputusan-pm/lembar-keputusan.md`:
  - P55 diperbaiki;
  - P51 opsi 1, varian "semua ETH curve masuk pool home".
  - Atas temuan review independen: perbaiki semua temuan review pertama; review kedua MEDIUM-1 diterima sebagai biaya yang diketahui, MEDIUM-2 diberi faktor keamanan ½.
- **Sifat pekerjaan:** kontrak, tes forge, `script/local/`, dan dokumen.
  - Semua transaksi hanya ke Anvil lokal (chain ID 31337) dari akun dev Anvil.
  - Fork test hanya membaca, lewat RPC publik tanpa kredensial.
  - Tidak ada key, keystore, `.env`, broadcast publik, atau perubahan `src/`.

## Laporan gate

```
GATE Phase 3 — Kontrak lokal (penutupan P55, implementasi P51)
Status       : SIAP untuk review PM (dengan catatan di "Belum / risiko")
Sudah selesai: P55 ditutup: sync sebelum swap penyeimbang + fallback sync bila LP setoran = 0.
               P51: tanpa value executor; semua ETH curve ke pool home; Remote membayar
               ETH pasangan + ack dari saldonya; batas subsidi di constructor Graduator.
               Dua review independen; semua temuan MEDIUM ditangani atau diterima PM.
               Bukti: raw/forge-test*.txt, raw/forge-test-before-fix.txt, raw/test-anvil.txt,
               raw/web-lint-typecheck-test.txt, raw/build-*.txt.
Belum / risiko: Angka P1, P8, P15, P16, P41, P42, P43 belum final (wajib sebelum Phase 5).
               Harga basi saat ekspansi (P60) diterima sebagai biaya yang diketahui.
               Perubahan terakhir (faktor keamanan ½ + tes) tidak direview independen ulang.
               Audit eksternal belum dilakukan.
Butuh keputusan/aksi manusia: persetujuan gerbang Phase 3; angka P42 (expansionPairEth,
               di bawah batas constructor) bersama P8/P16; commit bila diinginkan.
Rekomendasi  : setujui gerbang Phase 3 untuk lokal, lalu finalkan angka P1/P8/P15/P16/P41/
               P42/P43 sebelum Phase 5 (audit).
```

## Perubahan kontrak

### `contracts/libraries/PoolSeeder.sol` (P55)
- `sync()` dipanggil sebelum menghitung swap penyeimbang bila pair sudah punya LP. Tanpa itu, saldo yang belum di-`sync` dihitung pair sebagai input swap, sedangkan ukuran swap dihitung dari cadangan, sehingga penyerang mengambil sebagian setoran.
- Bila bagian LP setoran akan dibulatkan ke 0 (pool tandingan dengan total LP kecil dan cadangan sangat besar), aset disetor lalu `sync()` alih-alih `mint`. Tanpa ini, `mint` revert selamanya dan ekspansi macet. Temuan review independen pertama (MEDIUM #1).
- NatSpec dikoreksi. Kerugian pembulatan paling besar nilai satu unit LP pool ditambah fee swap penyeimbang. Pada pool biasa ini ±1,7e-6 setoran; pada pool tandingan kecil bisa lebih, tetapi penyerang selalu membayar lebih dari yang ia ambil.
- ABI tidak berubah.

### `contracts/XofNGraduator.sol` (P51, P42)
- `graduate()`: semua ETH curve (dikurangi insentif) masuk pool home. `tokensPerChain = token × pe / (ETH pool home + n × pe)`, dibulatkan ke dust, sehingga semua pool dibuka pada harga yang sama.
- `reservedPairEth` dihapus. Graduator hanya memegang escrow fee pemanggil.
- `ExpansionGas` menjadi `{deployGas, seedGas}`. Opsi DEPLOY dan compose tidak membawa value executor.
- `_sendLiquidity`, `quoteRetry`, dan `quoteExpandAndLock`: fee LayerZero seluruhnya dibayar pemanggil. Signature tetap.
- Validasi constructor:
  - `ambang > insentif`;
  - `expansionPairEth ≠ 0`;
  - batas subsidi `2·n·pe·saleSupply < (ambang − insentif)·(TOTAL − saleSupply)`. Dengan konstanta tes, batasnya ±0,249 ETH per chain; nilai tes 0,04 ETH.
- NatSpec `retryRemote` dan `quoteRetry`: bila token remote sudah ada tetapi ack tertunda, pakai `XofNRemote.reAck`.

### `contracts/XofNRemote.sol` (P51)
- `lzCompose`: syarat `address(this).balance ≥ pairEth`; `msg.value` pemanggil ikut terhitung. Error tetap `InsufficientPairAsset`.
- Ack otomatis dari saldo hanya saat state berubah. DEPLOY ganda tidak memicu ack, sehingga tidak bisa menguras saldo.
- NatSpec: sumber dana adalah saldo kontrak yang diisi tim, dipakai bersama, dan tidak bisa ditarik.

## Tes

| File | Isi |
|---|---|
| `test/unit/PoolSeeder.t.sol` (baru) | Donasi WETH/token tanpa `sync` (home + remote), varian blokir total LP 1001, pembulatan LP ke 0, fuzz pool tandingan sampai ±500 jt token / 10 ETH, fuzz total LP kecil + donasi dua sisi. Asersi: penyerang tidak untung (1e-5); kerugian protokol ≤ 1e-5 + nilai satu unit LP |
| `test/lz/SubsidyFarm.t.sol` (baru) | Pemerahan pembeli tunggal (nilai tes dan 99% batas): penyerang rugi ≥ 0,7× subsidi yang ia picu. Harga basi (seperempat dan seluruh token dijual sebelum ekspansi): kebocoran ada, tetapi ≤ `expansionPairEth` per chain |
| `test/helpers/XofNTestBase.sol` | Seluruh suite berjalan dengan `nativeCap = 0` (seperti Robinhood testnet). Saldo Remote 10 ETH. `ExpansionGas` dua field. `_economics()` virtual |
| `test/unit/Graduate.t.sol`, `test/lz/Composer.t.sol` | Rumus pembagian baru; donasi tanpa `sync` (HIGH + varian blokir) di jalur `graduate` dan `lzCompose`; toleransi 99,7% → 1e-5; compose tanpa value; Remote tanpa saldo → revert → diisi → berhasil |
| `test/lz/Expansion.t.sol` | Pesan ekspansi tanpa value executor; ETH pasangan + ack dibayar saldo Remote; DEPLOY basi tidak memakai saldo; ack tertunda saat Remote kosong → `reAck`; akuntansi ETH Graduator |
| `test/unit/Factory.t.sol` | Validasi ekonomi baru; batas subsidi dan skalanya terhadap jumlah chain |
| `test/fork/ForkUniV2.t.sol` | Pair Uniswap v2 asli di Robinhood, Base, Arbitrum: kasus PoC donasi, varian blokir, dan total LP 1001 + donasi dua sisi |
| `test/lz/GoLive.t.sol`, `test/invariant/Invariant.t.sol` | Langkah "tim mengisi saldo Remote" di urutan deploy; invarian `saldo Graduator ≥ escrow` |

**Bukti merah sebelum perbaikan** (`raw/forge-test-before-fix.txt`, PoolSeeder versi `main`): semua tes donasi gagal.
- **Jalur graduate/compose:** protokol kehilangan ±28% setoran, atau `INSUFFICIENT_LIQUIDITY_MINTED`.
- **Fork test pair asli di 3 chain:** protokol kehilangan ±28% setoran (5,66 dari 7,82 ETH).
- **Fuzz LP kecil:** penyerang **untung**.

## Review independen

Dua subagent baru, masing-masing hanya diberi kode dan diff tanpa kesimpulan penulis, dan bekerja di salinan `/tmp`. PoC-nya dijalankan ulang oleh penulis sebelum ditindaklanjuti.

| Review | Temuan | Tindak lanjut |
|---|---|---|
| 1 | MEDIUM #1: blokir ekspansi permanen lewat pembulatan LP bila `pe` kecil (sudah ada sebelum perubahan) | Diperbaiki: fallback `sync` |
| 1 | MEDIUM #2: subsidi Remote bisa diperah bila `pe` besar | Diperbaiki: batas di constructor |
| 1 | LOW #3: klaim "≤ 1e-5" tidak umum | NatSpec dan asersi dikoreksi. Fuzz profil CI juga menemukannya; asersi kini "1e-5 + satu unit LP" |
| 1 | LOW/INFO #4: `retryRemote` di `DeploySent` bisa sia-sia | NatSpec `retryRemote` dan `quoteRetry` |
| 1, 2 | INFO: saldo Remote tidak bisa ditarik, dipakai bersama, dan compose gagal harus diulang manual | Catatan PM di bawah |
| 2 | MEDIUM-1: harga basi saat ekspansi; subsidi diambil arbitrase | **Diterima PM** sebagai biaya yang diketahui (PRD P60). Tes membuktikan batasnya |
| 2 | MEDIUM-2: dekat batas, pemerahan hampir gratis (rasio 1:76) | Diperbaiki: faktor keamanan ½. Pada 99% batas baru, penyerang rugi ≥ 0,7× subsidi |
| 2 | Dinyatakan aman | Fallback LP-nol, rumus pembagian, escrow/refund, pemakaian saldo Remote, penurunan batas untuk pembeli tunggal |

## Pemeriksaan (versi final)

| Pemeriksaan | Hasil |
|---|---|
| `forge build` | lulus |
| `forge fmt --check contracts test script` | bersih |
| `forge test` | 184 lulus, 0 gagal, 6 dilewati (fork tanpa env RPC) — `raw/forge-test.txt` |
| `forge test --match-contract Invariant` | 5 invarian + 1 tes lulus — `raw/forge-test-invariant.txt` |
| `forge test --profile ci` | 184 lulus, 0 gagal, 6 dilewati — `raw/forge-test-ci.txt`. Run CI sebelumnya menemukan 2 contoh balik LOW #3; asersi diperbaiki, lalu fuzz `PoolSeeder` 20.000 run dan fuzz front-run 3.000 run lulus |
| Fork test read-only (RPC publik) | 6/6 lulus — `raw/forge-test-fork.txt`. Pada salah satu run sebelumnya, fork Robinhood gagal sekali karena RPC publik bukan archive node, lalu lulus saat diulang |
| Deploy ulang `DeployLocal` ke Anvil bersih | lulus. Alamat Remote Arbitrum di `deployments/local.json` berubah karena transaksi pengisian saldo menambah nonce. Satu percobaan gagal di simulasi karena artifact `out/` usang; lulus setelah `forge build --force` |
| `npm run test:anvil` | 7/7 lulus (sekali) — `raw/test-anvil.txt` |
| `npm run lint`, `typecheck`, `test` | lulus, 117 tes — `raw/web-lint-typecheck-test.txt` |
| `npm run build` (`local` dan `testnet`) | lulus — `raw/build-local.txt`, `raw/build-testnet.txt` |
| `git status` | Hanya `contracts/`, `test/`, `script/local/`, `deployments/local.json`, dokumen, dan `proof/`. `src/` tidak berubah |

## Catatan untuk PM

- **Biaya subsidi.** Tim membayar `expansionPairEth` × jumlah chain × token yang diekspansi, ditambah fee ack, dari saldo `XofNRemote` di tiap chain ekspansi.
  - Siapa pun yang meluluskan dan mengekspansi token memicu biaya ini; itu sifat desain.
  - Batas constructor memastikan pemicunya selalu rugi lebih besar.
- **Saldo Remote:**
  - diisi dengan transfer biasa;
  - tidak bisa ditarik kembali;
  - dipakai bersama semua token, siapa cepat dia dapat.
  
  Bila kurang, compose revert dan token menunggu di Remote. Setelah saldo diisi, compose harus dijalankan ulang (`endpoint.lzCompose`). Executor LayerZero tidak mengulangnya otomatis. `msg.value` yang dikirim pemanggil ulang ikut menjadi saldo bersama dan tidak dikembalikan.
- **Harga basi (P60).** Pool ekspansi dibuka pada harga saat `graduate()`. Semakin lama jeda ke ekspansi dan semakin besar perubahan harga, semakin besar bagian subsidi yang diambil arbitrase, paling banyak `expansionPairEth` per chain.
- **Harga pembukaan (P43).** Pool kini dibuka ±(1 + n·pe / ETH pool home) kali rasio `(eth − insentif) / token`; dengan konstanta tes +2%.
- **`expansionPairEth` (P42)** wajib di bawah batas constructor, yang bergantung pada P8 dan P16.

## Di luar scope (rekomendasi)

- **Phase 4, frontend:**
  - `src/lib/web3/retry-remote.ts` (`buildRetryCompose`): dokumentasinya masih menyebut value harus menutup ETH pasangan; sekarang seharusnya 0. Fungsinya belum dipakai.
  - `src/lib/tokens/steps.ts`: sebaiknya memeriksa `deploymentOf` sebelum menawarkan `retryRemote` di langkah `DeploySent`, dan membedakan "saldo Remote kurang" dari gagal gas.
- **Phase 5, auditor:** opsi harga ekspansi dari TWAP home (P60).
- **Opsional:** fork test read-only terhadap executor asli Robinhood testnet, untuk membuktikan `quote` dengan value 0 lulus pada `nativeCap = 0`. Saat ini dibuktikan dengan executor tiruan LayerZero (`ExecutorFeeLibMock`, revert yang sama).

## Yang tidak diverifikasi

- Faktor keamanan ½ dan tes `SubsidyFarm.t.sol` versi final tidak direview independen ulang. Penurunan batas tanpa faktor sudah dinyatakan benar oleh review kedua.
- Review kedua tidak menjalankan fork test. Fork test dijalankan penulis.
- Biaya LayerZero di PoC ekonomi memakai fee tiruan, sehingga bisa lebih kecil dari mainnet.
- `npm run test:anvil` dijalankan sekali di versi final, bukan dua kali berurutan seperti Phase 4.

## Cara mengulang

```bash
~/.foundry/bin/forge build --force
~/.foundry/bin/forge test
~/.foundry/bin/forge test --profile ci
FORK_RPC_ROBINHOOD=https://rpc.mainnet.chain.robinhood.com \
FORK_RPC_BASE=https://mainnet.base.org \
FORK_RPC_ARBITRUM=https://arb1.arbitrum.io/rpc \
  ~/.foundry/bin/forge test --match-path "test/fork/*"
anvil --port 8545
~/.foundry/bin/forge script script/local/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 \
  --broadcast --slow --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
npm run test:anvil
```

## Catatan lingkungan

- Foundry 1.8.3 dari `~/.foundry/bin`.
- Tidak ada `.env` yang dibaca atau dibuat. Env diberikan inline; URL RPC publik tanpa kredensial.
- Salinan kerja reviewer ada di `/tmp/xofn-review` dan `/tmp/xofn-review2`, di luar repo.
