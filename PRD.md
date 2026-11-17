# PRD.md — XofN

> **Tujuan dokumen:** mendefinisikan *apa* yang dibangun untuk XofN: produk, kebutuhan, phase, acceptance criteria, dan keputusan yang masih terbuka. *Bagaimana* membangunnya ada di `ARCHITECTURE.md`.
>
> **Sumber kebenaran:**
> - Peran chain, lifecycle dua tahap, fase deploy, dan klaim per tahap → `deployguide-xofn.md` (Deploy Guide v1.0 dari PM, 17 Nov 2026).
> - Aturan protokol, keamanan, dan klaim publik lainnya → `brief-xofn.md` (Developer Brief, 14 Nov 2026).
> - Tampilan → `xofn-coinfall-v8-galaxy.html` (konsep visual V8).
> - Fakta on-chain → `proof/2026-11-17-phase0/` (riset Phase 0).
> - Konflik dicatat di §11, tidak diputuskan diam-diam.
>
> **Label sumber:**
> - **[Brief]** — tertulis di brief
> - **[Guide]** — tertulis di deploy guide
> - **[Desain]** — tampak di HTML konsep
> - **[Phase 0]** — terverifikasi lewat riset Phase 0
> - **[Usulan]** — keputusan teknis dokumen ini, bisa diubah owner
> - **[Belum]** — perlu diverifikasi
>
> **Dokumen terkait:** `CLAUDE.md` (aturan kerja), `ARCHITECTURE.md` (teknis), `DESIGN_SYSTEM.md` (visual), `USER_FLOWS.md` (alur).
>
> **Status repo:** Phase 0 selesai (17 Nov 2026). Belum ada kode produk.

---

## 1. Ringkasan

**XofN** adalah launchpad token omnichain di atas LayerZero V2 yang menjadikan **keamanan lintas chain sebagai standar yang terukur dan bisa dicek siapa pun** [Brief]. Setiap token membawa badge yang menyatakan berapa verifikator (DVN) yang menjaganya, misalnya `XofN 2+1/2`. Konfigurasi 1-of-1 tidak pernah diizinkan.

- **Tagline utama:** *Never one of one.*
- **Tagline sekunder:** *Graduate on proof, not promises.* [Brief]
- **Arti nama:** LayerZero memakai model keamanan *X-of-Y-of-N*. Aplikasi memilih X DVN wajib dan Y dari N DVN opsional. XofN menjadikan angka itu badge [Brief].
- **Cerita:** pada exploit Kelp DAO (April 2026, ±$292 juta), analisis Dune menunjukkan 47% dari ±2.665 aplikasi LayerZero memakai 1-of-1, dan hanya ±5% yang memakai 3-of-3 atau lebih. Pasar belum punya cara mudah untuk mengetahui sebuah token termasuk kelompok mana. XofN menjawabnya dengan satu badge [Brief].
- **Peran chain [Guide]:** **Robinhood Chain = home** (curve, pool pertama, Graduator, Registry). **Base dan Arbitrum = chain ekspansi** saat token diperluas. Brief awal memakai Base sebagai home; bagian brief yang menyebut "Base (home)" dibaca sebagai "Robinhood Chain (home)".

**Tiga pembeda** dari ZeroKnown dan DVNity [Brief]:
1. Tier keamanan dipilih creator dan tampil sebagai badge. Tier yang lebih tinggi lebih mahal per pesan.
2. **XofN Check** bisa membaca OFT mana pun, tidak hanya token XofN. Fitur ini sekaligus alat konten dan distribusi.
3. Konfigurasi **terkunci saat ekspansi**. Token mulai di bonding curve di Robinhood dan lulus secara lokal. Setelah itu, satu alur `expandAndLock` memasang Base dan Arbitrum, menyalurkan likuiditas lewat lzCompose, lalu mengunci semuanya [Guide].

**Nada:** XofN adalah brand paling teknis dari tiga brand. Bahasanya presisi dan berbasis angka, tetapi badge harus tetap mudah dipahami trader biasa [Brief].

---

## 2. Tujuan

### 2.1 Tujuan MVP — tiga hal yang harus terbukti [Brief]
1. Badge tier keamanan **bisa diverifikasi on-chain** lewat `XofNRegistry.verify(token)`.
2. Token **terkunci otomatis saat ekspansi**: owner = 0, delegate = 0, library dan konfigurasi di-pin.
3. Siapa pun bisa **mengecek X-of-N sebuah OFT dalam satu klik** (XofN Check).

### 2.2 Isi MVP [Brief + Guide]
1. Template `XofNToken` (**OFT sejak tahap 1**) dengan supply tetap 999.000.000. Tidak ada mint publik, pajak, blacklist, pause, atau upgrade.
2. Bonding curve di home chain (**Robinhood Chain**), memakai implementation + clone per launch.
3. `XofNGraduator` dengan dua jalur:
   - `graduate()` — graduation lokal di Robinhood;
   - `expandAndLock(token)` — ekspansi + penguncian, dengan `retryRemote(eid)` bila ada chain yang gagal.
4. Dua tier keamanan (Standard, Fortress) plus penolakan 1-of-1.
5. `XofNRegistry` dengan `verify(token)`, ada di setiap chain.
6. XofN Check di `/check/<chain>/<alamat>`.
7. Chain ekspansi: **Base** dan **Arbitrum One**.

### 2.3 Non-goal [Brief]
- Graduation lintas chain dengan **lzRead**. Masuk **Backlog pasca-MVP** (§8.3).
- Verifikasi creator zkTLS (wilayah ZeroKnown).
- Monitor independen ala Oracle Watch (wilayah DVNity). XofN cukup memeriksa ulang konfigurasi secara berkala.
- Shielded pools, **Solana**, HyperEVM, Elysium, integrasi ATLAS/Zero.
- Token **$XOFN**, sampai MVP live di mainnet dan sudah diaudit.
- [Usulan] Fitur AI apa pun. Tidak ada di brief, jadi jangan ditambahkan.

---

## 3. Pengguna

| Pengguna | Kebutuhan | Titik masuk utama |
|---|---|---|
| **Trader** | Mengetahui risiko bridge sebuah token dalam satu detik | Badge di kartu token, `/check`, `/t/[address]` |
| **Creator** | Token bisa pindah lintas chain *setelah* terbukti ada permintaan, bukan sejak hari pertama | `/launch` |
| **Pemanggil graduation / ekspansi** (siapa saja) | Memicu `graduate()` saat ambang tercapai (menerima insentif tetap), atau `expandAndLock(token)` untuk token yang sudah lulus (membayar fee LZ) | Tombol Graduate / Expand & lock di `/t/[address]` |
| **Builder / aggregator / DEX** | Fungsi on-chain `verify(token)` untuk memfilter token | `XofNRegistry` (explorer), `/contracts` |
| **Owner infra** (Safe 2-of-3) | Mengelola label DVN dan daftar putih untuk token **baru**; tidak bisa menyentuh token yang sudah ada [Guide]. Batas klaim ini untuk token yang belum Locked: P38; letak daftar putih: P37 | Di luar UI publik |

---

## 4. Leksikon & aturan bahasa

### 4.1 Istilah produk
| Istilah | Arti | Catatan copy |
|---|---|---|
| **Badge `XofN 2+1/2`** | 2 DVN wajib + 1 dari 2 DVN opsional [Brief] | Selalu tampil bersama status, mis. `XofN 2+1/2 · Bonding` [Guide]. Bisa diklik untuk melihat daftar DVN dan alamat per pathway |
| **Standard** | Tier default, `XofN 2+1/2` | — |
| **Fortress** | Tier tinggi, `XofN 3+1/2`; biaya per pesan lebih tinggi | — |
| **Witness** | Sebutan guide untuk DVN opsional ("2 DVN wajib + 2 Witness") [Guide] | Copy UI tetap memakai "optional DVN" |
| **Bonding** | Belum graduation; owner/delegate = `XofNGraduator` | Warna oranye |
| **Graduated · awaiting expansion** (guide: *Lulus, menunggu ekspansi*) | Sudah lulus graduation lokal: pool ada di Robinhood. Owner/delegate **masih** Graduator; belum terkunci; `verify()` = false | Warna biru. Tier sudah dipilih, tetapi konfigurasi DVN baru dipasang saat ekspansi |
| **Expanding** [Usulan] | `expandAndLock` sedang berjalan; sebagian chain mungkin selesai. Guide tidak punya status ini: guide §9 menyebut token tetap "menunggu ekspansi" sampai semua chain selesai (P25) | Warna biru + progres per chain |
| **Locked** (brief: *Terkunci*) | Owner = 0, delegate = 0, konfigurasi sesuai tier, `verify()` = true di semua chain | Warna mint |
| **Changed** (brief: *Berubah*) | Konfigurasi tidak lagi sesuai tier | Warna merah |
| **1-of-1** | Satu DVN wajib tanpa DVN opsional | Selalu label merah di Check |
| **Graduation** | Peralihan dari curve ke pool di Robinhood (tahap 1) | — |
| **Expansion** | Perluasan ke Base/Arbitrum + penguncian (tahap 2) | — |
| **Pathway** | Pasangan chain (EID) beserta arahnya. Di XofN: Robinhood↔Base dan Robinhood↔Arbitrum (hub) | Konfigurasi dicek di kedua arah |

Copy UI ditulis dalam **bahasa Inggris**. Istilah Indonesia di brief/guide adalah padanannya [Usulan, lihat P25].

### 4.2 Istilah teknis (dipakai di dokumen & kode)
| Istilah | Arti |
|---|---|
| **OFT** | Omnichain Fungible Token (standar LayerZero V2) |
| **DVN** | Decentralized Verifier Network, verifikator pesan |
| **ULN / UlnConfig** | Ultra Light Node: `confirmations`, `requiredDVNs`, `optionalDVNs`, `optionalDVNThreshold` |
| **EID** | Endpoint ID LayerZero per chain (berbeda dari chain ID) |
| **delegate** | Alamat yang boleh mengubah konfigurasi OApp di endpoint |
| **enforced options** | Gas minimum yang dipaksakan untuk `lzReceive` / `lzCompose` |
| **lzCompose** | Pemanggilan lanjutan di chain tujuan setelah token dikreditkan |
| **quoteSend** | Perkiraan fee sebelum `send` |
| **Dead DVN** | Placeholder LayerZero untuk pathway tanpa default aktif. Pesan tidak akan pernah terkirim. Default semua pathway ke/dari Robinhood = Dead DVN [Phase 0] |

### 4.3 Aturan klaim publik [Brief + Guide] — berlaku untuk semua copy UI, OG image, dan konten
| Klaim | Boleh dipakai kapan |
|---|---|
| "Building the launchpad where 1-of-1 is never allowed" | Sekarang |
| "Live on Robinhood Chain", "Built on LayerZero OFT" | Setelah deploy Fase 1b (Phase 6) [Guide] |
| "Check any OFT's X-of-N" | Setelah XofN Check live di mainnet. Guide: dirilis publik di awal Fase 1b |
| "Omnichain" (sebagai klaim live) | **Belum boleh** sebelum Fase 2b. Sebelum itu tampil sebagai rencana berlabel "planned" [Guide] |
| "Every XofN token: 2+ DVNs, owner 0, delegate 0" | Setelah ekspansi mainnet pertama dan `verify()` mengembalikan `true` (Fase 2b) [Guide] |
| Statistik ekosistem ("X% OFT masih 1-of-1") | Hanya dari data XofN Check sendiri, dengan tanggal pengecekan dan metodologi |
| "Token Y is unsafe" | **Tidak pernah.** Tampilkan konfigurasinya saja |
| "Unhackable", "zero risk" | **Tidak pernah** |
| "Partner of LayerZero" / "official" | **Tidak pernah**, kecuali ada perjanjian tertulis |

Aturan tambahan:
- Statistik pihak ketiga yang boleh dikutip: 47% dari ±2.665 aplikasi memakai 1-of-1 saat serangan Kelp, dan kerugian Kelp ±$292 juta. Sumbernya wajib disebut.
- Jangan menulis "LayerZero tidak aman"; sengketa Kelp vs LayerZero masih berjalan.
- **Disclaimer wajib:** *XofN is an independent project built on LayerZero. Not affiliated with or endorsed by LayerZero Labs.*
- Logo dan nama produk LayerZero tidak boleh dipakai di branding.

---

## 5. Mekanisme inti (aturan bisnis — tidak boleh diubah karena alasan visual)

### 5.1 Token [Brief + Guide]
- `XofNToken` adalah **OFT sejak tahap 1**, dengan supply tetap **999.000.000** yang seluruhnya di-mint ke bonding curve di **Robinhood**. Shared decimals **6**.
- Tidak ada `mint` (selain `_credit` dari endpoint dan peer yang benar), `pause`, `setFee`, `blacklist`, atau `upgrade`.
- `renounceOwnership()` di-override agar **menolkan delegate lebih dulu**, untuk menutup celah QUIP-25.
- Invariant: total supply di semua chain selalu 999M, baik sebelum maupun sesudah ekspansi.

### 5.2 Bonding (Robinhood) [Brief + Guide]
- `XofNCurve` di-clone dari satu implementation per launch, dengan parameter tetap: harga awal (`CURVE_START_PRICE`) dan ambang graduation (`GRADUATION_THRESHOLD_ETH`). Nilainya diputuskan owner (P8).
- Selama bonding **dan sampai ekspansi selesai**, owner dan delegate token adalah kontrak `XofNGraduator`, bukan orang.
- Graduator tidak punya fungsi admin untuk mengubah konfigurasi. Satu-satunya jalur adalah graduation dan ekspansi, yang hasilnya sudah ditentukan oleh tier.

### 5.3 Tier keamanan [Brief + Guide; ketersediaan Phase 0]
| Tier | Badge | DVN wajib (brief/guide) | DVN opsional (Witness) |
|---|---|---|---|
| Standard (default) | `XofN 2+1/2` | LayerZero Labs + Google Cloud (atau Polyhedra) | 1 dari 2: Deutsche Telekom MMS / Fidelity (FCAT) |
| Fortress | `XofN 3+1/2` | Labs + Google Cloud + Polyhedra | 1 dari 2: DT MMS / FCAT |
| — | 1/1 | **Ditolak di level kontrak** | — |

- Tier dipilih saat launch dan **tidak bisa diturunkan**. Konfigurasinya baru dipasang saat ekspansi.
- Factory menolak:
  - tier dengan kurang dari 2 DVN wajib;
  - DVN di luar daftar putih;
  - field konfigurasi bernilai 0 (P5).
- Jika satu pathway tidak bisa memenuhi Fortress, Fortress **tidak ditawarkan** untuk chain itu, dan UI menjelaskan alasannya. Fortress **tidak boleh diturunkan diam-diam**; creator memilih Standard atau menunda ekspansi ke chain itu [Guide §9].
- Definisi tier disimpan di `config/tiers.json` [Guide]. Alamat DVN dikunci di constructor Graduator.
- **Ketersediaan per pathway [Phase 0, `proof/2026-11-17-phase0/02-dvn-pathways.md`, `09-addendum-robinhood-home.md`]:**
  - LayerZero Labs, Deutsche Telekom, dan FCAT tersedia di Robinhood, Base, dan Arbitrum, di semua arah.
  - **Google Cloud tidak ada di Robinhood.** Polyhedra **deprecated** di Base dan Arbitrum, dan tidak ada di Robinhood.
  - Karena semua pathway XofN melewati Robinhood (hub), **tabel tier di atas tidak bisa dipenuhi di pathway mana pun**, baik Standard maupun Fortress.
  - Tiga belas operator lain tersedia dan aktif di ketiga chain. Pemilihan operator wajib pengganti (X untuk Standard, Y untuk Fortress) adalah **keputusan owner/PM (P1)**. Tabel di atas **tidak diubah** sampai diputuskan.

### 5.4 Graduation & ekspansi — urutan wajib [Brief + Guide]

**Tahap 1 — `graduate()` (lokal di Robinhood)**
1. Curve mencapai ambang. **Siapa pun** bisa memanggil `graduate()`, dan pemanggil menerima insentif kecil yang tetap (`GRADUATE_CALLER_REWARD`, P15).
2. Graduator membuat pool di Robinhood dengan likuiditas dari curve. Porsi token untuk likuiditas ekspansi disisihkan (P16).
3. Token berstatus **Graduated · awaiting expansion**:
   - owner dan delegate **tetap Graduator**;
   - **tidak ada** `setDelegate(0)` maupun `renounceOwnership()` [Guide aturan #3];
   - `verify()` = false.

Catatan tahap 1: `graduate()` gagal sebelum ambang tercapai, dan hanya bisa dijalankan sekali.

**Tahap 2 — `expandAndLock(token)` (Robinhood → Base, Arbitrum)**
1. Dipanggil dari UI untuk token yang sudah Graduated. Pemanggil membayar biaya hasil `quoteSend` [Guide]. Siapa yang boleh memanggil dan kapan: P31.
2. Untuk setiap chain ekspansi yang dipilih creator saat launch:
   1. Graduator mengirim pesan deploy ke `XofNRemote`, yang men-deploy `XofNToken`. Guide §7.3 meminta alamat yang sama dengan di Robinhood (P39).
   2. Graduator memanggil `send` + `composeMsg` berisi porsi token likuiditas. `XofNRemote` membuat **dan** mengisi pool dalam satu panggilan `lzCompose`.
   3. Resep immutable sesuai tier dipasang di kedua arah: library eksplisit, ULN config (alamat DVN terurut naik), executor config, enforced options (gas `lzReceive` **dan** `lzCompose`), lalu peer.
3. Setelah semua chain terkonfirmasi: verifikasi on-chain (versi pra-kunci; revert bila tidak sesuai), lalu `setDelegate(address(0))` dan `renounceOwnership()` di setiap chain.
4. `XofNRegistry` mencatat token sebagai **Locked** dengan tier final.

Catatan tahap 2:
- **Langkah lintas chain tidak atomik.** Jika satu chain gagal, ulangi lewat `retryRemote(eid)`, yang hanya bisa mengulang langkah yang sama dengan parameter yang sama. Token tetap "awaiting expansion" atau "Expanding" sampai semua chain selesai, dan **tidak boleh tampil Locked** sebelum itu.
- **Urutan 2.ii sebelum 2.iii tidak bisa dijalankan** [Phase 0]: `send` revert `NoPeer` tanpa peer, dan default pathway Robinhood adalah Dead DVN. Rekomendasi developer: resep (2.iii) dipasang sebelum likuiditas dikirim (2.ii). Ini butuh keputusan owner/PM (**P28**), karena urutan di atas adalah aturan dari brief/guide.

### 5.5 Composer (`XofNRemote.lzCompose`) [Brief + Guide]
- Hanya menerima panggilan dari endpoint LayerZero, dan hanya untuk `XofNToken` yang terdaftar sebagai sumber.
- Pembuatan pool **dan** penambahan likuiditas terjadi dalam satu panggilan `lzCompose`, untuk mencegah manipulasi harga awal.
- Enforced options wajib mengisi gas untuk `lzReceive` **dan** `lzCompose`.
- **Perilaku saat compose gagal (P3).** Jawaban awal dari source [Phase 0]: token sudah berada di composer, dan compose bisa dijalankan ulang oleh siapa pun. Pembuktian lewat tes tetap [Belum] sampai Phase 3.
- **Jangan pernah membuat pool manual dari wallet tim** bila compose gagal. Gunakan `retryCompose` sesuai desain yang sudah diaudit [Guide §9].
- Aset pasangan untuk pool di chain ekspansi belum ditentukan (P2).

### 5.6 `XofNRegistry.verify(token)` [Brief + Guide]
- View function on-chain yang bisa dipanggil kontrak lain. **Registry ada di setiap chain** (Robinhood, Base, Arbitrum) [Guide §7.1].
- Pemeriksaan:
  - `owner()` dan `endpoint.delegates(token)` keduanya harus `address(0)`;
  - library bukan default;
  - konfigurasi `endpoint.getConfig` untuk setiap EID terdaftar dibandingkan dengan hash tier yang tersimpan.
- Mengembalikan `(bool locked, uint8 tier, uint32[] eids)`. Di Robinhood, setelah ekspansi, hasilnya `true, tier, [EID Base, EID Arbitrum]` [Guide §7.4].
- Selama token belum terkunci (Bonding/Graduated/Expanding), `verify()` **wajib** `false`.
- Sediakan juga `verifyEid(token, eid)` (P7).
- **Status global Locked** = `verify` true di Registry **setiap** chain, dibaca indexer/UI (P13).
- Bila `verify()` = false untuk token yang tercatat terkunci, itu insiden serius: badge otomatis merah (Changed), umumkan, investigasi [Guide §9].

### 5.7 XofN Check [Brief]
- **Input:** chain + alamat token. Discovery utama lewat `peers(eid)`; OFT API LayerZero hanya pelengkap, dan tidak memuat Robinhood [Phase 0].
- **Output per pathway:**
  - jumlah DVN wajib dan opsional, beserta threshold;
  - nama operator, bila ada di `config/dvn-labels.json`;
  - owner dan delegate.
- **Label otomatis:** "1-of-1" merah, "2+" kuning, "2+ dan terkunci" hijau.
- Hasil di-cache dan **selalu** menampilkan "checked at <time>".
- **Aturan konten:**
  - XofN Check menampilkan fakta, bukan tuduhan;
  - bila hasil Check salah, perbaiki, tampilkan koreksi dengan waktu pengecekan baru, dan kabari tim token terkait [Guide §9].

### 5.8 Bridge [Brief]
- `quoteSend` dipanggil tepat sebelum `send`.
- Jumlah di bawah **0,000001** token (sisa pembulatan shared decimals 6) tetap tinggal di wallet pengirim, dan UI menjelaskannya.
- Hanya tersedia setelah token **Locked**. Rute: Robinhood ↔ Base dan Robinhood ↔ Arbitrum. Base ↔ Arbitrum harus lewat Robinhood (hub).

### 5.9 Prinsip transaksi [Brief]
- Semua transaksi disusun di browser dan ditandatangani di wallet pengguna. **Server tidak pernah memegang key.**
- Server hanya mengindeks event dan menyajikan data untuk Check dan halaman token.

---

## 6. Kebutuhan fungsional per route

Semua route berikut wajib ada [Brief]. Selama kontrak belum ter-deploy, semua halaman aplikasi berjalan dalam **mode preview/demo** dengan label jelas (§7, `ARCHITECTURE.md` §10.4).

### 6.1 `/` — Landing + discovery
- **[Desain]** Port penuh landing HTML V8. Urutan section ada di `DESIGN_SYSTEM.md` §6. Copy yang menyebut Base sebagai home diganti ke Robinhood (D15).
- **[Brief]** Menampilkan token dalam bonding (progres ke graduation), token yang menunggu ekspansi, dan token terkunci, semuanya dengan badge tier + status.
- Filter All / Bonding / Graduated / Locked.
- Sebelum ada token nyata, isi grid adalah contoh fiktif berlabel "FICTIONAL" / "DEMO" [Desain].

### 6.2 `/launch` — Buat token
- **Form:**
  - nama (≤32) dan ticker (2–12 alfanumerik);
  - gambar (validasi tipe dan ukuran ≤3 MB [Desain]);
  - pilihan tier Standard / Fortress;
  - chain ekspansi Base / Arbitrum, minimal satu (diterapkan saat ekspansi);
  - supply tampil sebagai "999,000,000 FIXED · ROBINHOOD".
- Menampilkan perbedaan biaya per pesan antara Standard dan Fortress. Angkanya dari `quoteSend`; sebelum tersedia, tampil "NOT QUOTED" [Desain].
- Fortress dinonaktifkan per chain bila pathway tidak memenuhi syarat, beserta alasannya.
- Satu tanda tangan di **Robinhood**. Setelah sukses, redirect ke `/t/[address]` dengan status Bonding.
- Penyimpanan gambar/metadata [Belum] (P26).

### 6.3 `/t/[address]` — Halaman token
- Trading di curve (sebelum graduation) atau di pool Robinhood (sesudahnya): Buy/Sell, jumlah, slippage, dan quote.
- Badge + status (Bonding / Graduated · awaiting expansion / Expanding / Locked / Changed), daftar DVN per pathway, supply per chain, dan hasil `verify()` live.
- **Panel graduation** (tahap 1): progres ke ambang, lalu tombol Graduate saat ambang tercapai.
- **Panel ekspansi** (tahap 2):
  - tombol Expand & lock untuk token yang sudah Graduated, dengan quote biaya;
  - progres per chain;
  - Retry per chain bila ada langkah yang gagal.
- Tautan explorer dan LayerZero Scan untuk setiap pesan.

### 6.4 `/check` dan `/check/[chain]/[address]` — XofN Check
- `/check`: input alamat + pemilih chain (Robinhood, Base, Arbitrum), ditambah contoh (sample) yang jelas berlabel simulasi [Desain].
- `/check/[chain]/[address]`: hasil per pathway, label warna, owner/delegate, dan "checked at".
- Tombol **Share** menghasilkan gambar kartu (OG image) untuk X.
- Alamat tidak valid → error validasi. RPC gagal → error yang jujur, **tanpa** hasil palsu.
- Token XofN dan non-XofN diperlakukan sama. Untuk token XofN, Check menambahkan status lifecycle dan hasil `verify()`.

### 6.5 `/bridge`
- Pilih chain asal/tujuan dan jumlah. Ringkasan menampilkan fee (quote), penerimaan, dan dust.
- Ditandatangani di wallet. Setelah kirim, tampil tautan LayerZero Scan.
- Diblokir untuk token yang belum Locked.

### 6.6 `/contracts` dan `/proof`
- `/contracts`:
  - alamat semua kontrak per chain dari manifest `deployments/<network>.json`, beserta status (Planned / Deployed / Verified);
  - sebelum deploy: "Not published" [Desain].
- `/proof`:
  - checklist invariant `verify()`, milestone (fase deploy guide), dan tautan bukti dari folder `proof/`;
  - laporan audit (setelah ada).

---

## 7. Kebutuhan nonfungsional

| Area | Kebutuhan |
|---|---|
| **Transparansi** | Setiap data on-chain menampilkan sumber dan waktu baca. Data demo/simulasi selalu berlabel (`DEMO`, `*`, `NOT LIVE`). Status "Locked" tidak boleh dikarang |
| **Keamanan** | Tidak ada key di server untuk aksi pengguna. Otorisasi tidak boleh dilakukan di `proxy.ts`. Input pengguna di-escape. Env hanya dibaca lewat modul env (`ARCHITECTURE.md` §12) |
| **Performa** | LCP landing < 2,5 dtk di desktop. Three.js dimuat lazy. Ada quality governor WebGL. Mobile memakai scene yang lebih ringan atau fallback |
| **Aksesibilitas** | Navigasi keyboard penuh, fokus terlihat, ARIA untuk dialog/radiogroup/tabs, `aria-live` untuk hasil Check, kontras AA, semua animasi menghormati `prefers-reduced-motion` |
| **Responsif** | Tidak ada overflow horizontal di 360–390px. Navigasi mobile wajib ada |
| **Ketahanan** | Ekspansi bisa di-retry per chain. UI tetap benar walau ada chain yang tertunda |
| **Bahasa** | Copy UI bahasa Inggris. Dokumentasi dan komentar kode bahasa Indonesia |
| **Bukti** | Setiap phase menghasilkan folder `proof/YYYY-MM-DD-<milestone>/notes.md` (`CLAUDE.md` §11) |

---

## 8. Scope & roadmap phase

### 8.1 Tabel phase
Phase **6 dan 7 (deploy) FROZEN total**: tidak dikerjakan sampai PM memberi perintah mulai. Isinya diambil dari `deployguide-xofn.md` sebagai referensi.

| Phase | Fokus | Gerbang keluar | Status |
|---|---|---|---|
| **0** | Verifikasi riset (brief P0, guide §4): EID, DVN per pathway, semantik ULN, AMM, aset pasangan, paket, CreateX, lzRead. Hanya membaca docs/chain, **tanpa transaksi** | Tabel DVN per pathway dan rekomendasi P1–P9 terisi | Selesai 17 Nov 2026 + addendum home Robinhood (`proof/2026-11-17-phase0/09-addendum-robinhood-home.md`); **menunggu persetujuan gerbang** |
| **1** | Fondasi repo (Next 16 di root dengan `src/`, Tailwind v4, env module, lint/test; ESLint/tsconfig mengabaikan `contracts/`, `test/`, `script/`, yang baru dibuat di Phase 3) + port landing HTML (mode preview, label NOT LIVE) | lint/typecheck/test/build lulus; landing setara HTML di 390/768/1280/1680; reduced motion OK | Selesai 17 Nov 2026; **menunggu persetujuan gerbang** (`proof/2026-11-17-phase1/notes.md`) |
| **2** | XofN Check (brief P1): reader `getConfig` + `peers(eid)` + cache Supabase + kartu share. **Hanya membaca** OFT yang sudah ada di Robinhood, Base, Arbitrum | Hasil Check untuk 20 OFT populer cocok dengan pembacaan manual `getConfig` | Selesai 17 Nov 2026; **menunggu persetujuan gerbang** (`proof/2026-11-17-phase2/notes.md`) |
| **3** | Kontrak, **lokal saja**. **3a (tahap 1):** Token OFT, Curve impl + clone, Graduator `graduate()`, Registry. **3b (tahap 2):** Remote, `expandAndLock`, composer, `retryRemote`, multi-endpoint TestHelperOz5 | Semua tes wajib §9.2 lulus lokal | Belum mulai |
| **4** | Integrasi frontend: `/launch`, `/t/[address]` (graduate + expand), `/bridge`, `/contracts`, `/proof` terhadap Anvil lokal / mode simulasi. Flow tahap 1 lebih dulu | Semua flow di `USER_FLOWS.md` jalan end-to-end di lokal | Belum mulai |
| **5** | Hardening & paket audit: review internal, `forge test --profile ci`, NatSpec, threat model. Fokus audit: Graduator, curve, registry, composer, `expandAndLock` [Guide] | Tidak ada temuan critical/high internal yang terbuka; paket audit siap | Belum mulai |
| **6** | **Deploy Fase 1** [Guide §5–6]: **1a** Robinhood testnet (core + smoke test + Safe) → audit eksternal → **1b** Robinhood mainnet (XofN Check publik lebih dulu, launch terbatas, graduation lokal) | Gerbang guide 1a→1b dan 1b→2a | **FROZEN total** |
| **7** | **Deploy Fase 2** [Guide §7–8]: **2a** omnichain testnet (Remote di Base Sepolia/Arb Sepolia, wire, ekspansi satu token) → audit tambahan → **2b** omnichain mainnet | Gerbang guide 2a→2b; acceptance §9.4 | **FROZEN total** |

### 8.2 Pemetaan milestone brief/guide → phase
| Milestone | Phase di dokumen ini | Catatan |
|---|---|---|
| Brief P0 / Guide §4 Verifikasi | 0 | Riset read-only. Metode `lz:oapp:config:get:default` dari guide masih menjadi tugas pelengkap |
| Brief P1 XofN Check | 2 (bangun) + 6/1b (rilis publik) | Rilis publik termasuk deploy aplikasi, jadi frozen |
| Brief P2–P3 Token/curve/Graduator/Registry | 3a/3b (lokal) | Deploy-nya di Phase 6–7 |
| Brief P4 Audit | 5 (persiapan) + 6 (audit sebelum 1b) + 7 (audit tambahan composer & `expandAndLock` sebelum 2b) | — |
| Guide 1a / 1b | 6 | Frozen |
| Guide 2a / 2b | 7 | Frozen |
| Brief P6 lzRead | Backlog | §8.3 |

Angka minggu di brief adalah perkiraan awal dan harus direvisi setelah Phase 0 [Brief].

### 8.3 Backlog pasca-MVP (tanpa nomor phase)
- Graduation lintas chain dengan **lzRead** (`lzMap` / `lzReduce`), "XofN Score" per token, pemicu ekspansi ke chain lain. Robinhood **tidak** punya ReadLib1002 (P10) [Phase 0], jadi fitur ini harus menunggu atau dijalankan dari chain lain yang didukung [Guide §4.4].
- Statistik ekosistem dari data Check sendiri (dengan metodologi).

---

## 9. Acceptance criteria

### 9.1 Per phase (yang aktif)
**Phase 0**
- [x] Untuk setiap pathway terdapat tabel DVN (Labs, Google Cloud, Polyhedra, DT MMS, FCAT), masing-masing tersedia atau tidak, beserta alamatnya — `proof/2026-11-17-phase0/02-dvn-pathways.md`. Pathway Robinhood↔Base dan Robinhood↔Arbitrum ikut tercakup (`09-addendum-robinhood-home.md`).
- [x] EID mainnet/testnet ketiga chain terkonfirmasi (`ARCHITECTURE.md` §4) — `01-chains-eid.md`.
- [x] Ada rekomendasi untuk P1–P9 dan P13 — `08-recommendations.md`. Catatan: P4 dan P7 baru terukur di Phase 3, P6 hanya estimasi fee DVN, P8 milik owner.
- [x] Default config mainnet (guide §4.2 metode 2): default library, ULN, dan executor keenam arah sudah dibaca lewat `cast call`, setara dengan `lz:oapp:config:get:default` — `02-dvn-pathways.md`, `raw/chains-defaults.txt`, `raw/executor.txt`.
- [x] Pelengkap guide §4.2: default config **testnet** (Robinhood testnet ↔ Base Sepolia / Arbitrum Sepolia) dan `dstConfig` DVN testnet, lewat `cast call` — `proof/2026-11-17-phase0-addendum/notes.md` §1–2. Default testnet = 1 DVN LayerZero Labs (bukan Dead DVN); native drop dari Robinhood testnet = 0.
- [x] Pelengkap guide §4.2 metode 3: contoh pesan terkirim di pathway Robinhood↔Base / Robinhood↔Arbitrum lewat API LayerZero Scan — `notes.md` §4. 36 OApp Robinhood ber-peer ke Base, 16 ke Arbitrum. Situs web Scan tetap 429.
- [x] Pelengkap P2: USDG / USDT0 / USDe beserta peer ke/dari Robinhood — `notes.md` §3. Tidak ada yang punya rute OFT langsung Robinhood→Base/Arbitrum; semuanya lewat Ethereum.
- Gerbang "Standard tersedia di semua pathway" **belum lolos** sampai owner/PM memilih operator wajib pengganti (P1).

**Phase 1**
- [x] Landing menampilkan semua section HTML dengan visual setara, dan 3D berjalan beserta fallback-nya. — `proof/2026-11-17-phase1/notes.md`
- [x] Copy home chain = Robinhood (D15). Panel review "coin-lab" tidak ikut di-port (D1).
- [x] Semua data demo berlabel. Disclaimer LayerZero ada di footer. Klaim "omnichain" tampil sebagai rencana.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` lulus.
- [x] Tidak ada overflow di 360px. Reduced motion mematikan Lenis dan koreografi scroll.
- [x] Tidak ada kebocoran WebGL saat navigasi bolak-balik: teruji di Phase 2 (empat putaran landing ↔ `/check`; konteks hidup tidak pernah lebih dari tiga). — `proof/2026-11-17-phase2/notes.md`

**Phase 2**
- [x] `/check/[chain]/[address]` membaca OFT nyata di Robinhood, Base, dan Arbitrum. — `proof/2026-11-17-phase2/notes.md`
- [x] Hasil untuk 20 OFT populer cocok dengan pembacaan manual: 24 OFT, 33 pathway, semuanya cocok. — `proof/2026-11-17-phase2/raw/gate-20-oft.md`
- [ ] Contoh 1-of-1, 2+, dan 2+ terkunci tampil dengan label benar; pathway Dead DVN berlabel "blocked". **Sebagian:** 1-of-1 dan 2+ terbukti dengan contoh nyata. Contoh nyata "2+ terkunci" dan "blocked" tidak ditemukan di set tiga chain; keduanya hanya terbukti lewat tes unit.
- [x] Hasil Check untuk token 1-of-1, 2-of-2, dan 3+ cocok dengan pembacaan manual `getConfig` [Brief, tes wajib].
- [x] Ada "checked at" dan cache. Error RPC tidak memalsukan hasil. Catatan: yang teruji adalah cache memori; cache Supabase belum pernah dijalankan terhadap Postgres nyata (tidak ada Docker di mesin dev).
- [x] Kartu share (OG image) bekerja.

**Phase 3**
- [ ] 3a dan 3b: semua tes wajib §9.2 lulus dengan `forge test`, termasuk `--match-contract Invariant`.
- [ ] Hanya ada script deploy untuk Anvil lokal (`script/local/*`).

**Phase 4**
- [ ] Flow A–I di `USER_FLOWS.md` berjalan end-to-end terhadap Anvil lokal / simulasi.

**Phase 5**
- [ ] `forge test --profile ci` lulus. Paket audit (scope, threat model, NatSpec) siap.

### 9.2 Tes wajib kontrak [Brief + Guide §5.1, §7.5]
**Tahap 1 (3a)**
- [ ] Supply 999M di curve; invariant total supply di semua chain selalu 999M, sebelum dan sesudah ekspansi.
- [ ] Tidak ada mint selain `_credit` dari endpoint dan peer yang benar.
- [ ] Selama bonding dan sampai ekspansi, tidak ada pihak selain Graduator yang bisa memanggil fungsi owner/delegate token. Graduator tidak punya fungsi di luar jalur graduation dan ekspansi.
- [ ] `graduate()` gagal sebelum ambang tercapai, dan hanya bisa dijalankan sekali.
- [ ] Setelah `graduate()`: owner dan delegate token **masih** Graduator (tidak ada renounce di tahap 1).
- [ ] `XofNRegistry.verify(token)` mengembalikan `false` selama token belum terkunci.
- [ ] Factory menolak tier dengan kurang dari 2 DVN wajib, DVN di luar daftar putih, atau field konfigurasi 0.
- [ ] `renounceOwnership` menolkan delegate lebih dulu.

**Tahap 2 (3b, dengan mock endpoint / TestHelperOz5)**
- [ ] Ekspansi gagal di satu chain (DVN atau gas disimulasikan gagal), lalu `retryRemote` berhasil dengan parameter yang sama. Token tidak tampil Locked sebelum semua chain selesai.
- [ ] Composer: `lzCompose` dari alamat selain endpoint ditolak. Compose dari token yang tidak terdaftar ditolak.
- [ ] Composer: pool dibuat dan diisi dalam satu panggilan; upaya front-run gagal atau tidak berpengaruh.
- [ ] Composer: perilaku saat `lzCompose` kehabisan gas atau revert terdokumentasi, dan `retryCompose` aman.
- [ ] Setelah ekspansi: owner = 0, delegate = 0, library bukan default, ULN sesuai tier (Standard `requiredDVNCount = 2`, Fortress `3`, `optionalDVNCount = 2`, `optionalDVNThreshold = 1`), peer terpasang, di setiap chain [Guide §7.4].
- [ ] `verify()` mengembalikan `false` jika owner ≠ 0, delegate ≠ 0, atau konfigurasi satu pathway berbeda dari tier; `true` setelah ekspansi lengkap.

Tes wajib brief "XofN Check cocok dengan pembacaan manual `getConfig`" adalah tes aplikasi, jadi dicatat di acceptance Phase 2 (§9.1).

### 9.3 Gerbang deploy Fase 1 [Guide] — **Phase 6, FROZEN**
Dicatat sebagai referensi saja.
- 1a → 1b: semua tes lulus, smoke test testnet lulus, audit eksternal selesai (Graduator, curve, registry, composer), tanpa temuan critical/high terbuka.
- 1b → 2a: P0 guide 4.2 dan 4.3 selesai dengan keputusan owner soal aset pasangan, dan minimal satu token mainnet lulus graduation lokal tanpa insiden.

### 9.4 Acceptance criteria MVP mainnet [Brief + Guide] — **Phase 7, FROZEN**
Dicatat sebagai referensi saja.
- [ ] 2a → 2b: guide §7.3–7.5 lulus di testnet; audit tambahan composer dan `expandAndLock` selesai.
- [ ] XofN Check live di mainnet dan bisa membaca OFT di Robinhood, Base, dan Arbitrum.
- [ ] Satu token mainnet melewati graduation lokal + ekspansi penuh: pool di Robinhood, Base, dan Arbitrum, semua terkunci dengan badge `XofN 2+1/2`.
- [ ] `XofNRegistry.verify(token)` mengembalikan `true` dan bisa dipanggil siapa pun di explorer.
- [ ] Bridge Robinhood↔Base dan Robinhood↔Arbitrum dua arah sukses, dengan tautan LayerZero Scan; total supply tetap 999M.
- [ ] Semua kontrak terverifikasi, dan semua alamat ada di `/contracts`.
- [ ] Laporan audit dipublikasikan di `/proof`, tanpa temuan critical/high yang terbuka.

---

## 10. Risiko & dependensi

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R1 | Selama bonding **dan selama menunggu ekspansi**, keamanan token bergantung pada kode `XofNGraduator` [Brief + Guide] | Kritis | Graduator tidak upgradeable, tanpa fungsi admin; audit sebelum 1b |
| R2 | Setelah terkunci, chain tidak bisa ditambah, dan pathway bisa macet bila DVN yang di-pin pensiun (contoh: Nethermind keluar 19 Agustus 2026) [Brief] | Tinggi | Pilih DVN stabil, hindari yang deprecated (Polyhedra, BitGo di Robinhood); tampilkan status Changed/terganggu di Check |
| R3 | Gas `lzCompose` kurang sehingga token sampai tetapi pool tidak dibuat [Brief] | Tinggi | Enforced options untuk compose; `retryCompose` |
| R4 | Langkah ekspansi lintas chain tidak atomik [Brief] | Sedang | `retryRemote(eid)` idempoten; UI per chain |
| R5 | Operator wajib di brief/guide (Google, Polyhedra) tidak tersedia di pathway Robinhood [Phase 0] | **Tinggi** (memblokir tier) | Kontrak Phase 3 dibangun dengan DVN mock dan membaca `config/tiers.json`; keputusan P1 dibutuhkan sebelum Phase 5 (P36) |
| R6 | Arti nilai 0 di ULN custom = default [Phase 0] | Tinggi | Konfigurasi eksplisit; factory menolak field 0 |
| R7 | `verify()` tidak bisa membaca state chain lain secara langsung | Tinggi | Registry di setiap chain (P13) |
| R8 | Biaya dan rate limit RPC / OFT API untuk Check; RPC publik Robinhood dibatasi | Sedang | Cache Supabase, re-check terjadwal, provider berbayar untuk produksi (P21) |
| R9 | Hukum: POJK 23/2025 sebelum mainnet publik [Brief] | Tinggi | Opini hukum awal (P12) sebelum Phase 6/1b |
| R10 | DNS ISP (Telkomsel) memblokir `*.robinhood.com` di lingkungan dev | Rendah | Pakai DNS/VPN lain |
| R11 | Beban 3D di perangkat lemah | Sedang | Quality governor, fallback, scene mobile ringan (`DESIGN_SYSTEM.md` §8) |
| R12 | Tier dengan DT/FCAT tidak bisa direplikasi di testnet: dari lima operator brief hanya Labs yang ada di sana. Empat operator (Labs, Paxos, Twinstake, Horizen) ada di ketiga testnet, cukup untuk Standard tetapi tidak untuk Fortress [Phase 0] | Sedang | Keputusan tier testnet (P32) sebelum Phase 6/1a |
| R13 | Arah chain ditentukan dari chat PM yang merujuk post X LayerZero, yang isinya belum terbaca | Sedang | Konfirmasi ke PM (P35) |

**Dependensi eksternal:** endpoint LayerZero V2 di ketiga chain, DVN pihak ketiga, OFT API LayerZero, RPC per chain, AMM per chain (P9), Supabase, WalletConnect/Reown project ID, CreateX.

---

## 11. Keputusan terbuka & konflik

Jangan memutuskan item berikut diam-diam. Ikuti rekomendasi yang tertulis, atau tanyakan ke owner/PM.

| # | Topik | Fakta | Rekomendasi / pemilik keputusan |
|---|---|---|---|
| P1 | Operator DVN per pathway; apakah Standard/Fortress bisa dipenuhi | **[Phase 0]** Labs, DT, FCAT ada di ketiga chain. Google tidak ada di Robinhood. Polyhedra deprecated di Base/Arbitrum dan tidak ada di Robinhood. Dengan Robinhood sebagai hub, `tiers.json` di guide tidak terpenuhi di pathway mana pun. 13 operator alternatif tersedia di ketiganya (`02-dvn-pathways.md`, `09-addendum-robinhood-home.md`) | **Owner/PM:** pilih operator wajib X (slot ke-2, Standard) dan Y (slot ke-3, Fortress). Rekomendasi developer: tier didefinisikan lewat jumlah; opsional tetap DT + FCAT; Polyhedra tidak dipakai; operator seragam di kedua pathway (karena sama-sama lewat Robinhood). Phase 3 bisa jalan dengan DVN mock. **Catatan:** kriteria guide §4.2 berbasis jumlah (2 atau 3 DVN wajib dari operator berbeda + 2 Witness) **terpenuhi** di mainnet untuk kedua tier; yang tidak terpenuhi hanya nama operator di `tiers.json` guide. Pathway infrastruktur Fortress (guide §7.2) ikut bergantung pada keputusan ini |
| P2 | Aset pasangan pool di chain ekspansi | Opsi [Brief/Guide]: native drop executor, stablecoin OFT (guide: USDG atau USDT0), pool satu sisi. **[Phase 0]** batas native drop dari home Robinhood: **Robinhood → Base 0,05 ETH** dan **Robinhood → Arbitrum 0,24 ETH** per pesan (`raw/executor.txt`). USDe satu-satunya stablecoin yang tercatat sebagai OFT di ketiga chain. USDG ada di Robinhood dan Arbitrum, tidak tercatat di Base. USDT0 tidak ada di Robinhood. Pool satu sisi hanya di Uniswap v3/v4 (`04-amm-pair-asset.md`). **[Pelengkap Phase 0, `proof/2026-11-17-phase0-addendum/notes.md`]** USDe, USDG, dan USDT0 tidak punya peer OFT langsung Robinhood↔Base/Arbitrum: USDe dan USDG hanya ber-peer ke Ethereum, jadi rutenya dua pesan lewat Ethereum. Native drop dari Robinhood **testnet** dibatasi 0, jadi opsi itu tidak bisa diuji di Fase 2a | **Owner** (guide: keputusan akhir di owner). Rekomendasi developer: native drop + Uniswap v2 hanya bila likuiditas pasangan ke Base ≤ ±0,05 ETH (ke Arbitrum ≤ ±0,2 ETH); selain itu pool satu sisi Uniswap v3. Cek ulang USDG/USDT0 (tugas pelengkap Phase 0) |
| P3 | Nasib token jika `lzCompose` gagal; desain `retryCompose` | **Jawaban awal [Phase 0]:** token sudah dikreditkan ke composer sebelum compose; compose yang gagal tersimpan di endpoint dan bisa dijalankan ulang oleh siapa pun, tanpa kedaluwarsa (`03-uln-semantics.md` §7) | Diuji di Phase 3b; jalur keluar untuk kegagalan permanen dirancang di Phase 3b |
| P4 | Gas `lzReceive` pesan deploy dan gas compose pembuatan pool | Belum diukur. `lzReceiveBaseGas`/`lzComposeBaseGas` executor dari home: Robinhood → Base = 85 000; Robinhood → Arbitrum = 1 [Phase 0, `raw/executor.txt`] | Ukur di Phase 3b (lokal); validasi testnet di Phase 7/2a |
| P5 | Apakah nilai 0 di ULN custom berarti default? | **[Phase 0] Ya.** 0 = default untuk konfirmasi, jumlah DVN wajib, jumlah DVN opsional, dan executor config; nol sebenarnya ditulis `type(uint64).max` / `255` | **Terselesaikan:** konfigurasi selalu eksplisit; factory menolak field 0 |
| P6 | Biaya per pesan Standard vs Fortress | Harga DVN tidak dipublikasikan. **[Phase 0]** estimasi `DVN.getFee` (bukan quote): porsi DVN Fortress ±25% di atas Standard bila operator tambahan sekelas | UI menampilkan "NOT QUOTED" sampai ada quote nyata (Phase 7/2a). Estimasi hanya untuk perencanaan internal |
| P7 | Gas `verify()`; perlu `verifyEid`? | **[Phase 0]** ±8 panggilan view eksternal per EID; `receiveLibraryTimeout` perlu ikut diperiksa | Ukur di Phase 3; sediakan `verifyEid` [Usulan] |
| P8 | Parameter bonding curve & ambang graduation (ETH) | Owner yang memutuskan [Brief]. Env: `CURVE_START_PRICE`, `GRADUATION_THRESHOLD_ETH` [Guide] | Owner |
| P9 | AMM per chain | **[Phase 0]** Uniswap v2, v3, dan v4 ada di Robinhood, Base, dan Arbitrum | **Owner.** Rekomendasi developer: satu versi yang sama di ketiga chain; v2 bila P2 = native drop, v3 bila P2 = satu sisi |
| P10 | Robinhood didukung ReadLib1002 (lzRead)? | **[Phase 0]** Tidak (mainnet maupun testnet) | Backlog; lzRead menunggu atau dijalankan dari chain lain [Guide §4.4] |
| P11 | Domain, handle X, ticker $XOFN | [Brief] | Owner |
| P12 | Opini hukum (Indonesia, POJK 23/2025) | [Brief] | Owner, sebelum Phase 6/1b |
| P13 | Bagaimana status kunci di chain lain dibuktikan | **[Phase 0]** lzRead tidak tersedia di Robinhood; Registry hanya bisa membaca endpoint chain-nya sendiri. **[Guide §7.1]** `XofNRegistry` lokal di setiap chain ekspansi | **Terselesaikan (guide):** Registry di setiap chain + `verifyEid` lokal; status global = gabungan pembacaan semua Registry oleh indexer/UI. `/proof` dan NatSpec menjelaskannya dengan jujur |
| P14 | Siapa yang membayar fee LZ untuk `retryRemote` | Belum diatur | [Usulan] Siapa pun boleh memanggil retry dan membayar fee sendiri; parameter tetap |
| P15 | Besaran insentif pemanggil `graduate()` | "Kecil dan tetap" [Brief]; env `GRADUATE_CALLER_REWARD` [Guide] | Owner |
| P16 | Pembagian 999M: porsi curve, pool Robinhood, dan porsi likuiditas per chain ekspansi | Tidak dirinci di brief/guide | Owner, bersama P8 |
| P17 | Fee trading di curve | Brief hanya melarang pajak token; fee curve tidak disebut | Owner. Default [Usulan]: tidak ada fee sampai diputuskan |
| P18 | DVN wajib kedua: tetap per pathway, atau creator memilih? | **[Phase 0]** Google tidak ada di Robinhood dan Polyhedra deprecated | [Usulan] Ditentukan oleh `config/tiers.json` (bukan pilihan creator); badge tetap `2+1/2`. Ikut P1 |
| P19 | Chain yang dibaca XofN Check di MVP | Robinhood, Base, Arbitrum [Guide] | [Usulan] Tiga chain itu dulu; pathway ke chain lain tampil "not read" |
| P20 | Frekuensi re-check untuk mendeteksi status Changed | "Secara berkala" [Brief] | [Usulan] Token XofN tiap 6 jam, hasil Check publik saat diminta + cache 15 menit |
| P21 | Provider RPC dan kebutuhan API key OFT API | **[Phase 0]** OFT API `/list` gratis tanpa key dan tidak memuat Robinhood. RPC publik Robinhood dibatasi rate; docs Robinhood merekomendasikan Alchemy | RPC publik untuk pengembangan dan gerbang Phase 2. **Owner:** provider dan akun RPC untuk produksi |
| P22 | Wallet library | Pola Cognita/Assize = Reown AppKit | [Usulan] AppKit + wagmi + viem (multi-network). Owner konfirmasi WalletConnect project ID |
| P23 | Desain: font, mekanisme buka koin, panel coin-lab, jumlah canvas, copy home chain | Lihat `DESIGN_SYSTEM.md` §14 (D1–D18) | Owner / desainer |
| P24 | Halaman aplikasi (`/launch`, `/t`, `/check`, …) tidak ada di HTML; HTML hanya landing satu halaman | [Desain] vs [Brief] | Bangun dari komponen section landing (`DESIGN_SYSTEM.md` §6.2) |
| P25 | Bahasa status: brief/guide memakai *Terkunci/Berubah/Lulus, menunggu ekspansi*, HTML memakai bahasa Inggris | — | [Usulan] Copy UI Inggris: Bonding / Graduated · awaiting expansion / Expanding / Locked / Changed. **Expanding** adalah tambahan dokumen ini (bukan dari guide); PM konfirmasi, atau status tetap "awaiting expansion" dengan progres per chain |
| P26 | Penyimpanan logo & metadata token (Supabase Storage vs IPFS) | Tidak disebut di brief/guide | [Usulan] Supabase Storage di MVP; hash gambar dicatat di event launch. Owner |
| P27 | Deploy Fase 1 dan Fase 2 (Phase 6–7) | Guide sudah menjabarkan prosedurnya | **FROZEN total** sampai PM memberi perintah mulai (keputusan user, 17 Nov 2026) |
| P28 | Urutan ekspansi: likuiditas dikirim sebelum resep (library, ULN, executor, options, peer) | **[Phase 0]** tidak bisa dijalankan: `send` revert `NoPeer` tanpa peer, dan default pathway ke/dari Robinhood adalah Dead DVN. Guide §7.3 masih menaruh resep setelah send | **Owner/PM.** Rekomendasi developer: pasang resep (di kedua sisi pathway) sebelum mengirim likuiditas; langkah lain tetap. **Harus tercatat sebelum Phase 3 dimulai** (instruksi owner, 17 Nov 2026) |
| P29 | Topologi pathway | Guide hanya menyebut Robinhood↔Base dan Robinhood↔Arbitrum | **Terselesaikan (guide):** hub lewat Robinhood. Base↔Arbitrum tidak di-wire; bridge Base→Arbitrum lewat Robinhood (dua langkah) |
| P30 | Penyimpanan cache Check | Guide: PostgreSQL / Redis, env `CHECK_DATABASE_URL`, folder `check/` | [Usulan] Supabase (Postgres) dipertahankan; Redis tidak dipakai di MVP; folder `check/` dipetakan ke `src/lib/check` + route handlers. Owner/PM konfirmasi |
| P31 | Siapa yang boleh memanggil `expandAndLock(token)` dan kapan | Guide: dipanggil dari UI, pemanggil membayar quote; syarat waktunya tidak dirinci | [Usulan] Siapa pun, untuk token berstatus Graduated, setelah infrastruktur Fase 2 aktif; tidak ada fungsi admin. PM konfirmasi. Insentif dan fee pesan balasan: P40 |
| P32 | Tier di testnet (Fase 1a dan 2a) | **[Phase 0]** Dari lima operator brief, hanya LayerZero Labs yang ada di ketiga testnet. Metadata LayerZero (17 Nov 2026) mencatat **Labs, Paxos, Twinstake, Horizen** di Robinhood testnet, Base Sepolia, dan Arbitrum Sepolia. Jadi Standard bisa direplikasi secara jumlah (4 operator), Fortress tidak (butuh 5). `dstConfig` keempat operator terbaca aktif di keempat arah testnet. Default pathway testnet = 1 DVN LayerZero Labs, bukan Dead DVN seperti mainnet (`proof/2026-11-17-phase0-addendum/notes.md` §1–2) | **PM:** tetapkan konfigurasi tier khusus testnet. Karena DVN dikunci di constructor Graduator (guide §5.2), keputusan ini dibutuhkan sebelum Fase **1a**, bukan baru di 2a (lihat P36) |
| P33 | Struktur repo | Guide: Foundry di root (`contracts/`, `script/`), `config/`, `deployments/<network>.json`, `layerzero.config.ts` | **Terselesaikan:** ikuti guide; Next app di `src/` (`ARCHITECTURE.md` §2) |
| P34 | Pemetaan warna chip chain di landing setelah home pindah ke Robinhood | HTML: Base mint (home), Arbitrum biru, Robinhood violet | Lihat D15 |
| P35 | Konfirmasi arah chain dari chat PM 15 Nov ("tunggu chain mereka", merujuk post X LayerZero) | Post tidak bisa dibaca (HTTP 402). Guide 17 Nov menetapkan Robinhood sebagai home | **User/PM:** konfirmasi bahwa guide v1.0 adalah keputusan final |
| P36 | Waktu keputusan vs Graduator yang immutable | Guide §5.2: Graduator di-deploy di Fase 1a/1b, tidak upgradeable, dan mengunci alamat DVN di constructor. Token yang lulus di 1b menunggu `expandAndLock` dari Graduator yang sama. Gerbang guide 1b→2a justru menunda keputusan aset pasangan sampai setelah 1b | **PM.** Rekomendasi developer: P1, P2, dan P28 diputuskan sebelum Phase 5 (paket audit), dan P32 sebelum Fase 1a. Bila tidak, Graduator 1b harus diganti dan token yang sudah lulus tidak bisa diekspansi |
| P37 | Letak daftar putih DVN | Guide §5.2 mengunci DVN di constructor Graduator; guide §5.4 menyebut Safe mengelola daftar putih untuk token baru | **PM:** jelaskan di mana daftar putih hidup (mis. Registry milik Safe untuk token baru, dibaca Graduator saat launch), atau hapus salah satunya |
| P38 | Pathway infrastruktur Graduator↔Remote: dikunci atau dipegang Safe | Brief: wire dengan tier Fortress "lalu kunci". Guide §7.2: owner dan delegate infrastruktur ke Safe. Bila Safe memegang delegate, Safe bisa mengubah DVN pathway infra dan dengan itu pesan instruksi ke Remote, sehingga "Safe tidak bisa menyentuh token yang sudah ada" tidak berlaku untuk token yang belum Locked | **PM + auditor.** Rekomendasi developer: kunci pathway infra seperti di brief, atau tulis batasnya dengan jujur di `/proof` |
| P39 | Alamat token seragam antar-chain | Guide §7.3: Remote men-deploy `XofNToken` "di alamat yang sama". [Phase 0] Salt CREATE3 yang tidak terikat pemanggil bisa didahului pihak lain. Desain alternatif (Graduator dan Remote di alamat CREATE3 yang sama, salt terikat pemanggil) [Belum] dibuktikan | **PM.** Rekomendasi developer: jangan jadikan syarat sampai desain yang aman terbukti di Phase 3 |
| P40 | Ekonomi `expandAndLock` | Brief mengaitkan insentif pemanggil dengan pembayaran fee LZ. Di guide, `graduate()` tanpa fee LZ, dan pemanggil `expandAndLock` membayar quote tanpa insentif. Fee pesan balasan (ack) dari chain ekspansi juga belum diatur | **PM**, bersama P15 dan P31 |
