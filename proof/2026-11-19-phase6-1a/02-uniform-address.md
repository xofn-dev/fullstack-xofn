# Langkah 2 — Alamat seragam lintas chain (Fase 1a)

- **Tanggal:** 19 Nov 2026. Analisis baca-kode, tanpa transaksi.
- **Pertanyaan (rencana §3 langkah 2):** apakah alamat token di chain ekspansi = alamat token di home bergantung pada alamat Graduator = alamat Remote?
- **Jawaban: ya.** Keputusan pengguna (19 Nov 2026): semua kontrak 1a di-deploy lewat **CreateX CREATE3**.

## Bukti dari kode

1. Token dibuat lewat CREATE3, dan alamatnya hanya bergantung pada (pemanggil, salt), bukan bytecode: `contracts/libraries/Create3.sol` L32-42 (`predict(deployer, salt)`).
2. `XofNTokenDeployer.deploy` adalah fungsi library `external`, jadi dijalankan dengan delegatecall. "Pemanggil" CREATE2 proxy adalah kontrak yang memanggil library:
   - home: `XofNGraduator` (`contracts/XofNGraduator.sol` L283-286), salt = `keccak256(abi.encode(homeEid, ++launchCount))`;
   - ekspansi: `XofNRemote` (`contracts/XofNRemote.sol` L180-182), dengan **salt yang sama**, dikirim di pesan DEPLOY (`XofNGraduator.sol` L532-533).
3. Jadi `token(home) = predict(Graduator, salt)` dan `token(remote) = predict(Remote, salt)`. Keduanya sama **hanya bila** `address(Graduator di home) == address(Remote di chain ekspansi)`.
4. Kode **tidak mewajibkan** kesamaan itu. Peer token dipasang dari alamat yang dilaporkan ack (`XofNGraduator.sol` L455-458; `XofNRemote.sol` L184), dan `test/unit/Create3.t.sol` L65-82 berjalan dengan alamat Graduator ≠ Remote. Komentar `Create3.sol` L8-9 menyebutnya "urusan deploy, bukan syarat di sini".
5. Initcode token memuat alamat endpoint, yang berbeda per chain (Robinhood testnet `0x3aca…fe32`, Base/Arbitrum Sepolia `0x6edc…f10f`). Itu tidak memengaruhi alamat, karena CREATE3 tidak memakai bytecode.

## Kenapa CreateX

Graduator dan Remote punya bytecode dan argumen constructor yang berbeda, jadi CREATE2 biasa tidak bisa menghasilkan alamat yang sama. Yang bisa: CREATE3 dari deployer + salt yang sama (CreateX), atau EOA yang sama pada nonce yang sama di tiap chain (rapuh). Guide §5.2 juga meminta deploy "lewat CreateX + `DEPLOY_SALT`", dan §7.1: "Alamat harus **sama** dengan di Robinhood Testnet."

CreateX `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` terverifikasi ada di Robinhood testnet (11.838 byte, keccak `0xbd8a7ea8…eb53f`, sama dengan Phase 0): `raw/onchain-check.txt`.

## Aturan salt yang dipakai script 1a

`salt = bytes20(deployer) ++ 0x00 ++ bytes11(keccak256(DEPLOY_SALT ":" label))`

- 20 byte pertama = alamat deployer → CreateX mencampur alamat pengirim ke dalam salt, jadi alamat hasilnya hanya bisa ditempati deployer itu. Pengirim lain dengan salt yang sama tidak ditolak, tetapi mendarat di alamat lain (dibuktikan di `test/fork/DeployRehearsal1a.t.sol`).
- byte ke-21 = `0x00` → tanpa proteksi redeploy lintas chain, sehingga alamat **sama di chain lain**.
- CreateX menghitung `guardedSalt = keccak256(abi.encode(deployer, salt))`; alamat = `computeCreate3Address(guardedSalt)`.

| Label | Kontrak di home (1a) | Kontrak di chain ekspansi (Fase 2) |
|---|---|---|
| `registry` | `XofNRegistry` | `XofNRegistry` |
| `core` | `XofNGraduator` | **`XofNRemote`** (sengaja label yang sama) |
| `curve`, `lib:*` | Curve implementation, tiga library | library saja |

## Kewajiban untuk Fase 2 (dicatat, tidak dikerjakan di 1a)

- Remote di Base Sepolia / Arbitrum Sepolia harus di-deploy lewat CreateX oleh **EOA deployer yang sama**, dengan **`DEPLOY_SALT` yang sama** dan label `core`. Bila salah satunya berbeda, alamat token tidak seragam dan tidak bisa diperbaiki tanpa deploy ulang Graduator.
- Kunci deployer testnet harus tetap tersedia sampai Fase 2a.
- Di 1a ownership dan delegate Graduator sudah diserahkan ke Safe, jadi wiring Fase 2a di sisi home (`setPeer`, send/receive library, konfigurasi ULN/executor) menjadi **transaksi Safe**. Ini berbeda dari `test/lz/GoLive.t.sol`, tempat deployer memasang wiring sebelum serah-terima.

## Perbedaan dari templat

`test/lz/GoLive.t.sol` memakai `new`. Urutan dan asersinya tetap sama; yang berubah hanya cara membuat kontrak. Ditutup oleh tes fork `test/fork/DeployRehearsal1a.t.sol`.
