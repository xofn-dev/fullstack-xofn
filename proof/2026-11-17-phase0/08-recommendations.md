# 08 — Rekomendasi untuk keputusan terbuka (P1–P9, P13, dan terkait)

Tanggal: **17 Nov 2026**. Dokumen ini berisi fakta ringkas dan rekomendasi developer. **Tidak ada keputusan yang diambil di sini**; pemilik keputusan tetap seperti di `PRD.md` §11.

Tingkat keyakinan:
- **Terverifikasi** — dari source/on-chain/tes (lihat file 01–07).
- **Jawaban awal** — dari pembacaan source; angka final baru ada setelah Phase 3.
- **Milik owner** — hanya data pendukung.

---

## P1 — DVN per pathway; apakah Fortress bisa dipenuhi (Terverifikasi)

Fakta (`02-dvn-pathways.md`):
- Base ↔ Arbitrum: Standard seperti di brief terpenuhi (Labs + Google · 1 dari DT/FCAT).
- Base ↔ Robinhood: Google dan Polyhedra tidak ada. Labs, DT, FCAT ada. Standard seperti di brief **tidak** terpenuhi.
- Polyhedra deprecated di Base dan Arbitrum. Fortress seperti di brief tidak terpenuhi di pathway mana pun tanpa memakai DVN deprecated.
- 13 operator lain tersedia dan aktif di ketiga chain.

Rekomendasi:
1. **Jangan memakai Polyhedra** (deprecated; brief sendiri menyebut risiko DVN pensiun).
2. Definisikan tier lewat **jumlah**, bukan nama operator tetap: Standard = 2 wajib + 1 dari 2 opsional; Fortress = 3 wajib + 1 dari 2 opsional. Badge `2+1/2` dan `3+1/2` tetap benar.
3. Opsional tetap **DT + FCAT** di semua pathway (tersedia di ketiganya).
4. Owner memilih operator wajib tambahan dari daftar 13 kandidat:
   - satu operator (X) untuk slot wajib kedua di pathway Robinhood;
   - satu operator (Y) untuk slot wajib ketiga Fortress.
5. Dua bentuk yang mungkin, owner memilih:
   - **Per pathway** (sejalan dengan usulan P18): Base↔Arbitrum memakai Labs + Google; Base↔Robinhood memakai Labs + X.
   - **Seragam**: Labs + X di semua pathway, Google tidak dipakai. Lebih sederhana untuk dijelaskan dan diaudit, tetapi melepas Google.
   Rekomendasi developer: **per pathway**, karena mempertahankan operator yang disebut brief di tempat ia tersedia.
6. Bila owner belum memilih X sebelum Phase 3, kontrak tetap bisa dibangun dan diuji dengan DVN mock; daftar putih adalah data, bukan kode.

Gerbang brief P0 ("Standard tersedia di kedua pathway") baru lolos setelah butir 4 diputuskan.

## P2 — Aset pasangan pool di chain ekspansi (Terverifikasi untuk fakta; keputusan owner)

Fakta (`04-amm-pair-asset.md`): native drop dibatasi 0,24 ETH (ke Arbitrum) dan 0,301 ETH (ke Robinhood) per pesan; satu-satunya stablecoin OFT di ketiga chain adalah USDe dan rutenya tidak langsung; pool satu sisi hanya mungkin di Uniswap v3/v4.

Rekomendasi bergantung pada besaran likuiditas per chain (P8, P16):
- Bila likuiditas pasangan per chain ekspansi ≤ ±0,2 ETH: **native drop + Uniswap v2**. Paling sederhana, dua arah sejak awal, risiko front-run paling kecil.
- Bila lebih besar: **pool satu sisi di Uniswap v3** (token saja, rentang di atas harga graduation), dengan mitigasi front-run inisialisasi dirancang dan diuji di Phase 3. Native drop bisa ditambahkan sebagai bid awal.
- **Stablecoin OFT tidak direkomendasikan untuk MVP**: dua pesan tidak atomik per chain, bergantung pada token dan DVN pihak ketiga, dan butuh swap di Base.

## P3 — Nasib token bila `lzCompose` gagal; `retryCompose` (Jawaban awal)

Dari source (`03-uln-semantics.md` §7): token sudah dikreditkan ke `XofNRemote` sebelum compose; compose yang gagal tetap tersimpan di endpoint dan bisa dijalankan ulang oleh siapa pun tanpa batas waktu; setelah sukses tidak bisa diulang.

Rekomendasi:
- `retryCompose` cukup berupa pemanggilan ulang `endpoint.lzCompose` dengan pesan yang sama (bisa dibungkus fungsi bantu di Remote).
- Composer tidak boleh bergantung pada pemanggil, `msg.value`, atau `extraData`; semua parameter dari `composeMsg`.
- Rancang jalur keluar untuk kegagalan permanen sebelum Phase 3 selesai, dan uji dengan multi-endpoint test.

## P4 — Gas `lzReceive` pesan deploy dan gas compose (Belum terukur)

Tidak bisa diukur tanpa kontrak. Data awal: `lzReceiveBaseGas` dan `lzComposeBaseGas` executor ke Robinhood = 85 000; biaya di Arbitrum/Robinhood punya komponen data L1. Rekomendasi tetap: ukur di Phase 3 dengan `forge test --gas-report`, beri margin, dan validasi di testnet (Phase 6, FROZEN).

## P5 — Nilai 0 di ULN custom (Terverifikasi)

**Ya, 0 berarti default** untuk `confirmations`, `requiredDVNCount`, dan `optionalDVNCount`; "benar-benar nol" ditulis `type(uint64).max` / `255`. Executor: `maxMessageSize == 0` dan `executor == address(0)` juga berarti default.

Rekomendasi: factory menolak tier yang punya field 0 di ULN atau executor config. Dengan begitu konfigurasi efektif tidak pernah bergantung pada default.

## P6 — Biaya per pesan Standard vs Fortress (Estimasi, bukan quote)

`DVN.getFee` adalah fungsi view dan bisa dibaca di mainnet tanpa transaksi. Dipanggil dengan konfirmasi 15, opsi kosong, pengirim dummy; **tidak termasuk** fee executor dan treasury.

| Arah | Komponen | Fee DVN (wei) | ≈ ETH |
|---|---|---|---|
| Base → Arbitrum | Standard: Labs + Google + DT + FCAT | 18 508 432 488 000 | 0,0000185 |
| Base → Arbitrum | Fortress: + 1 operator setara (±4,6 × 10¹²) | ±23 100 000 000 000 | ±0,0000231 |
| Base → Robinhood | Labs + DT + FCAT (3 dari 4 DVN Standard) | 6 305 767 315 200 | 0,0000063 |
| Base → Robinhood | Standard: + X (kandidat umum ±2,0–2,1 × 10¹²) | ±8 400 000 000 000 | ±0,0000084 |
| Base → Robinhood | Fortress: + X + Y | ±10 500 000 000 000 | ±0,0000105 |

Bacaan: porsi DVN Fortress ±25% di atas Standard bila operator tambahan sekelas. Pemilihan operator sangat berpengaruh: Canary ±543 × 10¹² wei per pesan di arah yang sama.

Rekomendasi: UI tetap menampilkan **"NOT QUOTED"** (sesuai PRD P6). Angka di atas hanya untuk perencanaan internal dan tidak ditampilkan sebagai quote.

## P7 — Gas `verify()` untuk 3 chain; perlu `verifyEid`? (Jawaban awal)

Per EID, verifikasi membutuhkan ±8 panggilan view eksternal: `owner`, `delegates`, `getSendLibrary`/`isDefaultSendLibrary`, `getReceiveLibrary`, `receiveLibraryTimeout`, dan tiga `getConfig` (ULN send, executor send, ULN receive) yang menyalin array DVN. Gas belum diukur.

Rekomendasi: sediakan `verifyEid(token, eid)` sejak awal (sesuai usulan PRD), dan ukur keduanya di Phase 3. Tambahkan pemeriksaan `receiveLibraryTimeout` kosong ke definisi `verify`.

## P8 — Parameter bonding curve dan ambang graduation (Milik owner)

Tidak ada rekomendasi angka. Kendala teknis yang perlu ikut dipertimbangkan:
- native drop per chain dibatasi ±0,24–0,30 ETH (P2);
- pemanggil `graduate()` membayar fee beberapa pesan LZ per chain ekspansi plus gas deploy token di chain tujuan, jadi insentif (P15) harus menutup itu;
- pembagian supply ke tiga chain (P16) menentukan kedalaman tiap pool.

## P9 — AMM per chain (Terverifikasi untuk fakta; keputusan owner)

Uniswap v2, v3, dan v4 ada di Base, Arbitrum, dan Robinhood.

Rekomendasi: pakai **satu versi yang sama di ketiga chain** agar composer dan audit seragam. Versinya mengikuti P2: v2 bila dua sisi dengan native drop; v3 bila satu sisi. v4 hanya bila owner menginginkan perlindungan inisialisasi lewat hook dan menerima kompleksitas tambahannya.

## P13 — Bagaimana `verify()` di Base mengetahui state chain lain (Terverifikasi untuk batasan)

Fakta:
- Robinhood tidak punya ReadLib1002 (mainnet dan testnet), jadi lzRead tidak bisa membaca Robinhood.
- Registry di Base hanya bisa membaca endpoint Base: konfigurasi send dan receive **sisi Base** untuk tiap EID. Konfigurasi receive di chain tujuan (yang melindungi kredit token di sana) tidak terbaca dari Base.

Perbandingan:

| Opsi | Bisa untuk Robinhood | Bukti on-chain di Base | Catatan |
|---|---|---|---|
| A. Registry di setiap chain + `verifyEid` lokal + ack LZ ke Base | Ya | Status yang dikirim lewat pesan (benar saat ack; tidak otomatis ter-update) | Usulan PRD/ARCHITECTURE |
| B. lzRead | **Tidak** | Ya | Backlog; menunggu ReadLib di Robinhood |
| C. Verify sisi Base saja | Sebagian | Ya, tetapi tidak mencakup sisi remote | Tidak memenuhi "semua chain" |

Rekomendasi: **Opsi A**, sesuai usulan yang tertulis. Yang perlu dijelaskan jujur di `/proof` dan NatSpec: `verify()` di tiap chain membuktikan keadaan chain itu secara langsung; status global "Locked" adalah gabungan pembacaan Registry di setiap chain oleh indexer/UI, dan ack hanya membuktikan keadaan pada saat graduation. Keputusan: owner + auditor.

---

## Temuan lain yang butuh keputusan sebelum Phase 3

### Urutan graduation — usul P28
Brief langkah 4 (kirim likuiditas + compose) mendahului langkah 5 (library, ULN, executor, enforced options, peer). Itu tidak bisa dijalankan:
- `send` revert `NoPeer` tanpa peer (source + tes);
- default pathway Robinhood adalah Dead DVN, jadi pesan apa pun tanpa ULN eksplisit tidak akan terkirim;
- di pathway Arbitrum, pengiriman sebelum konfigurasi akan berjalan di atas default, bertentangan dengan aturan "selalu eksplisit".

Rekomendasi: pasang konfigurasi token (langkah 5) **sebelum** mengirim likuiditas (langkah 4) di setiap pathway; langkah lain tetap. Karena urutan graduation adalah aturan protokol dari brief, ini butuh persetujuan owner.

### Topologi pathway — usul P29
Dokumen hanya menyebut Base↔Arbitrum dan Base↔Robinhood, sedangkan kriteria MVP menyebut "bridge dua arah antar ketiga chain". Bila Arbitrum↔Robinhood harus langsung, ada pathway ketiga yang perlu dikonfigurasi, diverifikasi, dan dikunci di kedua chain ekspansi. DVN untuk pathway itu tersedia (Labs, DT, FCAT + kandidat). Pilihan: mesh penuh (3 pathway) atau hub lewat Base (2 pathway, bridge Arbitrum→Robinhood jadi dua langkah). Owner.

### Catatan desain untuk Phase 3 (bukan keputusan)
- Kontrak OApp sendiri selalu berwenang di endpoint; `XofNToken` tidak boleh punya jalur ke fungsi konfigurasi endpoint.
- Alamat token seragam antar-chain butuh CREATE3 dengan salt yang tidak terikat pemanggil, sehingga bisa didahului pihak lain. Brief hanya mensyaratkan alamat seragam untuk `XofNRemote`; alamat token seragam sebaiknya tidak dijadikan syarat.
- Label operator dan urutan array DVN bersifat per chain.
- `block.number` di Arbitrum dan Robinhood adalah perkiraan blok L1.

### Catatan untuk Phase 2 (bukan keputusan)
- Check menampilkan konfigurasi efektif (`endpoint.getConfig`) dan mentah (`lib.getAppUlnConfig`).
- Label "blocked" untuk pathway yang DVN-nya Dead DVN (alamat per chain di `01-chains-eid.md`).
- Jangan beri label "locked" bila kontrak adalah proxy dengan admin (baca slot EIP-1967).
- Discovery utama lewat `peers(eid)`; OFT API pelengkap dan tidak mencakup Robinhood.
- Algoritma label di ARCHITECTURE §7 menyebut `effective ≤ 1` sebagai "1-of-1", sedangkan PRD §4.1 mendefinisikan 1-of-1 sebagai satu DVN wajib tanpa opsional. Konfigurasi "0 wajib + 1 dari N opsional" jatuh ke label yang sama; copy-nya perlu diputuskan.

## Fakta untuk P10, P18, P21

- **P10:** Robinhood tidak punya ReadLib1002 di mainnet maupun testnet. lzRead tetap backlog.
- **P18:** Google tidak ada di Robinhood, jadi DVN wajib kedua mau tidak mau berbeda per pathway, kecuali owner memilih satu operator seragam (lihat P1).
- **P21:** OFT API `/list` gratis tanpa key; `LZ_OFT_API_KEY` tidak diperlukan. Untuk RPC: RPC publik cukup untuk pengembangan dan gerbang Phase 2; untuk produksi, Robinhood butuh provider berbayar (docs merekomendasikan Alchemy). Pemilihan provider dan akun: owner.
