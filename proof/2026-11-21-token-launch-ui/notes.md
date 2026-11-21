# Chart trading, statistik pasar, dan pratinjau launch (21 Nov 2026)

Phase 4 (frontend, `src/lib/**`, `src/app/api/tokens/**`). Kontrak, `script/**`, `deployments/**`, dan `supabase/**` tidak disentuh. Tidak ada transaksi di jaringan publik: semua trade uji dilakukan di Anvil lokal.

## Permintaan
- Halaman `/t/[address]` dan `/launch` dipertahankan desainnya, ditambah komponen fungsional yang dirujuk dari ponsfamily.com: chart trading (line/candle, timeframe, indikator), statistik pasar dengan market cap menonjol, dan kartu pratinjau "On the board".
- Keputusan pengguna selama pengerjaan: pakai `lightweight-charts`; simpan waktu blok di index; statistik dan chart bisa dipilih ETH atau USD; chart bisa dipilih Price atau Market cap (rujukan axiom.trade); volume tidak boleh menabrak candle, body candle pekat, batang volume pudar, ada celah antara harga dan volume, area volume tidak terlalu tinggi.

## Yang dibuat
- **Data:** waktu blok trade dibaca lewat `getBlock` lalu disimpan di kolom `curve_trades.block_time` yang sudah ada (tanpa migrasi), terbaru dulu, sedikit demi sedikit setelah respons dikirim. Route baru `GET /api/tokens/[address]/trades` dan `GET /api/tokens/eth-usd`. Statistik 24 jam (`market`) dihitung server.
- **Halaman token:** statistik pasar, chart harga (Curve / Line / Candles; 1m, 5m, 15m, 1h, 4h, 1D, 7D, All; Price / Market cap; Volume, MA 20, EMA 20, RSI 14), tabel trade dengan harga, filter sisi, dan "Show more"; chip alamat curve dan tautan XofN Check di kepala token.
- **Halaman launch:** kartu pratinjau yang mengikuti form. Field, validasi, dan transaksi launch tidak berubah.
- Rincian visual di `DESIGN_SYSTEM.md` §15; alur data di `ARCHITECTURE.md` §8, §9, §11.4.

## Sumber data dan batasnya
- **Candle** dibentuk dari event `Bought` / `Sold` curve. Curve tidak memungut fee, jadi harga sebelum dan sesudah tiap trade diturunkan tepat dari `ethRaised`. Bucket tanpa trade tidak menghasilkan candle. Trade yang waktu bloknya belum terbaca tidak ikut; chart menulis berapa trade yang sudah tercakup.
- **`eth_getLogs` di RPC Robinhood testnet mengisi `blockTimestamp` dengan 0** (dibaca 21 Nov 2026), jadi waktu selalu dibaca dari blok. Nilai 0 ditolak dan tidak pernah disimpan.
- **Kurs ETH/USD:** feed Chainlink ETH / USD di Robinhood Chain mainnet, proxy `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9`.
  - Sumber alamat: direktori feed Chainlink `https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json` (heartbeat 86400 dtk, deviasi 0,5%).
  - Pembacaan on-chain 21 Nov 2026 lewat RPC publik mainnet: `eth_chainId` = `0x1237` (4663), `description()` = "ETH / USD", `decimals()` = 8, `latestRoundData().answer` = 163.788.xxx.xxx (± $1.637,88).
  - Aplikasi menolak jawaban bila deskripsi, desimal, tanda, atau umurnya (lebih dari 25 jam) tidak sesuai.
  - Di testnet dan lokal kurs ini acuan berlabel ("REFERENCE RATE FROM MAINNET · TEST ETH HAS NO MARKET VALUE"). Sumbu chart dalam USD memakai kurs saat dibaca untuk semua candle dan menuliskannya.
- **Market cap** = harga × 999.000.000 (suplai tetap, seluruhnya sudah di-mint), berlabel FULLY DILUTED.
- **Tidak tersedia:** trade pool setelah graduation (tidak diindeks; chart dan statistik 24 jam menyatakannya), jumlah holder (tidak diindeks), deskripsi dan tautan sosial token (tidak ada di alur launch; penyimpanan metadata masih PRD P26).

## Uji di simulasi lokal
Anvil lokal + `script/local/DeployLocal.s.sol`, jam genesis dimundurkan empat hari. Satu token di-launch, lalu 166 trade (beli dan jual, ukuran bervariasi) dikirim dari akun dev Anvil dengan lompatan waktu di antaranya, sehingga riwayatnya tersebar empat hari sampai beberapa menit sebelum "sekarang". Tangkapan layar diambil lewat Chrome headless (emulasi viewport CDP).

| Berkas (`screenshots/`) | Isi |
|---|---|
| `01-desktop-candles-all.jpg` | Panel harga lengkap: statistik pasar, candle seluruh riwayat, pane volume terpisah |
| `02-desktop-candles-15m.jpg`, `-1h.jpg`, `-4h.jpg` | Timeframe berbeda dari data yang sama |
| `03-desktop-indicators-menu.jpg` | Menu indikator terbuka |
| `04-desktop-candles-1h-ma-ema-rsi.jpg` | MA 20, EMA 20, dan pane RSI 14 |
| `05-desktop-line-1h.jpg` | Mode Line |
| `06-desktop-marketcap-eth.jpg`, `07-desktop-marketcap-usd.jpg` | Sumbu Market cap, ETH dan USD |
| `08-desktop-price-usd.jpg` | Sumbu Price dalam USD |
| `09-desktop-curve.jpg` | Mode Curve (bentuk bonding curve, tidak berubah) |
| `10-desktop-trades.jpg`, `11-desktop-trades-sells.jpg` | Tabel trade setelah "Show more" dan dengan filter Sells |
| `12-desktop-full-page.jpg` | Seluruh halaman token |
| `13-mobile-390-chart.jpg`, `14-mobile-390-full-page.jpg`, `15-tablet-768-chart.jpg` | Lebar 390 dan 768 |
| `20-launch-desktop-empty.jpg`, `21-launch-desktop-filled.jpg`, `22-launch-mobile-390.jpg` | Pratinjau launch kosong, terisi (Fortress), dan di 390px |

Hasil yang diperiksa:
- Ganti timeframe mengubah candle (label legenda: 1m, 15m, 1h, 4h, 1D; 7D memakai candle 1h).
- Ganti mode (Curve / Line / Candles), `Price | Market cap`, `ETH | USD`, dan tiap indikator mengubah chart.
- Waktu blok 166 trade terisi di index dalam tiga putaran polling.
- Pratinjau launch: kosong → "Aurora Protocol $AURORA" + Fortress `XofN 3+1/2`; ticker "A" memunculkan "Ticker needs 2 to 12 letters or digits."
- Konsol tanpa error pada putaran akhir. Tanpa overflow horizontal di 390 / 768 / 1280 / 1440 / 1680px.

Temuan yang diperbaiki selama uji:
- Mode Market cap membuat chart jatuh ke tampilan cadangan: library chart menolak angka di atas ±9×10¹³, sedangkan market cap dalam wei sekitar 1,5×10¹⁸. Nilai plot kini dibagi pembagi pangkat sepuluh dan dikalikan kembali saat label diformat (`plotDivisor`, ada tesnya).
- Volume yang menumpang di pane harga bisa ditabrak candle saat sumbu digeser; volume dipindah ke pane sendiri.
- Tinggi pane yang diatur dengan piksel tidak berlaku sebelum chart punya ukuran; diganti rasio.

## Hasil pemeriksaan
- `npm run lint`: lulus.
- `npm run typecheck`: lulus.
- `npm run test`: 192 tes lulus (9 berkas). Baru: `tests/token-chart-data.test.ts` (blok tanpa waktu, riwayat dan kursor, candle, indikator, statistik pasar, kurs, satuan sumbu, warna). `tests/tokens.test.ts` diperluas (waktu blok disimpan, nilai 0 ditolak, pengisian bertahap dan jeda setelah gagal, route riwayat, `saveBlockTimes` di cermin).
- `npm run build`: lulus.
- `npm run test:anvil`: 8 tes lulus terhadap Anvil baru + `DeployLocal` (launch → buy/sell → graduate → trade pool → expand & lock → bridge → reAck).
- `git status`: tidak ada perubahan di `contracts/`, `test/`, `script/`, `foundry.toml`, `deployments/`, `supabase/`.

## Yang tidak diuji
- **Buy / sell / launch dengan wallet di testnet.** Agent tidak memanggil fungsi produk di jaringan publik (CLAUDE.md §5.1).
- **`SupabaseTokenStore` terhadap database nyata** untuk jalur baru (`saveBlockTimes`, pembacaan per halaman 1000 baris, `block_time`). Diuji dengan store memori dan cermin; di simulasi lokal store Supabase tidak aktif. Dugaan bahwa PostgREST memotong di 1000 baris dan mengirim `block_number` sebagai angka belum dibuktikan terhadap project; kodenya menangani kedua kemungkinan.
- Keyboard pada chart (panah kiri/kanan, Escape) dan `prefers-reduced-motion` tidak diuji lewat browser pada putaran ini.
- Jumlah long task dan layout shift saat trade berjalan tidak diukur ulang.
- Mode `preview` (`LaunchDemo` di `/launch`) tidak diberi kartu pratinjau; hanya form `/launch` yang sungguhan.

## Untuk PM / owner
- Dependency baru `lightweight-charts` 5.3.0 disetujui pengguna pada sesi ini; lisensinya meminta atribusi TradingView (logo di chart dibiarkan tampil).
- Build testnet dan lokal membaca feed harga di **mainnet** Robinhood Chain. Itu pembacaan saja, tetapi merupakan hal baru untuk proyek ini; perlu konfirmasi bahwa itu dikehendaki.
- Begitu versi ini berjalan dengan service key, aplikasi menulis `block_time` ke index Supabase (hanya kolom itu, hanya baris yang masih kosong).
- Kemungkinan bug lama, belum dijalankan: `/t/[address]` tidak memeriksa mode sebelum merender `TokenView`, jadi manifest dorman tanpa provider wagmi bisa memanggil hook tanpa provider.
- Usulan lanjutan: indeks swap pool Uniswap v4 setelah graduation supaya chart dan volume berlanjut; keputusan penyimpanan metadata (P26) bila deskripsi dan tautan sosial diinginkan.
