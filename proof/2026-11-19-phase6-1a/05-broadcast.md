# Langkah 7-8 — Broadcast developer dan verifikasi dorman (Fase 1a)

- **Tanggal:** 19-20 Nov 2026. Broadcast oleh developer (keystore `xofn-tn-*`, tidak pernah `--private-key`).
  Agent hanya dry-run tanpa key dan membaca chain.
- **Hasil:** Robinhood testnet (46630) **Deployed (dorman)**. `registrar` Registry kosong; `launch()` revert `OnlyRegistrar`.

## Alamat

| Kontrak | Alamat |
|---|---|
| Safe 2-of-3 v1.4.1 (testnet) | `0x5Bf81326c6D8C7a2d7632cD9050A660c3a088BfC` |
| XofNRegistry | `0xba1c8dFC2aBc6Ae85ac968B4F5A4afa9BE5c3006` |
| XofNCurve (implementation) | `0x9E2d5326eA545ac81941Eec9C0405379F7Be5B6F` |
| XofNGraduator | `0x46E39010AFA7eE6FfBFEcc981400051e1d8929FF` |
| XofNPoolGuard | `0x3D245de80BaEDBF59A47209cED57FA2F059FA000` (CREATE2 salt `0x…1e7b`) |
| TierLib | `0x15b3B5908db0EB9646123fe9e062144047C9ac8c` |
| PoolSeeder | `0xE741ea6F114b61111D795394d0917DE5107d3B1c` |
| XofNTokenDeployer | `0x381e1125c8835F16d632E762891d2A6A6c49f092` |
| Deployer (EOA) | `0x8B6C2F73bF0d2534e1E25619E2894329D67f662C` |
| Penerima LP (sementara) | `0x1EEF2925afb9592F3f69d56CB3aEAc1037BDb109` |

## Transaksi (semua status sukses; blok L2 dari receipt)

| Langkah | Tx | Blok |
|---|---|---|
| Safe dibuat | `0x7bdf1a6fc3a0ffa65341133cc095958fd222de1ca2edadc0774a936282821c3f` | 155510363 |
| 01 TierLib | `0xfda16d9ec0d59f3e0628a1cc86223d4952e1ae07bf040ec45488a3bc5ac3c97d` | 155512843 |
| 01 PoolSeeder | `0x21974d18b535a215340e6fbe51f7e783305cd5a65287e5b9c847a6d29be0708d` | 155512862 |
| 01 XofNTokenDeployer | `0x9611ccce008ad2968d4da3430400fc12352866bbeb3b11317572ad92dadec490` | 155512871 |
| 01 XofNRegistry | `0x4033399343dba245586a1d97fed1197683601ac3a996429430231ffb1e6da7bb` | 155512881 |
| 01 XofNCurve | `0xd83ad0d7d0b2cc2db8b4d45a0c389d089dedd84211636498f3e9a46492a7cee8` | 155512898 |
| 02 Safe: allow Horizen | `0x560ee2de2f4f7383f942428e02a3ef7b86cbd314a85936e90f9043a66f1c7732` | 155907584 |
| 02 Safe: allow LayerZero Labs | `0xeca70f9ca3c1f1ba245821d019883128ff80a7a9dfd906600fb9ba4bf6611ab7` | 155907909 |
| 02 Safe: allow Paxos | `0x87ba85b555607a36db532bac68cbafa5a8dd86bff6933ecbb0b2620ca1f23179` | 155908186 |
| 02 Safe: allow Twinstake | `0x4e128f82fdf785a2eda7975c76cff41ec6fa97a4697f87be346fc168d4a590c0` | 155908429 |
| 03 XofNPoolGuard | `0x42c6c6332cfaab5255118232727bc620f30bd4a470d1daf83f17459cf664dff5` | 155910603 |
| 03 XofNGraduator | `0x6c34988c15e276b29ce5fe2d7be97389aca8cf8fa177c6a9dcd3c36109e0c7a5` | 155910627 |
| 03 setDelegate(Safe) | `0x6157d6c4679f4a2f99ec37e2ec63452da8f2c03afa08a96ebf61d58556f6aaaf` | 155910650 |
| 03 transferOwnership(Safe) | `0x5e2cc202145cd7135735b8b7f2cd7923117240c563238bc7a7a6af38fbee6c30` | 155910674 |

Persetujuan tertulis transaksi Safe (target, calldata, nonce 0-3, `safeTxHash`) dicocokkan agent sebelum ditandatangani; `safeTxHash` pertama dihitung ulang langsung dari kontrak Safe. Total biaya deploy ±0,00015 ETH.

Bukti mentah: `raw/tx/*.json` (salinan catatan forge, tanpa RPC atau kredensial), `raw/04-verify-dormant.txt`.

## Verifikasi (`script/04_VerifyDormant.s.sol`, read-only) — LULUS

Owner Registry = Safe; `registrar` = 0; keempat DVN diizinkan; owner dan delegate endpoint Graduator = Safe; parameter constructor = tabel yang disetujui (ekonomi, kedua pathway termasuk setiap alamat DVN, gas); Standard tersedia, Fortress tidak; belum ada peer atau wiring Fase 2; hook ber-flag tepat dan `seeder` = Graduator; library ter-link; simulasi `launch()` revert `OnlyRegistrar`.

## Temuan saat broadcast

**Alamat PoolGuard dari script 01 (`0xA7Cd…6000`) bukan alamat final.** Alamat hook (CREATE2) bergantung pada bytecode, dan bytecode ikut berubah saat script dikompilasi dengan `--libraries` (metadata compiler berbeda). Script 03 menghitung dan men-deploy dalam satu kompilasi, jadi hasilnya konsisten dan divalidasi constructor Graduator. Perbaikan: script 04 membaca hook dari Graduator; script 01 menandai alamat hook sebagai perkiraan. Dampak untuk Fase 2: alamat hook (dan karena itu PoolId) di chain ekspansi hanya sama bila dikompilasi dengan pengaturan identik; alamat token tidak terpengaruh (bergantung pada alamat Graduator/Remote).

## Manifest

`deployments/robinhood-testnet.json` ditulis broadcast 03 dengan `status: "deployed-dormant"`. `deployBlock` diisi agent = 155512843 (blok L2 transaksi pertama, dari receipt), sesuai rencana yang disetujui.

## Setelah broadcast (20 Nov 2026)

- **Aplikasi membaca manifest dorman.** `getManifestState('testnet')` = `deployed-dormant` → mode tetap
  preview (launch mati, PRD P52). Halaman Contracts menampilkan alamat home chain dengan status
  "DEPLOYED (DORMANT) · SOURCE NOT VERIFIED" dan tautan explorer; chain ekspansi "PLANNED · NOT DEPLOYED".
  `getDeployment('testnet')` tetap null, jadi pembaca token dan Check tidak menganggap XofN berjalan
  di testnet. Lebar 360-1680 px tanpa overflow (`raw/app-contracts-widths.txt`,
  `screens/contracts-testnet-1280.png`).
- **Paket verifikasi Blockscout** di `verify/`: standard JSON tiap kontrak (terbukti identik dengan
  bytecode on-chain, `raw/verify-bytecode-match.txt`) dan argumen constructor dari transaksi asli.
- **Draf pengumuman alamat:** `06-announcement-draft.md`.

## Belum

- Verifikasi source di UI Blockscout (developer, panduan `verify/README.md`).
- Go-live (`setRegistrar` lewat Safe): keputusan PM, bukan bagian 1a.
