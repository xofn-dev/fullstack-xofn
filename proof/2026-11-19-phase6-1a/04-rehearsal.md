# Langkah 4-5 — Script deploy dorman dan gladi tanpa kunci (Fase 1a)

- **Tanggal:** 19 Nov 2026. Branch `phase-3/uniswap-v4`, belum di-commit (commit dipegang developer).
- **Tidak ada transaksi ke jaringan publik.** Yang dijalankan agent: fork read-only dan dry-run tanpa key.

## Yang ditulis

| File | Isi |
|---|---|
| `script/lib/Deploy1a.sol` | Logika bersama (script + tes gladi): fakta chain dipin dan dicocokkan ulang, cek deployer EOA polos, cek Safe v1.4.1, salt CreateX, tambang salt hook, resep DVN dari `config/`, 01/02/03/04 |
| `script/lib/Deploy1aScript.sol` | Baca env (nama: `DEPLOYER_ADDRESS`, `SAFE_ADDRESS`, `LP_RECIPIENT`, `DEPLOY_SALT`), cetak alamat dan flag `--libraries` |
| `script/01_DeployRegistry.s.sol` | 3 library + `XofNRegistry(endpoint, Safe)` + `XofNCurve`, lewat CreateX CREATE3 |
| `script/02_SafeAllowDvns.s.sol` | 4 transaksi Safe `setDvnAllowed`: cetak target, calldata, nonce, `safeTxHash`; dengan `SAFE_SIGNATURES` mengeksekusi yang pertama tertunda. Tidak menandatangani |
| `script/03_DeployGraduator.s.sol` | hook penjaga (CREATE2, salt ditambang) + Graduator (CREATE3) + `setDelegate(Safe)` + `transferOwnership(Safe)`; manifest hanya ditulis saat broadcast |
| `script/04_VerifyDormant.s.sol` | read-only: dorman, parameter = tabel disetujui, alamat = prediksi, library ter-link |
| `test/fork/DeployRehearsal1a.t.sol` | gladi seluruh urutan di fork Robinhood testnet |

## Hasil

| Pemeriksaan | Hasil | Bukti |
|---|---|---|
| Gladi fork Robinhood testnet (01 → 02 → 03 → 04) | **lulus** | `raw/rehearsal-fork.txt` |
| Di fork saja: `setRegistrar` → launch → beli → graduate di Uniswap v4 testnet asli | lulus; `graduate()` ±0,64 juta gas | idem |
| Script menolak chain selain 46630 | `WrongChain(84532)` | `raw/script-guards.txt` |
| Script menolak alamat yang bukan Safe | `SafeNotAccepted(..., "not a Safe proxy")` | idem |
| `forge test` | 205 lulus, 0 gagal, 10 dilewati (fork tanpa env) | — |
| Link library | hanya `03` yang butuh library ter-link; `01`, `02`, `04` tidak | artefak `out/` |

Yang dibuktikan gladi terhadap kontrak yang hidup di chain: alamat hasil = prediksi CreateX; Registry milik Safe sejak constructor; Graduator tidak bisa dibuat sebelum Safe mengisi daftar putih; empat `safeTxHash` yang ditandatangani di awal tetap berlaku saat dieksekusi berurutan; tanda tangan kurang, bukan-owner, atau ganda ditolak; setelah 03 deployer tidak punya kewenangan; `launch()` revert `OnlyRegistrar`; Fortress tidak ditawarkan; ekspansi revert `InfraPathwayNotPinned`; setelah go-live `04` menolak (bukan dorman lagi).

Koreksi atas `02-uniform-address.md` versi awal: CreateX tidak menolak pengirim lain yang memakai salt yang sama; kontraknya mendarat di alamat lain. Alamat Graduator tetap hanya bisa ditempati deployer.

## Belum dikerjakan

- **Dry-run keempat script dengan alamat asli** (rencana A5): butuh alamat deployer, Safe testnet, dan penerima LP. `01` dan `03` memeriksa Safe di chain, jadi tidak bisa di-dry-run dengan alamat karangan.
- **Pembungkus script** (baca env, `--libraries`, penulisan manifest) baru teruji lewat dry-run itu; yang digladi di fork adalah logika bersama.
- **Perkiraan gas per transaksi**: angka di `raw/rehearsal-fork.txt` termasuk overhead tes (penambangan salt, pembacaan JSON); angka nyata berasal dari dry-run.
- **Aplikasi membaca manifest dorman**, verifikasi source Blockscout, dan `deployBlock` dari receipt: setelah broadcast.

## Perbedaan dari guide dan rencana asal

- Nama script: `01_DeployRegistry` / `02_SafeAllowDvns` / `03_DeployGraduator` / `04_VerifyDormant` (guide: `01_DeployCore`, `02_TransferToSafe`), mengikuti Opsi A (PRD P47).
- Pool Uniswap v4 + hook penjaga (PRD P61); `03` juga men-deploy hook.
- Semua kontrak lewat CreateX CREATE3, termasuk library dan Curve.
- Fortress kosong; opsional testnet Paxos + Twinstake; penerima LP sementara.
- Manifest memuat `status`, `libraries`, `amm`, `deployer`, `lpRecipient` di luar bentuk guide.
- Wiring Fase 2a di sisi home menjadi transaksi Safe (ownership sudah diserahkan di 1a).

## Urutan untuk developer (broadcast)

Prasyarat: keystore deployer (EOA polos), Safe 2-of-3 testnet (SafeL2 v1.4.1, owner EOA polos), ETH testnet, env terisi. Selalu `--account`/`--ledger`, tidak pernah `--private-key`. Dry-run dulu setiap langkah (perintah yang sama tanpa `--account` dan `--broadcast`).

```
# 1
forge script script/01_DeployRegistry.s.sol --rpc-url $RH_TESTNET_RPC \
  --account xofn-deployer --sender $DEPLOYER_ADDRESS --broadcast --slow

# 2  (cetak 4 safeTxHash; tiap owner: cast wallet sign --no-hash <hash> --account <owner>)
forge script script/02_SafeAllowDvns.s.sol --rpc-url $RH_TESTNET_RPC
#    lalu 4 kali, berurutan, masing-masing dengan tanda tangan untuk hash pertama yang tertunda:
SAFE_SIGNATURES=<sig1>,<sig2> forge script script/02_SafeAllowDvns.s.sol --rpc-url $RH_TESTNET_RPC \
  --account xofn-deployer --sender $DEPLOYER_ADDRESS --broadcast

# 3  (flag --libraries dicetak script 01)
forge script script/03_DeployGraduator.s.sol --rpc-url $RH_TESTNET_RPC \
  --account xofn-deployer --sender $DEPLOYER_ADDRESS --broadcast --slow <flag --libraries>

# 4  (read-only, boleh dijalankan agent)
forge script script/04_VerifyDormant.s.sol --rpc-url $RH_TESTNET_RPC
```

## Laporan gate (format playbook §1.3)

```
GATE 1a-A — Script dan gladi deploy dorman Robinhood testnet
Status       : BELUM SIAP untuk broadcast (menunggu alamat dan dry-run)
Sudah selesai: tabel parameter disetujui (03-parameters.md); empat script + pustaka bersama;
               gladi fork lulus terhadap CreateX, Safe, LayerZero, dan Uniswap v4 testnet
               (raw/rehearsal-fork.txt); script terbukti menolak chain lain dan Safe palsu
               (raw/script-guards.txt); forge test 205 lulus.
Belum / risiko: dry-run dengan alamat asli belum dijalankan; pembungkus script belum teruji;
               perkiraan gas nyata belum ada; branch belum di-commit; hook dan PoolSeeder v4 belum
               diaudit eksternal (cukup untuk testnet).
Butuh keputusan/aksi manusia:
               1. Kirim ALAMAT (bukan key): deployer, Safe testnet, penerima LP; dan nilai DEPLOY_SALT.
               2. Isi env lokal; konfirmasi saja bahwa sudah diisi.
               3. Commit branch.
Rekomendasi  : setelah alamat ada, agent menjalankan dry-run 01 dan 02, lalu developer broadcast.
```
