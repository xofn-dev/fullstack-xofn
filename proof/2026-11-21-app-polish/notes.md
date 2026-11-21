# Polish halaman aplikasi + realtime (21 Nov 2026)

Phase 4 (frontend + `src/lib/**` + `src/app/api/tokens/**`). Kontrak, `script/**`, `deployments/**`, dan `supabase/**` tidak disentuh. Tidak ada transaksi di jaringan publik. Tidak ada tangkapan layar di folder ini (keputusan pengguna); pratinjau dilakukan agent lewat Chrome headless.

## Permintaan
- Halaman dalam dibuat setara landing; semua tombol dipastikan bekerja; loading tidak lama; data realtime.
- Catatan pengguna: di `/t/[address]` dan `/launch` UI baru tidak boleh memperlambat trading maupun launch.
- Tambahan selama pengerjaan: kolom Age / Time di Recent curve trades; badge BUY hijau / SELL merah; tombol Sell dan tombol kirim berwarna menurut sisi; dropdown dirapikan.

## Temuan pengukuran (testnet, baca saja)
Rencana awal menduga pemindaian `eth_getLogs` dari blok deploy sebagai penyebab lambat. Pengukuran membantahnya: rentang penuh (±677 ribu blok) dijawab RPC dalam ±0,4 dtk. Penyebab sebenarnya:
- 5 round trip RPC berurutan per pembacaan (±0,5 dtk masing-masing);
- ±6 round trip Supabase berurutan per polling (±0,17 dtk masing-masing);
- halaman menunggu semua itu sebelum mengirim byte pertama.

Chunking log dan flag `tradesIndexed` dari rencana tidak dibuat karena tidak diperlukan.

| Ukuran (dev server, index hangat) | Sebelum | Sesudah |
|---|---|---|
| `GET /api/tokens/[address]` | 2,4–3,1 dtk | 0,02–0,35 dtk |
| `GET /api/tokens?status=all` | 2,5–2,9 dtk | 0,33–0,39 dtk |
| `/t/[address]` sampai HTML lengkap | 2,5–4,5 dtk | 0,13–0,30 dtk |
| Polling receipt transaksi | 4 dtk | 1 dtk |
| Umur data curve di layar | sampai ±6,5 dtk | ±2 dtk |

Multicall3 di chain 46630 dipastikan ada lewat `eth_getCode` sebelum dipakai.

## Yang diubah
- **Server:** state chain dibaca bersamaan dengan sync; sync hangat satu putaran RPC dengan tumpang-tindih 64 blok; Multicall3 di jaringan publik; `CachedTokenStore` di depan Supabase; status hanya ditulis saat berubah; detail membawa paling banyak 200 trade + `tradeCount` + `curveParams`; waktu blok untuk 30 trade terbaru (cache per blok, jeda coba ulang 30 dtk); sync ulang sekali sebelum `not_found`; route baru `GET /api/tokens/launch-config`.
- **Klien:** `useCurveLive` (2 dtk), trade dari receipt, debounce quote, receipt 1 dtk / batas 90 dtk, SSR berbatas waktu + `loading.tsx`.
- **Visual:** lihat `DESIGN_SYSTEM.md` §15.
- **Tombol:** copy tanpa Clipboard API memberi tahu pengguna; submit trade menyebut alasannya; toggle sisi terkunci saat transaksi berjalan; `reset()` tidak bisa membatalkan status transaksi yang berjalan; Graduate / Expand terkunci setelah berhasil; fee Expand yang gagal dibaca bisa dibaca ulang; Retry / Re-ack menyatakan alasannya; `SimulationRelay` memakai `try/finally`; tombol tukar arah bridge tidak lagi melebar; `NetworkGuard` memakai mode aplikasi yang sebenarnya.

## Hasil pemeriksaan
- `npm run lint`: lulus.
- `npm run typecheck`: lulus.
- `npm run test`: 158 tes lulus (8 file). Baru: `tests/token-live.test.ts`; `tests/tokens.test.ts` diperluas (sync hangat, batas trade, cache store, waktu blok, status).
- `npm run build`: lulus.
- `npm run test:anvil`: 8 tes lulus terhadap Anvil lokal + `DeployLocal` (launch → buy/sell → graduate → trade pool → expand & lock → bridge → reAck).
- **Uji UI di simulasi lokal** (Chrome headless, akun dev Anvil): launch lewat form, buy, approve, sell.
  - Halaman token tampil 0,25 dtk setelah redirect dari launch.
  - Klik Buy → baris trade tampil 1,1 dtk; Sell 1,1 dtk (dibatasi polling receipt 1 dtk).
  - Tanpa throttle: tidak ada long task; layout shift 0,0009; tombol kirim bergeser 0 px setelah trade.
  - CPU throttle 4×: tidak ada long task saat mengetik; selama sesi trade ada 7 long task 52–145 ms (saat transaksi terkonfirmasi dan panel dirender ulang).
  - Jumlah dikosongkan setelah buy, dipertahankan setelah approve.
- Lebar 360 / 390 / 768 / 1280 / 1680px: tanpa overflow horizontal. 0 konteks WebGL di `/t`, `/launch`, `/proof`, `/contracts`, `/check`.
- `prefers-reduced-motion`: animasi masuk, denyut titik live, dan putaran koin terbaca `none`.

## Yang tidak diuji
- **Buy / sell / launch dengan wallet di testnet.** Agent tidak memanggil fungsi produk di jaringan publik (CLAUDE.md §5.1). Perlu klik-wallet oleh pengguna.
- Tombol Retry, Re-ack, Graduate, dan Expand **lewat UI** (jalur kontraknya lulus di `test:anvil`).
- Trace Performance perbandingan sebelum/sesudah di halaman testnet (mesin dev sedang sangat sibuk selama pengerjaan; yang diukur adalah long task dan layout shift di simulasi lokal).
- `SupabaseTokenStore` terhadap skema: tidak berubah; `CachedTokenStore` diuji dengan store tiruan dan berjalan terhadap Supabase proyek di dev server.

## Untuk PM / owner
- Warna jual memakai turunan `danger`, yang juga dipakai untuk status Changed. Keduanya selalu disertai teks; bila perlu dibedakan, tambahkan token `sell-*` tersendiri.
- Waktu trade tidak disimpan di tabel `curve_trades` (kolom `block_time` ada tetapi tidak diisi); dibaca ulang dari chain per proses. Mengisinya butuh perubahan penulisan index, di luar task ini.
- Belum ada jadwal cron di repo untuk menghangatkan index; proses baru membayar satu pembacaan dingin (±2,5 dtk).
