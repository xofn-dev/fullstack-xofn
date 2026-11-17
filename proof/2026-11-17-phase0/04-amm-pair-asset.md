# 04 — AMM per chain dan aset pasangan (P9, P2)

Tanggal akses: **17 Nov 2026** (UTC 08:46–08:48).

## Sumber

| # | Sumber | Dipakai untuk |
|---|---|---|
| S1 | `Uniswap/contracts@3b872969fff4f5d807db916564f79843d722af36`, file `deployments/4663.md`, `deployments/8453.md`, `deployments/42161.md` — https://github.com/Uniswap/contracts/tree/3b872969fff4f5d807db916564f79843d722af36/deployments | Alamat resmi Uniswap per chain |
| S2 | On-chain `cast code` + pembacaan fungsi view | Kontrak benar-benar ada |
| S3 | On-chain `Executor.dstConfig(eid)` | Batas native drop |
| S4 | https://metadata.layerzero-api.com/v1/metadata (`tokens`) dan OFT API `/list` | Stablecoin dan OFT per chain |
| S5 | https://docs.robinhood.com/chain/differences-from-ethereum | Perbedaan Robinhood Chain dari Ethereum |

Keluaran: [`raw/amm.txt`](raw/amm.txt), [`raw/executor.txt`](raw/executor.txt).

## AMM (P9) — Uniswap v2, v3, dan v4 ada di ketiga chain

Alamat dari S1; semua punya bytecode (S2), dan ukuran bytecode kontrak yang sama identik di ketiga chain.

| Kontrak | Base | Arbitrum One | Robinhood Chain |
|---|---|---|---|
| UniswapV2Factory | `0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6` | `0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9` | `0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f` |
| UniswapV2Router02 | `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` | `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` | `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` |
| UniswapV3Factory | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` | `0x1F98431c8aD98523631AE4a59f267346ea31F984` | `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` |
| NonfungiblePositionManager (v3) | `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1` | `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` | `0x73991a25c818bf1f1128deaab1492d45638de0d3` |
| PoolManager (v4) | `0x498581ff718922c3f8e6a244956af099b2652b2b` | `0x360e68faccca8ca495c1b759fd9eee466db9fb32` | `0x8366a39cc670b4001a1121b8f6a443a643e40951` |
| PositionManager (v4) | `0x7c5f5a4bbd8fd63184577525326123b519429bdc` | `0xd88f38f930b7952f2db2432cb002e7abbf3dd869` | `0x58daec3116aae6d93017baaea7749052e8a04fa7` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | sama | sama |

Pembacaan tambahan di Robinhood (S2):
- `UniswapV2Router02.factory()` dan `WETH()` menunjuk ke factory di atas dan WETH9 `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`.
- `UniswapV2Factory.allPairsLength()` = 150 061 (Base 3 078 579, Arbitrum 8 892).
- Pool v3 WETH/USDG 0,05% dan pair v2 WETH/USDG sudah ada.
- USDG di Robinhood: `0x5fc5360d0400a0fd4f2af552add042d716f1d168`, 6 desimal (kontrak 170 byte, kemungkinan proxy).

Catatan: S1 mencantumkan dua alamat UniversalRouter untuk chain 4663 (ringkasan vs riwayat deploy). XofN tidak butuh UniversalRouter untuk membuat pool, jadi tidak ditindaklanjuti.

AMM lain di Robinhood (mis. Rialto) hanya disebut sumber pihak ketiga dan **tidak diverifikasi**.

## Aset pasangan (P2) — fakta

### Opsi A — native drop lewat opsi executor
Batas per pesan (`nativeCap`, S3), dalam ETH di chain tujuan:

| Arah | `nativeCap` | `lzReceiveBaseGas` | `lzComposeBaseGas` |
|---|---|---|---|
| Base → Arbitrum | 0,24 ETH | 1 | 1 |
| Base → Robinhood | 0,301 ETH | 85 000 | 85 000 |
| Arbitrum → Base | 0,05 ETH | 85 000 | 85 000 |
| Robinhood → Base | 0,05 ETH | 85 000 | 85 000 |

- `multiplierBps` executor = 12 000 di semua arah. Apakah multiplier ini juga dikenakan pada nilai native drop **belum diverifikasi** (`ExecutorFeeLib` belum dibaca).
- ETH dibayar pemanggil `graduate()` di Base, jadi harus bersumber dari dana curve.
- Batas ini bisa diubah LayerZero kapan saja (dikonfigurasi di Executor).

### Opsi B — stablecoin OFT
Ketersediaan (S4):

| Aset | Base | Arbitrum | Robinhood |
|---|---|---|---|
| USDe (OFT, alamat sama `0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34`) | ada | ada | ada |
| USDT0 | varian Stargate | ada | tidak ada |
| USDG | tidak tercatat | ada | ada |
| USDC (native) | ada | ada | tidak tercatat |

- Hanya USDe yang tercatat sebagai OFT di ketiganya. Peer langsung USDe Base→Arbitrum **kosong** saat dibaca (lihat `03-uln-semantics.md`), jadi rutenya tidak langsung; rute ke Robinhood belum diperiksa.
- Butuh swap ETH → stablecoin di Base, lalu pesan lintas chain kedua per chain. Dua pesan itu tidak atomik dengan pengiriman token XofN.
- Keamanan likuiditas ikut bergantung pada konfigurasi DVN token pihak ketiga itu.

### Opsi C — pool satu sisi (hanya token XofN)
- Uniswap v2 tidak mendukung (butuh kedua aset).
- Uniswap v3 dan v4 mendukung posisi satu sisi: likuiditas ditaruh di rentang harga di atas harga awal.
- Tidak ada aset pasangan yang perlu dikirim; satu pesan per chain.
- Kelemahan: tidak ada likuiditas beli (bid) sampai ada yang membeli; harga awal ditentukan saat pool diinisialisasi.
- Risiko front-run: pool v3 bisa dibuat dan diinisialisasi siapa pun pada harga berapa pun, tanpa memegang token, begitu alamat token diketahui. Bila harga awal dipasang di atas rentang, posisi yang ingin dibuat composer akan butuh aset pasangan dan gagal. v4 bisa menutup celah ini lewat hook pada `PoolKey`, dengan biaya kompleksitas. Untuk v2 celah ini jauh lebih kecil, karena sebelum graduation tidak ada token XofN di chain tujuan.

## Perbandingan

| Kriteria | A. Native drop | B. Stablecoin OFT | C. Satu sisi |
|---|---|---|---|
| Pesan LZ per chain | 1 | 2 (tidak atomik) | 1 |
| Batas jumlah | 0,24 / 0,301 ETH per pesan | Tidak ada batas executor | Tidak ada |
| Likuiditas dua arah sejak awal | Ya (tipis) | Ya | Tidak |
| Ketergantungan pihak ketiga | Executor LZ | Token + DVN + rute pihak ketiga, DEX di Base | Tidak ada |
| AMM yang cocok | v2, v3, v4 | v2, v3, v4 | v3, v4 |
| Risiko utama | Batas kecil; batas bisa berubah | Kompleksitas; dua pesan; slippage swap | Harga awal lemah; front-run inisialisasi (v3) |
| Kompleksitas composer | Rendah | Tinggi | Sedang (v3) / tinggi (v4 + hook) |

Rekomendasi ada di `08-recommendations.md` (P2, P9). Keputusan milik owner.

## Fakta Robinhood Chain yang memengaruhi kontrak (S5)

- `block.number` mengembalikan perkiraan nomor blok L1, bukan L2, dan hanya diperbarui berkala. Nomor blok L2 ada di `ArbSys.arbBlockNumber()`.
- Batas ukuran kode 96 KB (Ethereum 24 KB), init code 192 KB.
- Biaya transaksi = gas eksekusi L2 + biaya data L1; `gasleft()` dan estimasi gas berperilaku berbeda. Ini relevan untuk gas `lzReceive`/`lzCompose` (P4).
