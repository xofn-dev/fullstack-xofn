# Review independen ulang — `PoolSeeder` (17 Nov 2026)

- **Reviewer:** subagent baru (general-purpose). Ia diberi path kode (`PoolSeeder.sol`, pemanggil di Graduator/Remote, `IUniswapV2.sol`, `MockUniswapV2.sol`, tes front-run), **tanpa** kesimpulan penulis kode. Ia juga diberi satu fakta on-chain dari langkah 4: `feeTo` aktif di ketiga factory.
- **Batas:** read-only terhadap repo, tanpa jaringan. PoC ditulis di salinan `/tmp`.
- **Hasil: satu temuan HIGH.** Sesuai instruksi owner, pekerjaan **berhenti sebelum kontrak diubah**.

## Temuan

### 1. HIGH — Donasi WETH tanpa `sync` membuat penyerang mengambil sebagian setoran protokol

- **Lokasi:**
  - `contracts/libraries/PoolSeeder.sol:100`: `_reserves` membaca `getReserves()`.
  - `:106` / `:113`: swap penyeimbang.
  - `:83`: `mint`.
- **Akar masalah:**
  - Ukuran swap penyeimbang dihitung dari `getReserves()`.
  - `swap` Uniswap v2 menghitung input dari **saldo**, lalu `_update(balance0, balance1)` memasukkan saldo yang belum di-`sync` ke cadangan. Akibatnya donasi ikut terhitung sebagai input swap, dan rasio pool sesudah swap berbeda dari rasio yang dipakai untuk menghitung ukuran swap.
  - `mint` hanya menghargai sisi yang lebih kecil. Kelebihannya menjadi milik LP lama, yaitu penyerang.
- **Skenario (satu transaksi, tanpa MEV):**
  1. Penyerang membeli token di curve.
  2. Ia membuat pair dengan 30 juta token + 0,3 ETH (±½ harga target).
  3. Ia mentransfer 5 WETH ke pair **tanpa** `sync`.
  4. Ia menyelesaikan curve dan memanggil `graduate()` (permissionless).
  5. Ia me-`burn` LP-nya.
  - Di chain ekspansi, jalurnya sama lewat `endpoint.lzCompose`, yang juga permissionless.
- **Reproduksi oleh penulis kode (bukan hanya reviewer):**

| Lingkungan | Masuk penyerang (nilai pada harga target) | Keluar penyerang | Selisih |
|---|---|---|---|
| AMM tiruan repo, home | 30 jt token + 5,30 ETH | 132,6 jt token + 5,41 ETH | untung di kedua aset |
| **Pair Uniswap v2 asli, fork Robinhood**, home (190 jt token / 3,91 ETH) | 5,917 ETH | 7,103 ETH | **+1,19 ETH (±15% nilai setoran)** |
| **Pair Uniswap v2 asli, fork Base**, ekspansi (4 jt token / 0,04 ETH) | 0,059 ETH | 0,071 ETH | **+0,012 ETH (±15%)** |

- **Varian yang sudah di-`sync` aman.** Ini dibuktikan di `test/fork/ForkUniV2.t.sol` dan grid reviewer: kerugian protokol maksimum ±2e-6.
- **Usulan perbaikan reviewer (BELUM dikerjakan):**
  - Panggil `IUniswapV2Pair(pair).sync()` sebelum `_reserves()` bila `totalSupply != 0`. Alternatifnya `skim(address(this))`, tetapi itu mengembalikan donasi ke pemanggil.
  - `sync` sudah ada di `contracts/interfaces/IUniswapV2.sol:32`.
  - Perbaikan ini juga menutup temuan 2.
  - NatSpec `PoolSeeder.sol:21–22` dan `:37–38` keliru dan harus ikut dikoreksi.

### 2. MEDIUM — Donasi tanpa `sync` yang besar bisa memblokir `graduate()` / compose

- **Mekanisme:** penyerang membuat pair 1001/1001 wei, sehingga total LP = 1001. Donasi WETH besar tanpa `sync` membuat bagian protokol dibulatkan ke 0, dan `mint` revert `INSUFFICIENT_LIQUIDITY_MINTED`.
- **Pemulihan dana penyerang:** karena transaksi revert, donasi tetap belum di-`sync`, dan penyerang bisa mengambilnya kembali lewat `skim`.
- **Ambang dengan `feeTo` aktif:** ±48 ETH di ekspansi, ±4 696 ETH di home.
- **Batasnya:** blokir hanya bertahan selama donasi masih di pair, dan siapa pun bisa `skim`.
- Sudah direproduksi di AMM tiruan (`test_unsyncedDonationDoS`).

### 3. LOW — Toleransi dan cakupan tes

- **Batas bawah LP protokol (99,7%) ±2000× lebih longgar** dari kerugian terburuk yang terukur tanpa donasi (1,3–1,7e-6). Usulan: ≤ 1e-5.
- **Toleransi untung penyerang (1e-5) wajar**: terukur ±1,7e-6.
- **Tidak ada tes donasi tanpa `sync`**, padahal itulah vektor temuan 1.
- **Rentang fuzz** tidak mencakup titik terburuk tanpa donasi (±500 jt token / 10 ETH), dan tidak ada pool dengan total LP mendekati 1000.

### 4. INFO — Mock tanpa `feeTo` / `kLast` / `_mintFee`

- Untuk klaim "penyerang tidak untung", mock justru konservatif.
- Dengan `feeTo` aktif, temuan 1 tetap menguntungkan, dan ambang temuan 2 naik ±20%.
- Jangka panjang, `feeTo` mengambil ±1/6 pertumbuhan fee pool yang terkunci. Copy "locked liquidity" perlu menyebut ini.

### 5. INFO — AMM ber-fee lebih tinggi

Pada AMM seperti itu, swap penyeimbang gagal di pemeriksaan K. Ini tidak berlaku di sini karena pair kanonik 997/1000 (`10-univ2-fee.md`). Peringatan di NatSpec tetap dipertahankan.

## Yang dinyatakan reviewer aman (tanpa donasi)

- **Rumus `_swapSize`** benar.
- **Batas swap:** jumlah yang ditukar ≤ ½ setoran.
- **`_amountOut`** sama dengan batas K pair.
- **Overflow** tidak mungkin.
- **Kebocoran:** tanpa donasi, ≤ ±1,7e-6 setoran.
- **Pemanggil:**
  - tidak ada reentrancy;
  - tidak ada approval;
  - tidak ada sisa token/WETH;
  - `reservedPairEth` tidak tersentuh.
- **Tes front-run:** 12 tes yang ada lulus.

## Yang tidak diverifikasi reviewer

- Fork terhadap pair asli. Penulis kode yang menjalankannya; hasilnya ada di tabel di atas.
- Apakah bot akan men-`skim` donasi temuan 2 sebelum efektif.

## Status

**Kontrak tidak diubah.** Perbaikan butuh persetujuan owner. Setelah itu wajib:

1. kembali ke gerbang Phase 3;
2. tambah tes donasi tanpa `sync` (home dan remote, mock dan fork);
3. perketat toleransi;
4. jalankan seluruh suite;
5. review independen ulang.

## Bukti

- [raw/poc-unsynced-donation/output.txt](raw/poc-unsynced-donation/output.txt)
- PoC: `Poc.t.sol.txt` (mock), `ForkDonation.t.sol.txt` (fork)
- Model Python reviewer: `sim.py.txt`
- Berkas disimpan sebagai `.txt` supaya tidak ikut dikompilasi.
