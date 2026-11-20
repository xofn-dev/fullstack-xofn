# Verifikasi source di Blockscout — Robinhood testnet (46630)

API Blockscout diblokir untuk akses otomatis (playbook §4), jadi `forge verify-contract --verify`
tidak dipakai. Verifikasi lewat **UI** explorer, satu kontrak per kali.

## Bukti bahwa file ini benar

Setiap `*.standard-input.json` di folder ini sudah dikompilasi ulang dengan solc 0.8.24 dan hasilnya
**identik byte-per-byte dengan kode on-chain, termasuk hash metadata** (bagian immutable dinolkan di
kedua sisi): `../raw/verify-bytecode-match.txt`. Argumen constructor diambil dari transaksi deploy
yang sebenarnya (`../raw/tx/`): creation code hasil kompilasi adalah awalan persis initcode di
transaksi, dan sisanya adalah argumen constructor. Didekode dan cocok dengan tabel parameter
(`../03-parameters.md`).

## Pengaturan yang sama untuk semua kontrak

- Metode: **Solidity (Standard JSON input)**
- Compiler: **v0.8.24+commit.e11b9ed9**
- Optimizer, EVM version (`cancun`), remapping, dan alamat library sudah ada di dalam file JSON.
- Argumen constructor: dari `constructor-args.txt` (tanpa awalan `0x` bila form memintanya).
  Kalau Blockscout mendeteksinya otomatis, biarkan.

## Urutan dan isian

Buka `https://explorer.testnet.chain.robinhood.com/address/<ALAMAT>/contract-verification`.

| # | Kontrak | Alamat | File | Nama kontrak | Argumen constructor |
|---|---|---|---|---|---|
| 1 | TierLib | `0x15b3B5908db0EB9646123fe9e062144047C9ac8c` | `TierLib.standard-input.json` | `TierLib` | tidak ada |
| 2 | PoolSeeder | `0xE741ea6F114b61111D795394d0917DE5107d3B1c` | `PoolSeeder.standard-input.json` | `PoolSeeder` | tidak ada |
| 3 | XofNTokenDeployer | `0x381e1125c8835F16d632E762891d2A6A6c49f092` | `XofNTokenDeployer.standard-input.json` | `XofNTokenDeployer` | tidak ada |
| 4 | XofNRegistry | `0xba1c8dFC2aBc6Ae85ac968B4F5A4afa9BE5c3006` | `XofNRegistry.standard-input.json` | `XofNRegistry` | ada (64 byte) |
| 5 | XofNCurve | `0x9E2d5326eA545ac81941Eec9C0405379F7Be5B6F` | `XofNCurve.standard-input.json` | `XofNCurve` | tidak ada |
| 6 | XofNPoolGuard | `0x3D245de80BaEDBF59A47209cED57FA2F059FA000` | `XofNPoolGuard.standard-input.json` | `XofNPoolGuard` | ada (32 byte) |
| 7 | XofNGraduator | `0x46E39010AFA7eE6FfBFEcc981400051e1d8929FF` | `XofNGraduator.standard-input.json` | `XofNGraduator` | ada (1856 byte) |

Library (1-3) diverifikasi lebih dulu: Graduator ter-link ke alamatnya. PoolGuard dan Graduator
dikompilasi dengan pengaturan `libraries` (berbeda dari 1-5), dan itu sudah tercermin di file JSON
masing-masing. **Jangan memakai satu file untuk kontrak lain.**

Tiga kontrak dibuat lewat CreateX (CREATE3) atau factory CREATE2, jadi Blockscout mungkin tidak
menemukan "creation transaction" langsung dari alamatnya. Karena itu argumen constructor diisi
manual dari `constructor-args.txt`.

## Setelah semuanya terverifikasi

Kabari agent. `verifiedSource` di `deployments/robinhood-testnet.json` diubah ke `true` setelah
agent memastikan ketujuh halaman kontrak menampilkan source yang terverifikasi.
