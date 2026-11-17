# Phase 3 — Kontrak, lokal saja (3a tahap 1 + 3b tahap 2)

- **Tanggal:** 17 Nov 2026
- **Branch:** `phase-3/contracts` (bercabang dari `phase-2/xofn-check`)
- **Status:** **belum selesai.** Review independen ulang menemukan temuan HIGH di `PoolSeeder` (PRD P55, `11-poolseeder-rereview.md`). Pekerjaan berhenti sebelum kontrak diubah. Lihat bagian "Sesi penyelarasan playbook" di akhir.
- **Sifat pekerjaan:** kontrak Solidity, tes Foundry, dan script deploy untuk Anvil lokal. Tidak ada deploy, transaksi, keystore, atau private key di jaringan publik. Fork test hanya membaca (fork lokal, tanpa broadcast). Tidak ada perubahan frontend (`src/` tidak disentuh).

## Pilihan yang dicatat sebelum mulai (17 Nov 2026)

Ketiganya **dipilih owner lewat opsi agent (17 Nov 2026), menunggu konfirmasi PM**. Owner memilih opsi rekomendasi dari pertanyaan yang ditulis agent; kalimat "keputusan owner" ada di teks opsi buatan agent, bukan ucapan owner (gate review Bagian 1 no. 8).

| # | Keputusan | Dampak |
|---|---|---|
| P28 | **Resep sebelum likuiditas.** Urutan guide §7.3 tidak bisa dijalankan (Phase 0) | Urutan `expandAndLock` di kontrak |
| Dependency | Peer `@layerzerolabs/lz-evm-v1-0.7@3.0.168` dan `solidity-bytes-utils@0.8.4` **disetujui**; `forge-std` lewat git | `package.json`, `lib/forge-std` |
| P2 / P9 | **Uniswap v2 + ETH** sebagai aset pasangan di chain ekspansi | Bentuk composer dan `PoolSeeder` |

Keputusan lain yang masih terbuka dijalankan sesuai rekomendasi tertulis: DVN tiruan (P1), parameter owner sebagai argumen constructor dengan konstanta tes (P8, P15, P16), tanpa fee curve (P17).

## Indeks bukti

| File | Satu kalimat konteks |
|---|---|
| [raw/forge-test.txt](raw/forge-test.txt) | `forge test`: 149 lulus, 0 gagal, 3 dilewati (fork test tanpa env RPC). |
| [raw/forge-test-invariant.txt](raw/forge-test-invariant.txt) | `forge test --match-contract Invariant`: lima invarian, 256 run / 16 384 panggilan, 0 revert. |
| [raw/forge-test-ci.txt](raw/forge-test-ci.txt) | `forge test --profile ci`: fuzz 10 000 run per tes, invarian 1 000 run / 128 000 panggilan, semuanya lulus. |
| [raw/forge-test-fork.txt](raw/forge-test-fork.txt) | Fork read-only terhadap EndpointV2 asli di Robinhood, Base, dan Arbitrum: resep tier diterima library asli, `verify()` true setelah renounce, plus quote nyata Standard vs Fortress. |
| [raw/gas-measure.txt](raw/gas-measure.txt) | Gas pesan deploy, compose, ack, dan `verify` (PRD P4, P7), Standard dan Fortress. |
| [raw/forge-build-sizes.txt](raw/forge-build-sizes.txt) | Ukuran bytecode: semua kontrak di bawah batas 24 576 byte. |
| [raw/anvil-local-lifecycle.txt](raw/anvil-local-lifecycle.txt) | Deploy `script/local` ke Anvil lalu satu token dijalankan dari launch sampai `verify()` = true di home dan Base, lewat `cast`. |

## Gerbang Phase 3 (`PRD.md` §9.1)

| Kriteria | Status | Bukti |
|---|---|---|
| 3a dan 3b: semua tes wajib §9.2 lulus dengan `forge test`, termasuk `--match-contract Invariant` | **Terpenuhi** | `raw/forge-test.txt`, `raw/forge-test-invariant.txt`; juga `--profile ci` |
| Hanya ada script deploy untuk Anvil lokal | **Terpenuhi** | `script/local/DeployLocal.s.sol` (revert bila chain ID bukan 31337), `script/local/LocalRelay.sol`; tidak ada `script/0*.s.sol` |

### Tes wajib §9.2 → tes yang membuktikannya

| Tes wajib | Tes |
|---|---|
| Supply 999M di curve; total supply semua chain selalu 999M | `Token.t.sol::test_supplyIs999MAndHeldByCurve`; `Invariant.t.sol::invariant_totalSupplyAcrossChainsIs999M`; `Bridge.t.sol` |
| Tidak ada mint selain `_credit` dari endpoint + peer | `Token.t.sol::test_abiHasNoForbiddenFunctions`, `test_lzReceiveRejects*`; `invariant_remoteSupplyNeverExceedsHomeBurn` |
| Hanya Graduator yang bisa memanggil fungsi owner/delegate token; Graduator tanpa fungsi di luar jalur | `Authority.t.sol::test_nobodyButGraduatorControlsToken_{bonding,graduated,expanding}`, `test_graduatorMutableSurfaceIsExactlyTheAllowlist` |
| `graduate()` gagal sebelum ambang, hanya sekali | `Graduate.t.sol::test_graduateFailsBeforeThreshold`, `test_graduateOnlyOnce` |
| Setelah `graduate()` owner dan delegate masih Graduator | `Graduate.t.sol::test_afterGraduateOwnerAndDelegateAreStillGraduator` |
| `verify()` false selama belum terkunci | `Registry.t.sol::test_verifyIsFalseUntilLocked`; `invariant_verifyAndOwnershipFollowLockState` |
| Factory menolak < 2 DVN wajib, DVN di luar daftar putih, field 0 | `Factory.t.sol::test_rejectsFewerThanTwoRequiredDvns`, `test_rejectsOneOfOne`, `test_rejectsDvnOutsideWhitelist`, `test_rejectsZeroConfigFields` |
| `renounceOwnership` menolkan delegate lebih dulu | `Token.t.sol::test_renounceOwnershipNullsDelegateFirst` |
| Satu chain gagal (DVN / gas) → `retryRemote`; tidak Locked sebelum semua selesai | `Expansion.t.sol::test_dvnFailureOnOneChain_thenRetryRemoteSucceeds`, `test_gasFailure*` |
| Composer menolak non-endpoint dan token tidak terdaftar | `Composer.t.sol::test_lzComposeRejectsCallerOtherThanEndpoint`, `test_composeFromUnregisteredTokenIsRejected`, `test_composeFromRegisteredTokenButNotFromGraduatorIsRejected` |
| Pool dibuat + diisi dalam satu panggilan; front-run gagal / tidak berpengaruh | `Composer.t.sol::test_poolIsCreatedAndFilledInOneCall`, `test_frontRun_*`, `testFuzz_frontRun_anyRemotePoolDoesNotProfit` |
| Compose kehabisan gas / revert terdokumentasi; `retryCompose` aman | `Composer.t.sol::test_composeOutOfGas_tokensStayAtRemote_thenRetryComposeSucceeds`, `test_composeWithoutPairValueReverts_thenRetryWithValueSucceeds` |
| Setelah ekspansi: owner 0, delegate 0, library bukan default, ULN sesuai tier, peer, di setiap chain | `Expansion.t.sol::test_postExpansionState_{standard,fortress}` |
| `verify()` false bila owner ≠ 0, delegate ≠ 0, atau satu pathway berbeda; true setelah lengkap | `Registry.t.sol::test_verifyFalseWhen*`, `test_verifyTrueOnlyAfterOwnerAndDelegateAreZero` |

Tes tambahan di luar daftar wajib: ambang DVN benar-benar berlaku (`Bridge.t.sol::test_standardNeedsBothRequiredAndOneOptional`, `test_fortressNeedsAllThreeRequired`, `test_singleDvnIsNeverEnough`), dust shared decimals, topologi hub, front-run pool home, CREATE3, dan kecocokan `config/tiers.json` dengan kontrak.

## Yang dibuat

| Area | File |
|---|---|
| Kontrak | `contracts/XofNToken.sol`, `XofNCurve.sol`, `XofNGraduator.sol`, `XofNRemote.sol`, `XofNRegistry.sol` |
| Library | `contracts/libraries/TierLib.sol`, `PoolSeeder.sol`, `Create3.sol`, `ExpansionMsg.sol`, `XofNTokenDeployer.sol`; `contracts/interfaces/*` |
| Tes | `test/unit` (8 file), `test/fuzz`, `test/invariant`, `test/lz` (4 file), `test/fork`, `test/mocks`, `test/helpers` |
| Lokal | `script/local/DeployLocal.s.sol`, `script/local/LocalRelay.sol`, `deployments/local.json` |
| Konfigurasi | `foundry.toml`, `remappings.txt`, `config/tiers.json`, `lib/forge-std` (submodule v1.9.7), `foundry.lock` |

Penjelasan desain ada di `ARCHITECTURE.md` §15 "Catatan implementasi Phase 3".

## Angka terukur

**Ukuran bytecode** (batas 24 576 byte): Graduator 21 873, Remote 11 670, Token 12 340, Registry 6 703, Curve 3 764, library `XofNTokenDeployer` 15 909.

**Gas (P4, P7)**, endpoint dan AMM tiruan, Standard / Fortress:

| Langkah | Gas |
|---|---|
| `Remote.lzReceive` DEPLOY (token + resep + ack) | 4 238 015 / 4 284 742 |
| `Graduator.lzReceive` ack CONFIGURED (+ kirim likuiditas) | 787 919 / 797 784 |
| `token.lzReceive` kredit likuiditas ber-compose | 195 758 |
| `Remote.lzCompose` (pool + kunci + ack) | 2 660 624 / 2 667 016 |
| `Graduator.lzReceive` ack LOCKED terakhir (mengunci home) | 425 006 / 437 795 |
| `token.lzReceive` bridge biasa | 117 891 |
| `Registry.verify` 2 EID / `verifyEid` | 221 324 / 121 348 (Fortress 231 719 / 126 544) |

Gas yang dipakai tes: deploy 7 000 000, compose 5 000 000 + 100 000, ack 1 500 000, `lzReceive` token 300 000 (margin ≥ 1,5x; dijaga `GasMeasure.t.sol`).

**Quote nyata (P6)** lewat fork read-only, `lzReceive` 300 000 gas, operator contoh Labs + Paxos (+ P2P untuk Fortress):

| Arah | Standard | Fortress |
|---|---|---|
| Robinhood → Base | 0,000144761 ETH | 0,000145394 ETH |
| Base → Robinhood | 0,000151526 ETH | 0,000153649 ETH |
| Arbitrum → Robinhood | 0,000151844 ETH | 0,000153931 ETH |

Operator itu **bukan keputusan P1**; dipilih hanya karena tercatat aktif di ketiga chain. UI tetap "NOT QUOTED".

## Review independen dan perbaikannya

Satu reviewer terpisah membaca seluruh kontrak tanpa diberi kesimpulan.

| Temuan | Tingkat | Tindakan |
|---|---|---|
| `PoolSeeder` menggeser pool ke harga target lalu menyetor sisa aset apa adanya; sisi yang berlebih jatuh ke LP yang sudah ada. Pool tandingan seukuran likuiditas graduation bisa mengambil ±98 juta token dan ±0,7 ETH; varian di chain ekspansi mengambil ±47% token likuiditas | **Tinggi** | **Diperbaiki.** Setoran sekarang ditukar sebagian sampai rasionya sama dengan rasio pool, jadi tidak ada sisi berlebih. Tes awal hanya memakai pool kecil sehingga tidak menangkapnya; ditambah tes pool besar dan fuzz ukuran + harga pool tandingan di home dan di chain ekspansi (10 000 run di profil ci) |
| ETH pasangan dibayar ke executor sebagai fee; jumlahnya immutable terhadap `nativeCap` yang bisa diubah LayerZero | Sedang | **Tidak diubah.** Konsekuensi keputusan P2. Dicatat sebagai PRD **P42** untuk owner + auditor |
| Harga akhir curve tidak diikat ke harga pembukaan pool | Rendah | **Tidak diubah.** Parameter milik owner. PRD **P43** |
| Pengembalian fee meneruskan seluruh gas ke penerima | Rendah | **Diperbaiki:** gas pengembalian dibatasi 30 000 |
| `TierLib.validate` tidak memeriksa tipe library dan dukungan EID per library | Info | **Diperbaiki**; diuji juga terhadap library asli lewat fork |
| Pathway infrastruktur bisa berjalan di atas konfigurasi default | Desain | **Diperbaiki sebagian:** `expandAndLock` menolak bila library pathway infrastruktur masih default. Isi konfigurasinya tetap urusan wiring (Phase 7) dan P38 |
| Pengiriman ack dengan gas pas-pasan bisa memaksa likuiditas tertunda | Rendah | **Tidak diubah.** Bisa dipulihkan siapa pun lewat `retryRemote`; tidak ada nilai yang hilang |

Reviewer tidak menemukan cara satu token memakai ETH token lain di Graduator, cara menguras Remote, celah pembulatan curve, atau fungsi warisan OFT yang bisa dijangkau non-owner. Temuan saya sendiri yang diperbaiki sebelum review: pemanggil `retryRemote` bisa menerima sisa escrow milik pemanggil `expandAndLock`.

## Yang gagal, dilewati, atau terbatas

| Hal | Keterangan |
|---|---|
| DVN | Semua tes lokal memakai DVN tiruan; operator wajib belum diputuskan (P1). `config/tiers.json` berformat guide dan bertanda menunggu P1 |
| AMM | Pair/router/WETH tiruan yang mengikuti logika Uniswap v2. Pair asli lebih mahal untuk dibuat; gas compose nyata bisa lebih tinggi |
| Pengukuran gas | Diukur dalam satu transaksi tes, jadi akses storage sudah "hangat". Angka nyata lebih tinggi. Deploy dan pengiriman pesan di Anvil (transaksi terpisah) lolos dengan gas yang dikonfigurasi, tetapi gas per pesannya tidak dicatat |
| Deploy Anvil percobaan pertama | Macet: forge mengirim transaksi sekaligus, satu blok Anvil penuh, sisanya tidak pernah ditambang. Diselesaikan dengan `--slow`; dicatat di komentar script dan README |
| Fork test di CI | Dilewati bila `FORK_RPC_*` kosong. Bukti di sini dijalankan manual dengan RPC publik tanpa kredensial |
| `layerzero.config.ts`, devtools Hardhat | Tidak dibuat: butuh persetujuan dependency, dan pembacaan `cast` sudah setara |
| Supabase / indexer | Bukan lingkup Phase 3 |
| Ekspansi di testnet | Tidak dijalankan (Phase 7 FROZEN). **Koreksi 17 Nov 2026:** catatan sebelumnya menulis bahwa ETH pasangan dan anggaran ack "harus disetor pemanggil `retryCompose` / `reAck`" di testnet. Itu keliru. `nativeCap` dari Robinhood testnet = 0, jadi `quote` sudah revert (`ExecutorFeeLib.sol:196`, `Executor_NativeAmountExceedsCap`). Akibatnya `expandAndLock` dan `retryRemote` tidak bisa jalan di testnet sama sekali. Keputusan PM: P51 |

## Pemeriksaan

| Perintah | Hasil |
|---|---|
| `forge build` | Lulus; hanya peringatan lint gaya |
| `forge test` | 149 lulus, 0 gagal, 3 dilewati |
| `forge test --match-contract Invariant` | Lulus |
| `forge test --profile ci` | 149 lulus, 0 gagal, 3 dilewati |
| Fork test dengan RPC publik | 3 lulus |
| `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` | Lulus (68 tes Vitest; build 7 route). Dijalankan karena `package.json` berubah |
| Uji manual `npm run dev` | Tidak dijalankan: tidak ada perubahan di `src/` |

## Keputusan yang masih perlu konfirmasi

P1 (operator DVN wajib), P41 (penerima LP), P42 (ETH pasangan lewat executor), P43 (harga curve vs pool), P44 (library terhubung di manifest), P45 (ekspansi semua-atau-tidak), P46 (integrasi lokal Phase 4), serta konfirmasi PM atas P37, P38, dan P39 yang diimplementasikan mengikuti rekomendasi tertulis. Rinciannya di `PRD.md` §11.

## Keputusan owner setelah gate review (17 Nov 2026)

Owner menyatakan **Phase 4 boleh mulai walau P55 terbuka**. Gerbang Phase 3 tetap terbuka dan kontrak tidak diubah di Phase 4. Perbaikan P55 hanya menyentuh isi `PoolSeeder.seed` (ABI tidak berubah), jadi setelah diperbaiki cukup deploy ulang ke Anvil. Batas akhir: P55 tertutup sebelum Phase 5 (audit) dan mutlak sebelum deploy ke jaringan publik mana pun (PRD P55).

## Catatan lingkungan

- Foundry v1.8.3 dari `~/.foundry/bin` (tidak ada di PATH shell).
- Paket dipasang dengan `npm install --save-dev --save-exact --ignore-scripts`.
- Node Anvil hanya dijalankan sementara di port 8546 dan dimatikan setelah bukti diambil. Akun yang dipakai adalah akun dev bawaan Anvil yang sudah ter-unlock; tidak ada key yang dibuat, diimpor, atau disimpan.
- Tidak ada `.env` yang dibaca atau dibuat.

---

## Sesi penyelarasan playbook (17 Nov 2026, setelah gate review)

Instruksi owner: selaraskan Phase 3 dengan `ROBINHOOD_PRE_CA_MAINNET_DEPLOYMENT.md`. Pola deploy yang dipakai adalah **Opsi A**: deploy dorman, lalu `Registry.setRegistrar(graduator)` oleh Safe sebagai saklar go-live (PRD P47). Phase 6–7 tetap FROZEN. Kontrak tidak boleh diubah.

| Langkah | Hasil | Bukti |
|---|---|---|
| 1. Pin `lib/forge-std` | Di-stage `77041d2` (v1.9.7), commit yang memang dites. Sebelumnya `15b2df9` | `git ls-files --stage lib/forge-std` |
| 2. Koreksi dokumen | Klaim testnet "disetor pemanggil retry compose" dikoreksi di catatan ini, PRD P2, dan PRD P42. Label P28, P2/P9, dan dependency diubah menjadi "dipilih owner lewat opsi agent, menunggu konfirmasi PM". P37, P38, P39 ditandai "diimplementasikan mengikuti rekomendasi, menunggu konfirmasi PM" | `PRD.md` §5 dan §11 |
| 3. Tes Opsi A (kontrak tidak diubah) | `test/lz/GoLive.t.sol`, 9 tes lulus: (a) launch revert sebelum registrar dipasang, untuk caller dan tier apa pun (fuzz); (b) setelah go-live launch terbuka, dan registrar tidak bisa diganti, juga setelah owner Registry dipindah atau di-renounce; (c) Registry milik Safe sejak constructor (satu-satunya `OwnershipTransferred` adalah 0 → Safe; deployer tidak punya hak; fuzz hanya Safe yang bisa membuka; Graduator gagal deploy tanpa daftar putih Safe); (d) `setDelegate(Safe)` sebelum `transferOwnership(Safe)`, dengan pembanding urutan terbalik yang meninggalkan EOA sebagai delegate. Skenario urutan publik: library → Registry(Safe) → daftar putih → Curve → Graduator → Remote → wiring → serah terima → dorman → `setRegistrar` → siklus penuh sampai `verify()` true di 3 chain. Perubahan tes pendukung: `_setUpChain` menjadi `internal`, `_wireInfraAs(delegate, …)` di `XofNTestBase`, dan `test/mocks/MockSafe.sol` (owner berupa kontrak). `DeployLocal.s.sol` tidak diubah | `test/lz/GoLive.t.sol`, [raw/forge-test.txt](raw/forge-test.txt) |
| 4. Fee Uniswap v2 | **0,3% di ketiga chain.** Pair identik byte dengan pair kanonik Ethereum; `getAmountOut` cocok dengan rumus 997/1000; +1 wei revert `UniswapV2: K` di pair asli (fork). `feeTo` aktif di ketiga factory. Fork test baru `test/fork/ForkUniV2.t.sol` (3/3 lulus) | [10-univ2-fee.md](10-univ2-fee.md), [raw/univ2-fee.txt](raw/univ2-fee.txt) |
| 5. Review independen PoolSeeder | **Satu HIGH, satu MEDIUM, satu LOW, dua INFO.** HIGH: donasi WETH tanpa `sync` membuat penyerang untung ±15% setoran; direproduksi penulis kode di pair Uniswap v2 asli (fork Robinhood +1,19 ETH, Base +0,012 ETH). **Berhenti di sini sesuai instruksi; kontrak tidak diubah** | [11-poolseeder-rereview.md](11-poolseeder-rereview.md), [raw/poc-unsynced-donation/](raw/poc-unsynced-donation/output.txt) |
| 6. Dokumen | Dikerjakan sebelum temuan masuk: CLAUDE.md §2 (playbook "acuan Phase 6–7; tidak membuka deploy"), §5.1 (larangan fungsi produk di jaringan publik, CA/launch tugas PM, broadcast hanya oleh manusia, `setRegistrar` hanya oleh Safe), §9 (playbook §1.1–1.3, Reserved ≠ Deployed (dorman) ≠ Live). ARCHITECTURE §5.6.1 (urutan deploy dorman). PRD P47–P55. P1, P41, P42, P43, P51 ditandai wajib diputuskan PM sebelum Phase 5. Playbook tetap di root | `CLAUDE.md`, `ARCHITECTURE.md`, `PRD.md` |
| 7. Pemeriksaan | `forge build` lulus. `forge test`: 158 lulus / 0 gagal / 6 dilewati (fork tanpa env). Invariant: 5 invarian + 1 tes, lulus. `--profile ci`: 158 lulus / 0 gagal / 6 dilewati. Fork (RPC publik, tanpa kredensial): 6/6 lulus (`ForkRecipe` 3, `ForkUniV2` 3). **`npm run lint/typecheck/test/build` tidak dijalankan**: pekerjaan berhenti di langkah 5, dan `src/` tidak disentuh sesi ini | [raw/forge-test.txt](raw/forge-test.txt), [raw/forge-test-invariant.txt](raw/forge-test-invariant.txt), [raw/forge-test-ci.txt](raw/forge-test-ci.txt), [raw/forge-test-fork.txt](raw/forge-test-fork.txt) |
| 8–10. Bukti, audit FROZEN, commit | Catatan ini ditulis dan audit FROZEN dijalankan (read-only). **Tidak ada commit**: Phase 3 belum selesai karena P55 | – |

Kontrak tidak berubah sejak gate review: tidak ada file di `contracts/` yang lebih baru dari `gate-review-playbook.md` (`find contracts -newer …` kosong; mtime terakhir 21:28, gate review 21:54).
