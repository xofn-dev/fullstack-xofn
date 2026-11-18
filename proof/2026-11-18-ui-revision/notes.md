# Revisi UI 18 Nov 2026

Permintaan owner: logo baru, koin chain, koin CSS 3D, bersih em dash dan nomor, tombol X. Keputusan di `DESIGN_SYSTEM.md` D20 sampai D22.

## Sumber aset logo chain
- Robinhood: path monokrom dari simple-icons (`icons/robinhood.svg`), diberi fill lime.
- Base dan Arbitrum: raw SVG dari repo web3icons (`raw-svgs/networks/branded/`).
- Dipakai hanya untuk identifikasi chain di koin hero. Merek dagang milik pemiliknya masing-masing; XofN tidak berafiliasi. Ganti dengan file resmi bila PM menyediakannya.

## Pemeriksaan
- `npm run lint`, `typecheck`, `test` (117 lulus), `build` (dengan env publik inline untuk testnet) lulus.
- Dicek lewat Chrome CDP pada 390, 1280, 1680 px: tidak ada overflow horizontal di 390, tombol X tampil di header mobile.
