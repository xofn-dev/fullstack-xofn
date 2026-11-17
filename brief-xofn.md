# XofN — Developer Brief

Nov 14, 2026 · @ronald

## Narasi dan positioning

XofN adalah launchpad token omnichain di atas LayerZero yang menjadikan **keamanan lintas chain sebagai standar yang terukur dan bisa dicek siapa pun.** Setiap token membawa badge yang menyatakan berapa verifikator yang menjaganya, misalnya *XofN 2+1/2*. Konfigurasi 1-of-1 tidak pernah diizinkan.

**Tagline utama:** *Never one of one.* **Tagline sekunder:** *Graduate on proof, not promises.*

**Arti nama:** LayerZero memakai model keamanan *X-of-Y-of-N*: aplikasi memilih X DVN wajib dan Y dari N DVN opsional. Inilah yang membedakan LayerZero dari bridge dengan satu set verifikator tetap. XofN mengambil nama itu langsung dan mengubahnya menjadi badge.

**Cerita yang dijual:** setelah exploit Kelp DAO (April 2026, sekitar $292 juta), data Dune menunjukkan 47% dari sekitar 2.665 aplikasi LayerZero memakai konfigurasi 1-of-1. Hanya sekitar 5% yang memakai 3-of-3 atau lebih. Pasar tidak punya cara mudah untuk tahu sebuah token termasuk yang mana. XofN memberi jawabannya dalam satu badge.

**Tiga hal yang membedakan XofN dari ZeroKnown dan DVNity:**

1. **Tier keamanan dipilih creator dan tampil sebagai badge.** Tier yang lebih tinggi lebih mahal per pesan.
2. **XofN Check untuk OFT mana pun.** Halaman publik yang membaca konfigurasi DVN dari token OFT apa saja, bukan hanya token XofN. Ini alat konten dan alat distribusi.
3. **Terkunci saat graduation.** Token mulai di bonding curve di satu chain. Saat lulus, satu alur otomatis memasang chain ekspansi, menyalurkan likuiditas lewat lzCompose, lalu mengunci semuanya.

**Target pengguna:**

- Trader yang ingin tahu risiko bridge sebuah token dalam satu detik.
- Creator yang ingin token bisa dipindah lintas chain begitu terbukti ada permintaan, bukan sejak hari pertama.
- Builder, aggregator, dan DEX yang butuh fungsi on-chain `verify(token)` untuk memfilter token.

**Catatan nada:** XofN paling teknis dari tiga brand. Bahasanya presisi dan berbasis angka, cocok untuk CT yang paham infrastruktur, tapi badge-nya harus tetap bisa dipahami trader biasa.

## Lingkup MVP dan non-goals

MVP membuktikan tiga hal: **badge tier keamanan bisa diverifikasi on-chain, token terkunci otomatis saat graduation, dan siapa pun bisa mengecek X-of-N sebuah OFT dalam satu klik.**

**Masuk MVP:**

1. **Template `XofNToken` (OFT).** Supply tetap 999.000.000, tanpa fungsi mint publik, pajak, blacklist, pause, atau upgrade.
2. **Bonding curve di home chain (Base).** Token diperdagangkan di curve sampai mencapai ambang graduation.
3. **`XofNGraduator`.** Saat ambang tercapai, satu alur otomatis membuat pool di Base, men-deploy token di chain ekspansi, menyalurkan likuiditas lewat lzCompose, memasang tier DVN, lalu mengunci semuanya.
4. **Dua tier keamanan + penolakan 1-of-1.** Detailnya di bagian Tier keamanan.
5. **`XofNRegistry`.** Kontrak yang menyimpan tier tiap token dan menyediakan `verify(token)`. Fungsi ini membaca ulang konfigurasi endpoint secara on-chain dan mengembalikan `true` hanya kalau konfigurasi masih sesuai tier dan owner/delegate sudah nol.
6. **XofN Check.** Halaman publik `/check/<chain>/<alamat>` untuk OFT mana pun: menampilkan DVN wajib, DVN opsional, threshold, owner, dan delegate per pathway, dengan label "1-of-1" merah kalau ditemukan.
7. **Chain ekspansi MVP:** Arbitrum dan Robinhood Chain.

**Bukan bagian MVP (non-goals):**

- **Graduation lintas chain dengan lzRead.** Fase P2, setelah dukungan ReadLib di chain target dikonfirmasi.
- **Verifikasi creator zkTLS.** Itu wilayah ZeroKnown. XofN fokus ke keamanan token, bukan identitas creator.
- **Monitor independen ala Oracle Watch.** Itu wilayah DVNity. XofN cukup memeriksa ulang konfigurasi secara berkala.
- **Shielded pools, Solana, HyperEVM, Elysium, integrasi ATLAS/Zero.**
- **Token $XOFN** sebelum MVP live di mainnet dan diaudit.

## Arsitektur sistem

Token XofN melewati dua fase: **bonding** di satu chain (Base), lalu **graduation** yang memperluasnya ke chain lain dan mengunci semuanya sekaligus. XofN Check berjalan terpisah sebagai alat baca untuk OFT mana pun.

&#91;embedded content: siklus hidup token XofN · bonding sampai terkunci\]

Selama bonding, satu-satunya "owner" token adalah kontrak Graduator. Badge baru berstatus Terkunci setelah `verify()` mengembalikan `true` untuk semua chain.

## Kontrak: template OFT, factory, dan resep immutable

Desain khas XofN: **token belum terkunci selama bonding, dan terkunci otomatis saat graduation.** Selama bonding, owner dan delegate token adalah kontrak `XofNGraduator`, bukan orang. Graduator tidak punya fungsi admin untuk mengubah konfigurasi, kecuali satu jalur graduation yang hasilnya sudah ditentukan oleh tier.

Prinsip dasarnya tetap: renounce ownership tidak cukup. Delegate di endpoint harus dinolkan, dan library serta konfigurasi harus di-pin, karena default LayerZero bisa berubah ([default config](https://docs.layerzero.network/v2/developers/evm/configuration/default-config), [transfer ownership](https://docs.layerzero.network/v2/developers/evm/technical-reference/transfer-ownership)).

### Kontrak

| Kontrak | Peran | Catatan |
| --- | --- | --- |
| `XofNToken` | Token OFT | 999M di-mint ke bonding curve di Base. Shared decimals 6. |
| `XofNCurve` | Bonding curve di home chain | Parameter tetap per launch: harga awal dan ambang graduation |
| `XofNGraduator` | Owner sementara token, menjalankan graduation dan resep immutable | Tidak upgradeable. Tidak punya fungsi untuk mengubah tier setelah launch. |
| `XofNRemote` (OApp + composer) | Di chain ekspansi: men-deploy token, menerima lzCompose, membuat pool | Alamat sama lewat CREATE3/CreateX |
| `XofNRegistry` | Menyimpan tier per token, menyediakan `verify(token)` | Dibaca UI, aggregator, dan DEX |

### Alur graduation (urutan wajib)

1. Curve mencapai ambang. Siapa pun bisa memanggil `graduate()`, dan pemanggil mendapat insentif kecil yang tetap.
2. Graduator membuat pool di Base dengan likuiditas dari curve.
3. Untuk setiap chain ekspansi, graduator mengirim pesan deploy ke `XofNRemote` dengan salt yang sama.
4. Setelah token remote terkonfirmasi, graduator mengirim porsi token likuiditas lewat `send` + compose. `XofNRemote` membuat pool di chain itu di dalam `lzCompose`.
5. Di setiap pathway dan kedua arah: set library eksplisit, konfigurasi ULN sesuai tier, konfigurasi executor, enforced options (gas `lzReceive` dan `lzCompose`), lalu peer.
6. Verifikasi on-chain lewat `XofNRegistry.verify` versi pra-kunci. Revert kalau tidak sesuai.
7. `setDelegate(address(0))`, lalu `renounceOwnership()` di setiap chain.
8. `XofNRegistry` mencatat token sebagai "Terkunci" dengan tier final.

**Langkah 3–7 tidak atomik lintas chain.** Kalau satu chain gagal, graduation di chain itu harus bisa diulang. Token tidak boleh tampil "Terkunci" sebelum semua chain selesai. Graduator butuh fungsi `retryRemote(eid)` yang hanya bisa mengulang langkah yang sama dengan parameter yang sama.

### Override wajib di `XofNToken`

- `renounceOwnership()` menolkan delegate lebih dulu, menutup celah QUIP-25.
- Tidak ada `mint`, `pause`, `setFee`, `blacklist`, atau `upgrade`.

### Risiko yang harus diakui

- Selama bonding, keamanan token bergantung pada kode `XofNGraduator`. Graduator wajib diaudit paling ketat.
- Setelah terkunci, tidak ada chain yang bisa ditambah, dan pathway bisa macet kalau DVN yang di-pin pensiun. Contohnya Nethermind yang keluar dari peran DVN pada 19 Agustus 2026.
- **Perlu dicek di `UlnBase.sol`:** apakah nilai 0 di konfigurasi custom berarti default.

## Tier keamanan XofN dan badge

Creator memilih satu dari dua tier saat launch. Tier tidak bisa diturunkan, dan 1-of-1 ditolak di level kontrak. Kedua tier mengikuti pola di docs LayerZero [Production DVN Configuration](https://docs.layerzero.network/v2/concepts/modular-security/production-dvn-configuration).

| Tier | Badge | DVN wajib | DVN opsional | Untuk siapa |
| --- | --- | --- | --- | --- |
| Standard (default) | **XofN 2+1/2** | LayerZero Labs + Google Cloud (atau Polyhedra) | 1 dari 2: Deutsche Telekom MMS / Fidelity (FCAT) | Kebanyakan token |
| Fortress | **XofN 3+1/2** | Labs + Google Cloud + Polyhedra | 1 dari 2: DT MMS / FCAT | Token yang ingin keamanan maksimal; biaya per pesan lebih tinggi |
| — | **1/1** | Ditolak | — | Tidak pernah |

Alamat DVN per chain diambil dari [DVN addresses](https://docs.layerzero.network/v2/developers/evm/technical-reference/dvn-addresses). Ketersediaan tiap DVN per pathway harus dicek di P0.

### Format badge

- `XofN 2+1/2` berarti 2 DVN wajib ditambah 1 dari 2 DVN opsional.
- Badge selalu ditampilkan bersama status: **Terkunci** (owner dan delegate nol), **Bonding** (belum graduation, owner = Graduator), atau **Berubah** (konfigurasi tidak lagi sesuai tier, merah).
- Badge di UI selalu bisa diklik untuk melihat daftar DVN dan alamat setiap pathway.

### `XofNRegistry.verify(token)`

Fungsi view on-chain yang bisa dipanggil kontrak lain, misalnya DEX atau aggregator yang hanya ingin menampilkan token terkunci.

- Membaca `owner()` dan `endpoint.delegates(token)`: keduanya harus `address(0)`.
- Membaca `endpoint.getConfig` dan library untuk setiap EID yang terdaftar, lalu membandingkannya dengan hash tier yang tersimpan.
- Mengembalikan `(bool locked, uint8 tier, uint32[] eids)`.
- Pertimbangan gas: kalau terlalu mahal untuk banyak chain, sediakan juga `verifyEid(token, eid)` per pathway.

### XofN Check untuk OFT mana pun

Halaman publik yang membaca konfigurasi DVN token OFT apa saja, termasuk token di luar XofN:

- Input: chain dan alamat token, atau cari lewat [OFT API](https://docs.layerzero.network/v2/tools/api/oft-reference) LayerZero untuk menemukan semua deployment-nya.
- Output per pathway: jumlah DVN wajib, DVN opsional, threshold, nama operator (kalau ada di daftar label), owner, dan delegate.
- Label otomatis: "1-of-1" merah, "2+" kuning, "2+ dan terkunci" hijau.
- **Aturan konten:** XofN Check menampilkan fakta, bukan tuduhan. Jangan membuat konten yang menyebut proyek lain "tidak aman". Biarkan data yang bicara, dan beri tahu tim proyek sebelum membahas temuan besar secara publik.

## Fitur pembeda: ekspansi lzCompose dan graduation lzRead

Di MVP, graduation dihitung **lokal di Base** dan ekspansi likuiditas memakai **lzCompose**. Graduation lintas chain dengan **lzRead** masuk P2.

### lzCompose: dari graduation ke pool di chain baru dalam satu alur

lzCompose memungkinkan token yang tiba di chain tujuan langsung memicu langkah berikutnya, yaitu membuat dan mengisi pool ([Composer overview](https://docs.layerzero.network/v2/developers/evm/composer/overview), [OFT composing](https://docs.layerzero.network/v2/developers/evm/oft/composing)).

**Cara kerjanya untuk XofN:**

1. Graduator memanggil `send` dengan `composeMsg` berisi instruksi pool (rasio, alamat AMM, penerima LP).
2. Token dikreditkan ke `XofNRemote` di chain tujuan lewat `lzReceive`.
3. Executor memanggil `lzCompose` di `XofNRemote` sebagai transaksi terpisah, dan `XofNRemote` membuat pool.

**Aturan keamanan composer (wajib):**

- `lzCompose` hanya menerima panggilan dari endpoint LayerZero, dan hanya untuk `XofNToken` yang terdaftar sebagai sumber.
- Enforced options harus mengisi gas untuk `lzReceive` **dan** `lzCompose`. Kalau gas compose kurang, token sudah sampai tapi pool tidak dibuat.
- Pembuatan pool dan penambahan likuiditas harus terjadi di dalam satu panggilan `lzCompose`. Kalau dipisah, ada risiko pool dibuat dengan harga awal yang dimanipulasi orang lain.
- Belum jelas dari docs apa yang terjadi pada token kalau `lzCompose` gagal. Harus diuji, dan `XofNRemote` butuh jalur `retryCompose` yang aman.

**Masalah aset pasangan:** OFT hanya mengirim token XofN, sedangkan pool juga butuh aset pasangan (ETH atau stablecoin) di chain tujuan. Opsi yang harus dievaluasi di P0:

- **Native drop lewat executor option** untuk mengirim ETH ke `XofNRemote`. Perlu dicek apakah ada batas jumlahnya.
- **Stablecoin OFT** (misalnya USDT0, kalau tersedia di kedua chain) dikirim dalam alur yang sama.
- **Pool satu sisi** (hanya token), kalau AMM di chain tujuan mendukungnya. Ini paling sederhana tapi harga awalnya lemah.

Keputusan ini ada di tangan owner setelah developer membandingkan biaya dan risikonya.

### lzRead: graduation lintas chain (P2)

lzRead memungkinkan kontrak di satu chain membaca state di chain lain, dengan hasil yang diverifikasi DVN. Hasilnya bisa diagregasi dengan `lzMap`/`lzReduce` ([lzRead overview](https://docs.layerzero.network/v2/developers/evm/lzread/overview)).

**Kegunaan di XofN P2:** menghitung metrik gabungan, misalnya total cadangan pool di semua chain, untuk memicu ekspansi ke chain ketiga atau menampilkan "XofN Score" per token.

**Batasan yang sudah diketahui:**

- Chain yang didukung ReadLib1002 terbatas. Yang sudah terkonfirmasi: Arbitrum, Base, Ethereum, Optimism, Abstract, ApeChain, dan Avalanche. **Robinhood Chain belum terkonfirmasi.**
- Gunakan timestamp, bukan nomor blok, dan isi ukuran respons di gas option.
- Pakai cadangan pool atau TWAP sebagai pemicu, bukan jumlah holder, karena jumlah holder mudah dimanipulasi.

## Frontend dan alur pengguna

Semua transaksi disusun di browser dan ditandatangani di wallet pengguna. Server tidak pernah memegang key. Server hanya mengindeks event dan menyajikan data untuk XofN Check.

**Gaya visual:** teknis dan presisi, mirip dashboard infrastruktur. Badge `XofN 2+1/2` adalah elemen visual utama di setiap kartu token.

### Halaman

| Halaman | Isi |
| --- | --- |
| `/` | Token dalam bonding (progres ke graduation) dan token terkunci, dengan badge tier |
| `/launch` | Form launch: nama, ticker, gambar, pilihan tier (Standard / Fortress), chain ekspansi (Arbitrum, Robinhood), perkiraan biaya graduation |
| `/t/<alamat>` | Trading di curve atau pool, badge + status, daftar DVN per pathway, supply per chain, hasil `verify()` live |
| `/check` | XofN Check: cari OFT mana pun berdasarkan chain dan alamat |
| `/check/<chain>/<alamat>` | Hasil pemeriksaan per pathway, bisa dibagikan sebagai gambar kartu untuk X |
| `/bridge` | Pindah token antar chain setelah graduation |
| `/contracts`, `/proof` | Alamat dan bukti dari manifest |

### Alur launch

1. Creator mengisi form dan memilih tier. UI menampilkan perbedaan biaya per pesan antara Standard dan Fortress (diukur dari `quoteSend` di testnet).
2. Satu tanda tangan di Base: token di-mint ke curve, Graduator menjadi owner sementara, tier dicatat di `XofNRegistry`.
3. Kartu token tampil dengan status **Bonding** dan progres bar ke ambang graduation.

### Alur graduation

1. Saat ambang tercapai, tombol "Graduate" muncul untuk siapa pun. Pemanggil membayar fee LayerZero dan menerima insentif tetap.
2. UI menampilkan progres per chain: pool Base dibuat → token Arbitrum dideploy → likuiditas Arbitrum dikirim → pool Arbitrum dibuat → dikunci. Lalu urutan yang sama untuk Robinhood Chain.
3. Kalau satu langkah gagal, tombol "Retry" untuk chain itu muncul.
4. Setelah semua chain selesai, status berubah menjadi **Terkunci** dan `verify()` mengembalikan `true`.

### Alur XofN Check

1. Pengguna memasukkan alamat token OFT.
2. Backend memakai OFT API LayerZero untuk menemukan deployment di chain lain, lalu membaca `getConfig` untuk setiap pathway lewat RPC.
3. Hasil tampil per pathway dengan label warna, plus tombol "Bagikan" yang menghasilkan gambar kartu.
4. Hasil di-cache dengan waktu pengecekan. Selalu tampilkan "dicek pada \<waktu>".

**Bridge:** `quoteSend` tepat sebelum `send`. Jumlah di bawah 0,000001 token tetap tinggal di wallet pengirim, dan UI menjelaskannya.

## Chain, deployment, dan milestone

XofN berawal dari **Base (home)**, dengan **Arbitrum dan Robinhood Chain sebagai chain ekspansi** saat graduation. Base dipilih sebagai home karena termasuk chain yang mendukung lzRead, sehingga fitur P2 bisa dibangun di atas home chain yang sama. Semua chain ini punya endpoint LayerZero V2 ([Base](https://docs.layerzero.network/v2/deployments/chains/base.md), [Arbitrum](https://docs.layerzero.network/v2/deployments/chains/arbitrum.md), [Robinhood](https://docs.layerzero.network/v2/deployments/chains/robinhood)).

| Chain | Peran | Yang harus dicek |
| --- | --- | --- |
| Base | Home: curve, pool pertama, registry | DVN Standard dan Fortress di pathway ke Arbitrum dan Robinhood |
| Arbitrum | Ekspansi saat graduation | AMM tujuan, opsi aset pasangan |
| Robinhood Chain | Ekspansi saat graduation | DVN non-Labs di pathway Base ↔ Robinhood, AMM tujuan |
| Base Sepolia, Arbitrum Sepolia, Robinhood testnet | Pengujian | Pathway testnet ter-wire |
| Solana, HyperEVM | Fase berikutnya | Di luar MVP |
| Elysium | Tidak didukung | Belum ada endpoint LayerZero |

Kalau pathway Base ↔ Robinhood tidak punya 3 operator DVN, tier **Fortress** tidak ditawarkan untuk ekspansi ke Robinhood. UI harus menjelaskan alasannya.

### Urutan deploy

1. Deploy `XofNGraduator`, `XofNRemote`, dan `XofNRegistry` dengan CREATE3/CreateX ([uniform address](https://docs.layerzero.network/v2/developers/evm/tooling/uniform-address)).
2. Wire peer antar `XofNRemote`/Graduator dengan tier Fortress untuk pesan infrastruktur, lalu kunci.
3. Siapkan indexer untuk XofN Check (RPC per chain, cache).
4. Verifikasi semua kontrak di explorer dan tulis alamat ke `deployments/<network>.json`.
5. Owner kontrak infrastruktur (daftar putih DVN, label operator) adalah Safe multisig 2-of-3. Perubahan daftar putih tidak memengaruhi token yang sudah terkunci, dan harus diumumkan sebelum dieksekusi.

### Milestone dan gerbang

1. **P0 – Verifikasi (minggu 1–2).** Pathway DVN, AMM di tiap chain, opsi aset pasangan untuk compose. *Gerbang:* tier Standard tersedia di Base ↔ Arbitrum dan Base ↔ Robinhood.
2. **P1 – XofN Check (minggu 2–4).** Dirilis lebih dulu sebagai alat publik untuk membangun audiens sebelum launchpad. *Gerbang:* hasil Check untuk 20 OFT populer cocok dengan pembacaan manual.
3. **P2 – Token, curve, Graduator di testnet (minggu 3–7).** *Gerbang:* graduation penuh ke 2 chain sukses di testnet, termasuk retry setelah kegagalan yang disengaja.
4. **P3 – Registry dan `verify()` (minggu 6–8).** *Gerbang:* `verify()` mengembalikan `false` untuk token yang sengaja tidak dikunci.
5. **P4 – Audit (minggu 8–11).** Fokus ke Graduator dan composer. *Gerbang:* tidak ada temuan critical/high terbuka.
6. **P5 – Mainnet terbatas, lalu publik.** *Gerbang:* 5 graduation mainnet sukses tanpa insiden.
7. **P6 – Graduation lintas chain dengan lzRead.**

Angka minggu adalah perkiraan awal dan harus direvisi setelah P0.

## Testing, audit, dan acceptance criteria

Sebuah fitur dianggap selesai kalau tesnya lulus, buktinya diserahkan, dan klaim publiknya disetujui owner. Kode yang sudah di-merge saja belum cukup.

### Tes wajib

- [ ] Invariant: total supply di semua chain selalu 999M, sebelum dan sesudah graduation.
- [ ] Tidak ada mint selain `_credit` dari endpoint dan peer yang benar.
- [ ] Selama bonding, tidak ada pihak selain Graduator yang bisa memanggil fungsi owner/delegate. Graduator sendiri tidak punya fungsi di luar jalur graduation.
- [ ] `graduate()` gagal sebelum ambang tercapai, dan hanya bisa dijalankan sekali.
- [ ] Graduation gagal di satu chain (DVN atau gas disimulasikan gagal), lalu `retryRemote` berhasil dengan parameter yang sama. Token tidak tampil "Terkunci" sebelum semua chain selesai.
- [ ] Composer: `lzCompose` dari alamat selain endpoint ditolak. Compose dari token yang tidak terdaftar ditolak.
- [ ] Composer: pool dibuat dan diisi dalam satu panggilan. Coba front-run pembuatan pool dan pastikan gagal atau tidak berpengaruh.
- [ ] Composer: perilaku saat `lzCompose` kehabisan gas atau revert terdokumentasi, dan `retryCompose` aman.
- [ ] Factory menolak tier dengan kurang dari 2 DVN wajib atau DVN di luar daftar putih.
- [ ] `renounceOwnership` menolkan delegate lebih dulu.
- [ ] `verify()` mengembalikan `false` kalau owner bukan nol, delegate bukan nol, atau konfigurasi satu pathway berbeda dari tier.
- [ ] XofN Check: hasil untuk token dengan 1-of-1, 2-of-2, dan 3+ cocok dengan pembacaan manual `getConfig`.

### Audit

- Audit eksternal sebelum mainnet untuk `XofNToken`, `XofNCurve`, `XofNGraduator`, `XofNRemote`, dan `XofNRegistry`.
- Graduator dan composer adalah prioritas utama, karena keduanya memegang kendali token selama bonding dan memindahkan likuiditas.
- Laporan audit dipublikasikan di `/proof`.

### Acceptance criteria MVP

- [ ] XofN Check live di mainnet dan bisa membaca OFT di Base, Arbitrum, dan Robinhood Chain.
- [ ] Satu token mainnet melewati graduation penuh: pool di Base, Arbitrum, dan Robinhood Chain dibuat lewat compose. Semua terkunci dengan badge `XofN 2+1/2`.
- [ ] `XofNRegistry.verify(token)` mengembalikan `true` untuk token itu, bisa dipanggil siapa pun di explorer.
- [ ] Bridge dua arah antar ketiga chain sukses, dengan tautan LayerZero Scan.
- [ ] Semua kontrak terverifikasi, semua alamat ada di `/contracts`.

## Aturan klaim publik dan bukti progres

Klaim publik mengikuti status nyata. Karena XofN menjual angka, setiap angka di konten harus bisa dicek siapa pun lewat `verify()` atau XofN Check.

| Klaim | Boleh dipakai kapan |
| --- | --- |
| "Building the launchpad where 1-of-1 is never allowed" | Sekarang |
| "Check any OFT's X-of-N" | Setelah XofN Check live di mainnet |
| "Every XofN token: 2+ DVNs, owner 0, delegate 0" | Setelah graduation mainnet pertama dan `verify()` mengembalikan `true` |
| Statistik ekosistem (misalnya "X% OFT masih 1-of-1") | Hanya dari data XofN Check sendiri, dengan tanggal pengecekan dan metodologi |
| "Token Y is unsafe" | **Tidak pernah.** Tampilkan konfigurasinya saja |
| "Unhackable", "zero risk" | **Tidak pernah** |
| "Partner of LayerZero" / "official" | **Tidak pernah**, kecuali ada perjanjian tertulis |

**Statistik pihak ketiga yang boleh dikutip, dengan sumbernya:** 47% dari sekitar 2.665 aplikasi memakai 1-of-1 saat serangan Kelp (analisis Dune yang dikutip Kelp dan media), serta kerugian Kelp sekitar $292 juta. Jangan menulis "LayerZero tidak aman". Sengketa Kelp vs LayerZero masih berjalan.

**Disclaimer:** *XofN is an independent project built on LayerZero. Not affiliated with or endorsed by LayerZero Labs.* Jangan pakai logo atau nama produk LayerZero di branding.

### Bukti yang wajib diserahkan developer

Setiap milestone diserahkan di folder `proof/YYYY-MM-DD-<milestone>/` dengan `notes.md` berisi tautan dan satu kalimat konteks.

- **Deploy dan launch:** tautan explorer + tier yang tercatat di `XofNRegistry`.
- **Graduation:** tautan tx di setiap chain, tautan LayerZero Scan untuk setiap pesan, plus panggilan `verify()` di explorer yang mengembalikan `true`.
- **XofN Check:** rekaman layar pemeriksaan 3 token (1-of-1, 2+, terkunci) dan perbandingannya dengan pembacaan manual.
- **Fitur UI:** rekaman layar MP4 1080p, 15–60 detik, dimulai dari URL live.

**Dilarang muncul di bukti:** private key, seed phrase, isi `.env`, kredensial RPC, dashboard admin. Pekerjaan yang gagal tetap dilaporkan.

## Open questions

- [ ] DVN apa saja yang tersedia di pathway Base ↔ Arbitrum dan Base ↔ Robinhood Chain, dan apakah tier Fortress (3 operator) bisa dipenuhi di keduanya?
- [ ] Aset pasangan untuk pool di chain ekspansi: native drop executor, stablecoin OFT, atau pool satu sisi? Perlu perbandingan biaya dan risiko.
- [ ] Apa yang terjadi pada token kalau `lzCompose` gagal, dan bagaimana desain `retryCompose` yang aman?
- [ ] Berapa gas `lzReceive` untuk pesan deploy di chain tujuan, dan berapa gas compose untuk membuat pool?
- [ ] Apakah nilai 0 di konfigurasi ULN custom berarti default? (`UlnBase.sol`)
- [ ] Berapa biaya per pesan untuk Standard vs Fortress? Harga DVN tidak dipublikasikan, jadi ukur lewat `quoteSend` di testnet.
- [ ] Berapa gas `verify()` untuk 3 chain? Perlu `verifyEid` per pathway?
- [ ] Parameter bonding curve dan ambang graduation: berapa ETH? Owner yang memutuskan.
- [ ] AMM apa di Base, Arbitrum, dan Robinhood Chain (Uniswap V2/V3/V4)?
- [ ] Apakah Robinhood Chain didukung ReadLib1002 untuk lzRead (P6)?
- [ ] Cek domain, handle X, dan ticker $XOFN.
- [ ] Opini hukum awal (Indonesia, POJK 23/2025) sebelum mainnet publik.

Sumber utama: [OFT quickstart](https://docs.layerzero.network/v2/developers/evm/oft/quickstart), [Composer overview](https://docs.layerzero.network/v2/developers/evm/composer/overview), [OFT composing](https://docs.layerzero.network/v2/developers/evm/oft/composing), [lzRead overview](https://docs.layerzero.network/v2/developers/evm/lzread/overview), [Production DVN Configuration](https://docs.layerzero.network/v2/concepts/modular-security/production-dvn-configuration), [Transaction pricing](https://docs.layerzero.network/v2/concepts/protocol/transaction-pricing).
