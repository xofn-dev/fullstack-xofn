# Fee Uniswap v2 di Robinhood, Base, Arbitrum (read-only)

- **Tanggal:** 17 Nov 2026
- **Sifat:** read-only. Hanya `eth_call` / `eth_getCode` lewat `cast` ke RPC publik tanpa kredensial, ditambah fork test di EVM lokal forge. Tidak ada key, tidak ada transaksi.
- **Alasan:** `PoolSeeder` mengasumsikan fee 0,3% (997/1000). Fee lebih tinggi bisa membuat swap penyeimbang gagal di pemeriksaan K dan mengunci `graduate()`.

## Hasil

| Chain | Router v2 | `factory()` sesuai Phase 0 | `getAmountOut(1e18,1e21,1e21)` | Pair runtime keccak | `feeTo` |
|---|---|---|---|---|---|
| Robinhood 4663 | `0x89e5…9eba` | ya | 996006981039903216 | `0x5b83…9ce5` | aktif (`0x2aC0…82F8`) |
| Base 8453 | `0x4752…aD24` | ya | 996006981039903216 | `0x5b83…9ce5` | aktif (`0x9bD2…168c`) |
| Arbitrum 42161 | `0x4752…aD24` | ya | 996006981039903216 | `0x5b83…9ce5` | aktif (`0x95E3…A263`) |
| Ethereum (pembanding, pair USDC/WETH kanonik) | – | – | – | `0x5b83…9ce5` | – |

- Rumus 0,3%: `1e18·997·1e21 / (1e21·1000 + 1e18·997)` = 996006981039903216. Hasil ketiga router persis sama dengan angka ini.
- **Pair** di ketiga chain identik byte dengan pair Uniswap v2 kanonik di Ethereum: 11 293 byte, keccak sama. **Factory** juga identik di ketiga chain.
- Router Robinhood berukuran 21 902 byte, berbeda dari Base/Arbitrum (17 891 byte). `PoolSeeder` tidak memakai router; ia hanya memakai `router.factory()` dan `router.WETH()`. Fee ditegakkan di pair, bukan di router.

## Fork test — `test/fork/ForkUniV2.t.sol` (3/3 lulus)

Di setiap chain, di fork lokal:

1. Pair baru dibuat lewat `PoolSeeder`. Swap sebesar `getAmountOut` 997/1000 lulus, dan **+1 wei revert `UniswapV2: K`**. Ini membuktikan fee pair = 0,3% persis.
2. `PoolSeeder.seed` dijalankan terhadap factory asli (dengan `feeTo` aktif) pada enam pool tandingan **yang sudah di-`sync`**: kecil/besar, kemahalan/kemurahan, ukuran home dan ekspansi. Hasilnya: tidak ada revert, nilai LP protokol ≥ 99,7% setoran, dan penyerang tidak untung. Metriknya sama dengan `Graduate.t.sol`.

**Kesimpulan langkah 4:** fee = 0,3% di ketiga chain. Asumsi `PoolSeeder` benar, jadi tidak perlu perubahan karena fee.

**Fakta baru yang tidak dimodelkan mock:** `feeTo` aktif di ketiga factory. Uniswap mengambil sekitar 1/6 pertumbuhan fee pool sebagai LP untuk `feeTo`. Ini bukan pokok likuiditas, tetapi relevan untuk copy "locked liquidity".

**Catatan:** pool tandingan dengan donasi yang **belum** di-`sync` tidak tercakup di sini. Lihat `11-poolseeder-rereview.md`, temuan HIGH.

Bukti mentah: [raw/univ2-fee.txt](raw/univ2-fee.txt).
