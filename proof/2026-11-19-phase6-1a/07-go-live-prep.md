# Go-live Robinhood testnet — persiapan (20 Nov 2026)

- **Keputusan:** PM, disampaikan developer: "pm setuju aja yang penting testnet bisa launchpad jalan juga".
- **Dieksekusi developer 20 Nov 2026:** tx `0x156cf57b715fd1e109ec7e8b059404069be0d942ce096a9b578c9288f336a11b`,
  blok L2 155929990, status sukses (`raw/tx/05_SafeGoLive-run.json`). Tidak ada transaksi oleh agent.
- **Diverifikasi agent (read-only):** `registrar()` = Graduator `0x46E39010AFA7eE6FfBFEcc981400051e1d8929FF`;
  nonce Safe 5; simulasi `launch()` (eth_call) berhasil; simulasi `setRegistrar` kedua oleh Safe revert
  `RegistrarAlreadySet` (tidak bisa diganti). Manifest `status: "live"` di `main` (PR #15).
- **Status Robinhood testnet: LIVE** (launchpad terbuka; ekspansi belum di-deploy).

## Transaksi Safe (`script/05_SafeGoLive.s.sol`, dry-run lulus)

| | |
|---|---|
| Aksi | `Registry.setRegistrar(0x46E39010AFA7eE6FfBFEcc981400051e1d8929FF)` |
| Target | Registry `0xba1c8dFC2aBc6Ae85ac968B4F5A4afa9BE5c3006`, value 0, CALL |
| Calldata | `0xfaab9d3900000000000000000000000046e39010afa7ee6ffbfecc981400051e1d8929ff` |
| Nonce Safe | 4 |
| `safeTxHash` | `0x5481d97e362446d0ff8a6d782c0caa3e8e1c6d9f9fab0a97bbede6cc07e672a7` (dihitung ulang langsung dari Safe: sama) |

Script memverifikasi keadaan dorman lebih dulu, mensimulasikan `launch()` berhasil setelah eksekusi, dan
menulis `status: "live"` ke manifest hanya saat broadcast. **Tidak bisa dibatalkan.**

## Aplikasi mode live (khusus testnet)

- Copy: chip `TESTNET`, "LAUNCHPAD OPEN ON TESTNET · NO REAL FUNDS · UNAUDITED"; mainnet live tetap tanpa copy.
- Mode live butuh konfigurasi wallet (Project ID WalletConnect, keputusan developer); tanpa itu tetap preview.
- Manifest satu chain dipakai sebagai deployment home saja: launch, beli/jual di curve, graduate.
  Ekspansi "not deployed on this network yet"; bridge pratinjau; trading pool "not available" (P59).

## Uji ujung-ke-ujung di fork (bukan testnet asli)

Anvil fork Robinhood testnet; Safe di-impersonate untuk `setRegistrar` DI FORK; manifest diubah ke `live`
sementara untuk build lalu dikembalikan. Hasil: `/api/tokens` membaca token hasil launch di fork;
halaman Launch menampilkan form dengan copy TESTNET; halaman token menampilkan trading curve; setelah
`graduate()` di fork (Uniswap v4 testnet asli, 613.108 gas): "Graduated · awaiting expansion", pool ID
tampil, ekspansi "not deployed on this network yet", trading pool "not available"; bridge tetap pratinjau.

Pemeriksaan: typecheck dan lint bersih, 133 tes web lulus.
