# Phase 3 (dibuka kembali): pool pindah dari Uniswap v2 ke Uniswap v4

- **Tanggal:** 19 Nov 2026. **Branch:** `phase-3/uniswap-v4` (dari `main` `0f96f00`). **Belum di-commit.**
- **Pemicu:** saat menyiapkan deploy 1a, cek on-chain menunjukkan Uniswap v2 resmi tidak ada di Robinhood testnet, sedangkan v4 ada di keenam chain (`proof/2026-11-19-phase6-1a/raw/`).
- **Keputusan pengguna (kutipan):** "keputusannya langsung gas ke v4, buat plan dan eksekusi gappa tulis ulang dan review ulang dari gerbang phase 3". Lalu di sesi yang sama: hook penjaga, paket npm resmi, dan panel trading ikut di-port.
- **Tidak ada transaksi ke jaringan publik.** Semua bacaan chain read-only; broadcast hanya ke Anvil lokal.

## 1. Yang berubah

**Kontrak**
| File | Perubahan | Alasan |
|---|---|---|
| `contracts/XofNPoolGuard.sol` (baru) | Hook v4 tanpa state: hanya `seeder` yang boleh `initialize` | Di v4 siapa pun bisa menginisialisasi PoolKey mana pun lebih dulu (PRD P61) |
| `contracts/libraries/PoolSeeder.sol` (ditulis ulang) | `validate` + `seed` untuk v4; semua logika v2 dihapus | `initialize` langsung di PoolManager, lalu satu posisi full-range lewat PositionManager |
| `contracts/interfaces/IUniswapV4.sol` (baru), `IUniswapV2.sol` (dihapus) | Antarmuka PositionManager minimal + hook | Antarmuka resmi ikut menarik Permit2, yang tidak dipakai |
| `contracts/XofNGraduator.sol`, `XofNRemote.sol` | `Infra.router` → `positionManager` + `poolGuard`; `pool` (alamat) → `poolId` + `positionId`; event; `poolKeyOf` | Pengkabelan saja; tidak ada fungsi pengubah state baru |

Tidak berubah: Registry, Curve, Token, `TierLib`, `ExpansionMsg`, `Create3`, `XofNTokenDeployer`, isi `composeMsg`.

**Tes dan script:** `test/helpers/V4Env.sol` + `V4TestRouter.sol` (Uniswap v4 asli dari artefak paket), `test/unit/PoolGuard.t.sol`, `test/unit/PoolSeeder.t.sol` (ditulis ulang), `test/fork/ForkUniV4.t.sol` (menggantikan `ForkUniV2.t.sol`), `Graduate`/`Composer`/`SubsidyFarm`/`Expansion`/`Factory`/`GoLive`, `XofNTestBase`, `script/local/DeployLocal.s.sol`. `test/mocks/MockUniswapV2.sol` dihapus.

**Aplikasi:** `src/lib/web3/pool-trade.ts` (ditulis ulang), `abi/uniswap-v4.ts` (baru), `abi/{xofn,local,errors}.ts`, `decode-revert.ts`, `addresses.ts`, `src/lib/tokens/read.ts`, `src/types/domain.ts`, `trade-panel.tsx`, `token-view.tsx`, `graduation-panel.tsx`, copy di `contracts/page.tsx`, `proof/page.tsx`, `footer.tsx`; `deployments/local.json` diregenerasi.

**Konfigurasi:** `package.json` (+`@uniswap/v4-core` 1.0.2, `@uniswap/v4-periphery` 1.0.3, devDependency, disetujui pengguna), `remappings.txt`, `foundry.toml` (`fs_permissions` baca artefak paket). Pin solc 0.8.24 tidak berubah.

**Dokumen:** PRD §5.5, §9.1, P2, P4, P9, P41, P42, P43, P55, P59, P60, baru P61 dan P62; `ARCHITECTURE.md` §1.2, §2, §5.4, §5.6.1, §6, §10, §12, §15; `USER_FLOWS.md` Flow E; `CLAUDE.md` §4, §7.

## 2. Hasil pemeriksaan (kode final)

| Pemeriksaan | Hasil | Bukti |
|---|---|---|
| `forge test` | **205 lulus, 0 gagal, 9 dilewati** (fork tanpa env) | `raw/forge-test.txt` |
| `forge test --profile ci` (10.000 run fuzz) | 205 lulus, 0 gagal | `raw/forge-test-ci.txt` |
| Invariant | 5 invariant + 1 tes lulus (termasuk dalam suite) | idem |
| Tes fork v4, 6 chain (Robinhood, Base, Arbitrum; mainnet + testnet) | **6 lulus** | `raw/fork-univ4.txt` |
| Ukuran kontrak | Graduator 21.255 byte (sisa 3.321), Remote 11.912, PoolSeeder 4.217, hook 440 | `raw/sizes.txt` |
| Gas | `graduate` ±0,65 juta; compose ±1,27 juta; membuat + mengisi pool ±0,47 juta di v4 asli | `raw/gas-measure.txt`, `raw/fork-univ4.txt` |
| `npm run typecheck`, `npm run lint` | bersih | `raw/web-checks.txt` |
| `npm run test` | 130 lulus | idem |
| `npm run build` (mode local dan mode testnet/preview) | lulus | idem |
| `npm run test:anvil` | 8 lulus pada 5 dari 6 run; **1 run gagal 1 tes** (lihat §5) | idem |
| Browser (build produksi, CDP) | quote pool terbaca tanpa wallet dan diperbarui tiap 4 detik; tanpa overflow di 360/390/768/1280/1680 px | `raw/ui-cdp-check.txt`, `screens/token-1280.png` |

Yang dibuktikan tes fork terhadap kontrak yang hidup: runtime PoolManager dan PositionManager di tiap alamat **identik dengan build resmi paket npm** (setelah bagian immutable dinolkan); urutan aksi `PoolSeeder` diterima; pool dibuka pada harga setoran; pemanggil tidak menyisakan apa pun; pihak lain ditolak hook dengan alasan `OnlySeeder`; swap pertama setara rumus 997/1000.

`protocolFeeController` PoolManager: terpasang di Robinhood, Base, Arbitrum mainnet; alamat nol di ketiga testnet.

## 3. Review independen

Dua agent baru, diberi kode dan diff, tidak diberi kesimpulan penulis.

**Kontrak: tidak ada temuan CRITICAL/HIGH.** Reviewer tidak berhasil membuat pihak ketiga menginisialisasi pool XofN, memilih harga bukanya, memblokir `graduate()`/`lzCompose`, atau mengambil nilai dari setoran; batas subsidi P42 dinilai tetap berlaku (analitis, tanpa PoC likuiditas terkonsentrasi).

| Temuan | Tindak lanjut |
|---|---|
| LOW-1 `validate` menerima kontrak yang bukan PositionManager | **Diperbaiki**: `nextTokenId()` harus ada dan ≠ 0. Tes: `test_validateRejectsContractThatIsNotAPositionManager` |
| LOW-2 `validate` tidak menguji perilaku hook | **Diperbaiki**: kontrak itu harus lolos dengan selector yang benar dan pihak lain harus ditolak. Tes: `test_validateRejectsPermissiveGuard`, `…GuardThatRejectsItsOwnSeeder` |
| LOW-3 pool dibuka ±22% di atas harga akhir curve; bisa diarbitrase ±2% dana terkumpul | **Tidak diubah** (bukan akibat v4; angka ekonomi milik PM). Dicatat di PRD P43 |
| LOW-4 jalur deploy hook yang sebenarnya tidak diuji; prediksi nonce di script rapuh untuk jaringan publik | **Sebagian**: tes baru tanpa cheat (`test_minedCreate2GuardBindsToSeederDeployedAfterIt`); script memakai ulang hook identik yang sudah ada; komentar diluruskan. Jalur CREATE3 (CreateX) diuji di gladi fork 1a |
| LOW-5 kualitas tes | **Diperbaiki**: alasan revert dikunci (`WrappedError` berisi `OnlySeeder(sender)`, `PoolAlreadyInitialized`, `PoolNotInitialized`); asersi kosong diganti; fuzz jumlah ekstrem; batas `noSelfCall` didokumentasikan sebagai tes; arah harga naik (`SubsidyFarm`) |
| INFO-1 `expansionPairEth` tanpa batas bawah | Tidak diubah (sudah ada sebelum v4). PRD P42 |
| INFO-2 harga basi arah naik tidak dibatasi `expansionPairEth` | Tes baru + PRD P60 |
| INFO-3 fee LP tidak menumpuk; fee protokol | PRD P41, P62 |
| INFO-4 pool tandingan tanpa hook bisa tampil di UI pihak ketiga | PRD P61, P62 |

**Aplikasi: tidak ada temuan HIGH.**

| Temuan | Tindak lanjut |
|---|---|
| M1 quote pool tidak diperbarui | **Diperbaiki**: dibaca ulang tiap 4 detik, tidak di-cache, dibaca ulang setelah trade sendiri (juga untuk quote curve) |
| L1 error v4 yang terbungkus tidak dibuka | **Diperbaiki** + tes |
| L2 revert quoter ditampilkan sebagai gagal baca | **Diperbaiki** |
| L3 PoolKey untuk swap tidak dicocokkan di klien | **Diperbaiki**: pasangan ETH/token, PoolId tercatat, hook manifest |
| L4 jual dengan allowance belum terbaca | **Diperbaiki** |
| L5 fee protokol tidak ditampilkan; komentar `protocolFee` salah | Komentar diperbaiki. Tampilan fee protokol **belum** (nol di node lokal; relevan untuk adapter jaringan publik) |
| L6 copy basi di `/proof` dan `/contracts` | **Diperbaiki** |
| L7 celah tes | Encoding swap, pencocokan pool, dan error terbungkus ditambah. **Belum ada tes komponen** untuk panel trading |

Ditemukan sendiri saat cek browser (tidak tertangkap tes otomatis): quote pool tidak pernah muncul tanpa wallet, karena hook simulasi wagmi butuh akun. **Diperbaiki**: quote disimulasikan dari alamat nol; tes Anvil menegaskan hasilnya sama.

## 4. Perbedaan dari rencana

- `validate` lebih ketat dari rancangan awal (hasil review).
- `seedGas` konstanta tes 5 juta → 2,5 juta (±2x pemakaian terukur).
- Manifest lokal juga memuat `positionManager` dan `poolGuard`.
- Jalur cadangan `MINT_POSITION` tidak diperlukan: `MINT_POSITION_FROM_DELTAS` diterima di keenam chain.
- Alat bantu tes memulihkan nonce setelah menaruh hook, karena cheat `deployCodeTo` menaikkannya.

## 5. Belum selesai, terbatas, atau di luar scope

- **`test:anvil` gagal 1 dari 6 run**: "Flow E: buy dan sell di curve" (indexer baru melihat `buy`). Terjadi saat `forge test --profile ci` berjalan bersamaan; tiga run sesudahnya lulus. Kode dan tes curve itu tidak diubah. Dugaan (belum diverifikasi): nomor blok di-cache klien RPC. Rekomendasi: periksa di task Phase 4.
- **Alur dengan wallet terhubung tidak dijalankan lewat browser** (connect akun dev, lalu beli/jual lewat UI). Yang membuktikannya adalah tes Anvil, dengan builder transaksi dan ABI yang sama dengan UI.
- **Belum ada tes komponen** untuk `trade-panel.tsx`.
- **Jalur CREATE3 (CreateX) + hook** belum diuji; itu bagian gladi fork 1a.
- **Belum diverifikasi:** apakah antarmuka Uniswap atau agregator merutekan pool ber-hook ini.

## 6. Keputusan yang perlu PM

| # | Hal | Rujukan |
|---|---|---|
| 1 | Penerima posisi likuiditas di mainnet: alamat mati membuat fee LP terdampar; alamat yang dikendalikan bisa menarik likuiditas | PRD P41 |
| 2 | Selaraskan harga akhir curve dengan harga buka pool saat menetapkan angka final | PRD P43 (LOW-3) |
| 3 | Lisensi BUSL-1.1 `PoolManager.sol` (hanya dipakai di tes dan Anvil) | PRD P62 |
| 4 | Fee protokol Uniswap v4 di luar kendali XofN | PRD P62 |
| 5 | Perutean pihak ketiga untuk pool ber-hook | PRD P62 |

## 7. Laporan gate (format playbook §1.3)

```
GATE Phase 3 (dibuka kembali) — Pool Uniswap v4
Status       : SIAP untuk review pengguna/PM
Sudah selesai: hook penjaga + PoolSeeder v4 + pengkabelan Graduator/Remote;
               205 tes forge lulus (juga profil CI); tes fork lulus di 6 chain terhadap v4 yang hidup;
               aplikasi di-port (130 tes web, build, 8 tes Anvil); dua review independen tanpa
               temuan critical/high, temuan LOW/MEDIUM diperbaiki atau dicatat (§3).
Belum / risiko: belum di-commit; belum ada audit eksternal; LOW-3 dan INFO-1 (ekonomi, bukan akibat v4)
               tidak diubah; 1 kegagalan tes Anvil yang tidak berulang (§5); jalur CREATE3 + hook
               baru diuji di gladi 1a; perutean pihak ketiga belum diverifikasi.
Butuh keputusan/aksi manusia:
               1. Setujui gerbang Phase 3 (v4) supaya deploy 1a testnet bisa dilanjutkan.
               2. Commit branch `phase-3/uniswap-v4` (atau minta agent meng-commit).
               3. Teruskan lima butir §6 ke PM.
Rekomendasi  : setujui gerbang dan lanjutkan ke 1a; butir §6 tidak menghalangi testnet.
```

## 8. Keputusan gerbang

**Disetujui pengguna 19 Nov 2026** (kutipan: "setuju"). Deploy 1a testnet dilanjutkan. Branch belum di-commit saat persetujuan diberikan.
