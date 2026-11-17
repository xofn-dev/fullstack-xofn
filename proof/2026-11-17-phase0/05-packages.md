# 05 — Versi paket LayerZero, solc, OpenZeppelin

Tanggal akses: **17 Nov 2026** (UTC 08:49–08:56).

## Sumber

| # | Sumber |
|---|---|
| S1 | npm registry: `https://registry.npmjs.org/@layerzerolabs/<paket>` dan `https://registry.npmjs.org/@openzeppelin/contracts` |
| S2 | Isi paket yang terpasang (pragma di file `.sol`) |
| S3 | Smoke build di direktori sementara di luar repo: [`raw/smoke-build.txt`](raw/smoke-build.txt), kode: [`raw/smoke-source.sol.txt`](raw/smoke-source.sol.txt) |

## Versi terbaru (S1, tag `latest`)

| Paket | Versi | Terbit | Peer yang relevan |
|---|---|---|---|
| `@layerzerolabs/oft-evm` | **4.0.1** | 9 Des 2025 | oapp-evm ^0.4.1, protocol/messagelib ^3.0.148, OZ `^4.8.1 \|\| ^5.0.0` |
| `@layerzerolabs/oapp-evm` | **0.4.1** | 9 Des 2025 | sama |
| `@layerzerolabs/lz-evm-protocol-v2` | **3.0.168** | 15 Apr 2026 | OZ `^4.8.1 \|\| ^5.0.0`, `solidity-bytes-utils ^0.8.0` |
| `@layerzerolabs/lz-evm-messagelib-v2` | **3.0.168** | 15 Apr 2026 | protocol-v2 ^3.0.168, `lz-evm-v1-0.7 ^3.0.168` |
| `@layerzerolabs/test-devtools-evm-foundry` | **8.0.1** | 9 Des 2025 | oft-evm ^4.0.1, oapp-evm ^0.4.1, OZ `^4.9.5 \|\| ^5.0.0` |
| `@layerzerolabs/lz-evm-v1-0.7` | 3.0.168 | — | peer wajib paket di atas (tidak tercantum di ARCHITECTURE §1.2) |
| `solidity-bytes-utils` | 0.8.4 | 22 Mei 2025 | peer wajib protocol-v2 (tidak tercantum di ARCHITECTURE §1.2) |
| `@openzeppelin/contracts` | 5.6.1 | 27 Feb 2026 | — |

## Pragma (S2)

- Paket LayerZero: mayoritas `^0.8.20`; sebagian `>=0.8.0`, `^0.8.22`, `^0.8.18`, `^0.8.19`.
- Tiga file dipin persis `0.8.22`: `lz-evm-messagelib-v2/contracts/mocks/DVNMock.sol`, `contracts/decompressor/DVNDecompressor.sol`, `contracts/decompressor/ExecutorDecompressor.sol`. Tidak satu pun diimpor oleh OFT, OApp, atau `TestHelperOz5` (yang memakai mock miliknya sendiri), jadi tidak ikut dikompilasi.
- OpenZeppelin 5.6.1: sebagian file `^0.8.24`, 12 file `^0.8.26`. File `^0.8.26` tidak boleh diimpor selama solc dipin 0.8.24.

## Smoke build (S3) — **lulus**

Lingkungan: forge 1.8.3, `solc = 0.8.24`, `evm_version = cancun`, optimizer 200 runs, `via_ir = false`. Paket dipin exact seperti tabel di atas, OZ 5.6.1, forge-std commit `15b2df92a05d4d2f76a06653872fefb287e0e01c`. Instalasi npm memakai `--ignore-scripts`.

Hasil: 127 file terkompilasi, 4 tes lulus.

| Tes | Yang dibuktikan |
|---|---|
| `test_sendAndDustWithSharedDecimals6` | OFT + TestHelperOz5 (2 endpoint, ULN) berjalan; dust di bawah 0,000001 token tetap di pengirim; total supply tetap |
| `test_sendWithoutPeerReverts` | `send` tanpa peer revert `NoPeer` |
| `test_ulnConfigZeroMeansDefault_andExplicit2plus1of2` | Konfigurasi 2 wajib + 1 dari 2 opsional bisa dipasang dan dibaca; 0 = default; urutan DVN salah revert |
| `test_renounceNullsDelegateFirst_thenConfigLocked` | Override `renounceOwnership` menolkan delegate; setelahnya `setConfig` dari luar revert |

Batas bukti ini: hanya kontrak buangan minimal. Kompatibilitas penuh (compose, CREATE3, AMM mock) baru terbukti di Phase 3.

## Catatan

1. Remapping yang dipakai: `@layerzerolabs/`, `@openzeppelin/`, `solidity-bytes-utils/` → `node_modules/…`; `forge-std/` → `lib/forge-std/src/`.
2. `forge-std` di npm sudah usang (1.1.2, 2022); pasang lewat git pada tag + SHA, sesuai ARCHITECTURE §6.
3. `forge lint` memberi peringatan `reentrancy-no-eth` pada override `renounceOwnership` (panggilan eksternal ke endpoint sebelum state owner berubah). Endpoint adalah kontrak tepercaya; cukup didokumentasikan di NatSpec Phase 3.
4. Foundry v1.8.3 sudah terpasang di mesin ini sebelum Phase 0 (`~/.foundry`, tidak ada di PATH shell). Rilis terbaru saat diakses: v1.9.0; v1.8.x tertinggi: v1.8.7.
5. Versi OZ yang dipakai smoke build adalah 5.6.1 (terbaru). Pin final ditentukan saat inisialisasi `contracts/` di Phase 3.
