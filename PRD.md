# PRD.md — XofN

> **Tujuan dokumen:** mendefinisikan *apa* yang dibangun untuk XofN: produk, kebutuhan, phase, acceptance criteria, dan keputusan yang masih terbuka. *Bagaimana* membangunnya ada di `ARCHITECTURE.md`.
>
> **Sumber kebenaran:**
> - Aturan protokol, keamanan, dan klaim publik → `brief-xofn.md` (XofN — Developer Brief, 14 Nov 2026).
> - Tampilan → `xofn-coinfall-v8-galaxy.html` (konsep visual V8).
> - Bila keduanya bertentangan, brief yang menang untuk perilaku produk. Konflik dicatat di §11, tidak diputuskan diam-diam.
>
> **Label sumber:**
> - **[Brief]** — tertulis di brief
> - **[Desain]** — tampak di HTML konsep
> - **[Usulan]** — keputusan teknis dokumen ini, bisa diubah owner
> - **[Belum]** — perlu diverifikasi (umumnya di Phase 0)
>
> **Dokumen terkait:** `CLAUDE.md` (aturan kerja), `ARCHITECTURE.md` (teknis), `DESIGN_SYSTEM.md` (visual), `USER_FLOWS.md` (alur).
>
> **Status repo:** proyek baru dari nol. Per 17 Nov 2026 belum ada kode.

---

## 1. Ringkasan

**XofN** adalah launchpad token omnichain di atas LayerZero V2 yang menjadikan **keamanan lintas chain sebagai standar yang terukur dan bisa dicek siapa pun** [Brief]. Setiap token membawa badge yang menyatakan berapa verifikator (DVN) yang menjaganya, misalnya `XofN 2+1/2`. Konfigurasi 1-of-1 tidak pernah diizinkan.

- **Tagline utama:** *Never one of one.*
- **Tagline sekunder:** *Graduate on proof, not promises.* [Brief]
- **Arti nama:** LayerZero memakai model keamanan *X-of-Y-of-N*. Aplikasi memilih X DVN wajib dan Y dari N DVN opsional. XofN menjadikan angka itu badge [Brief].
- **Cerita:** pada exploit Kelp DAO (April 2026, ±$292 juta), analisis Dune menunjukkan 47% dari ±2.665 aplikasi LayerZero memakai 1-of-1, dan hanya ±5% yang memakai 3-of-3 atau lebih. Pasar belum punya cara mudah untuk mengetahui sebuah token termasuk kelompok mana. XofN menjawabnya dengan satu badge [Brief].

**Tiga pembeda** dari ZeroKnown dan DVNity [Brief]:
1. Tier keamanan dipilih creator dan tampil sebagai badge. Tier yang lebih tinggi lebih mahal per pesan.
2. **XofN Check** bisa membaca OFT mana pun, tidak hanya token XofN. Fitur ini sekaligus alat konten dan distribusi.
3. Konfigurasi **terkunci saat graduation**. Token mulai di bonding curve di Base. Saat lulus, satu alur otomatis memasang chain ekspansi, menyalurkan likuiditas lewat lzCompose, lalu mengunci semuanya.

**Nada:** XofN adalah brand paling teknis dari tiga brand. Bahasanya presisi dan berbasis angka, tetapi badge harus tetap mudah dipahami trader biasa [Brief].

---

## 2. Tujuan

### 2.1 Tujuan MVP — tiga hal yang harus terbukti [Brief]
1. Badge tier keamanan **bisa diverifikasi on-chain** lewat `XofNRegistry.verify(token)`.
2. Token **terkunci otomatis saat graduation**: owner = 0, delegate = 0, library dan konfigurasi di-pin.
3. Siapa pun bisa **mengecek X-of-N sebuah OFT dalam satu klik** (XofN Check).

### 2.2 Isi MVP [Brief]
1. Template `XofNToken` (OFT) dengan supply tetap 999.000.000. Tidak ada mint publik, pajak, blacklist, pause, atau upgrade.
2. Bonding curve di home chain (**Base**).
3. `XofNGraduator` yang menjalankan seluruh graduation sebagai satu alur otomatis.
4. Dua tier keamanan (Standard, Fortress) plus penolakan 1-of-1.
5. `XofNRegistry` dengan `verify(token)`.
6. XofN Check di `/check/<chain>/<alamat>`.
7. Chain ekspansi: **Arbitrum** dan **Robinhood Chain**.

### 2.3 Non-goal [Brief]
- Graduation lintas chain dengan **lzRead**. Masuk **Backlog pasca-MVP** (§8.3).
- Verifikasi creator zkTLS (wilayah ZeroKnown).
- Monitor independen ala Oracle Watch (wilayah DVNity). XofN cukup memeriksa ulang konfigurasi secara berkala.
- Shielded pools, Solana, HyperEVM, Elysium, integrasi ATLAS/Zero.
- Token **$XOFN**, sampai MVP live di mainnet dan sudah diaudit.
- [Usulan] Fitur AI apa pun. Tidak ada di brief, jadi jangan ditambahkan.

---

## 3. Pengguna

| Pengguna | Kebutuhan | Titik masuk utama |
|---|---|---|
| **Trader** | Mengetahui risiko bridge sebuah token dalam satu detik | Badge di kartu token, `/check`, `/t/[address]` |
| **Creator** | Token bisa pindah lintas chain *setelah* terbukti ada permintaan, bukan sejak hari pertama | `/launch` |
| **Pemanggil graduation** (siapa saja) | Memicu `graduate()` saat ambang tercapai dan menerima insentif tetap | Tombol Graduate di `/t/[address]` |
| **Builder / aggregator / DEX** | Fungsi on-chain `verify(token)` untuk memfilter token | `XofNRegistry` (explorer), `/contracts` |
| **Owner infra** (Safe 2-of-3) | Mengelola daftar putih DVN dan label operator. Perubahannya tidak memengaruhi token yang sudah terkunci | Di luar UI publik |

---

## 4. Leksikon & aturan bahasa

### 4.1 Istilah produk
| Istilah | Arti | Catatan copy |
|---|---|---|
| **Badge `XofN 2+1/2`** | 2 DVN wajib + 1 dari 2 DVN opsional [Brief] | Selalu tampil bersama status. Bisa diklik untuk melihat daftar DVN dan alamat per pathway |
| **Standard** | Tier default, `XofN 2+1/2` | — |
| **Fortress** | Tier tinggi, `XofN 3+1/2`; biaya per pesan lebih tinggi | — |
| **Bonding** | Belum graduation; owner = `XofNGraduator` | Warna oranye |
| **Locked** (brief: *Terkunci*) | Owner = 0, delegate = 0, konfigurasi sesuai tier, `verify()` = true di semua chain | Warna mint |
| **Changed** (brief: *Berubah*) | Konfigurasi tidak lagi sesuai tier | Warna merah |
| **1-of-1** | Satu DVN wajib tanpa DVN opsional | Selalu label merah di Check |
| **Graduation** | Peralihan dari curve ke pool + ekspansi + kunci | — |
| **Pathway** | Pasangan chain (EID) beserta arahnya | Konfigurasi dicek di kedua arah |

Copy UI ditulis dalam **bahasa Inggris** (Bonding / Locked / Changed). Istilah Indonesia di brief adalah padanannya [Usulan, lihat P25].

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

### 4.3 Aturan klaim publik [Brief] — berlaku untuk semua copy UI, OG image, dan konten
| Klaim | Boleh dipakai kapan |
|---|---|
| "Building the launchpad where 1-of-1 is never allowed" | Sekarang |
| "Check any OFT's X-of-N" | Setelah XofN Check live di mainnet |
| "Every XofN token: 2+ DVNs, owner 0, delegate 0" | Setelah graduation mainnet pertama dan `verify()` mengembalikan `true` |
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

### 5.1 Token [Brief]
- `XofNToken` adalah OFT dengan supply tetap **999.000.000** yang seluruhnya di-mint ke bonding curve di Base. Shared decimals **6**.
- Tidak ada `mint` (selain `_credit` dari endpoint dan peer yang benar), `pause`, `setFee`, `blacklist`, atau `upgrade`.
- `renounceOwnership()` di-override agar **menolkan delegate lebih dulu**, untuk menutup celah QUIP-25.
- Invariant: total supply di semua chain selalu 999M, baik sebelum maupun sesudah graduation.

### 5.2 Bonding (Base) [Brief]
- `XofNCurve` memakai parameter tetap per launch, yaitu harga awal dan ambang graduation. Nilainya diputuskan owner (P8).
- Selama bonding, owner **dan** delegate token adalah kontrak `XofNGraduator`, bukan orang.
- Graduator tidak punya fungsi admin untuk mengubah konfigurasi, kecuali satu jalur graduation yang hasilnya sudah ditentukan oleh tier.

### 5.3 Tier keamanan [Brief]
| Tier | Badge | DVN wajib | DVN opsional |
|---|---|---|---|
| Standard (default) | `XofN 2+1/2` | LayerZero Labs + Google Cloud (atau Polyhedra) | 1 dari 2: Deutsche Telekom MMS / Fidelity (FCAT) |
| Fortress | `XofN 3+1/2` | Labs + Google Cloud + Polyhedra | 1 dari 2: DT MMS / FCAT |
| — | 1/1 | **Ditolak di level kontrak** | — |

- Tier dipilih saat launch dan **tidak bisa diturunkan**.
- Factory menolak tier dengan kurang dari 2 DVN wajib, atau DVN di luar daftar putih.
- Jika pathway Base ↔ Robinhood tidak punya 3 operator DVN, Fortress **tidak ditawarkan** untuk ekspansi ke Robinhood, dan UI menjelaskan alasannya.
- Alamat DVN per chain diambil dari halaman *DVN addresses* LayerZero.
- **Ketersediaan per pathway — terverifikasi Phase 0 (17 Nov 2026, `proof/2026-11-17-phase0/02-dvn-pathways.md`):**
  - LayerZero Labs, Deutsche Telekom, dan FCAT tersedia di Base, Arbitrum, dan Robinhood, di semua arah.
  - Google Cloud tersedia di Base dan Arbitrum, **tidak ada di Robinhood**.
  - Polyhedra **deprecated** di Base dan Arbitrum, dan tidak ada di Robinhood.
  - Akibatnya: Standard seperti tabel di atas terpenuhi di Base ↔ Arbitrum, tetapi **tidak** di Base ↔ Robinhood; Fortress seperti tabel di atas tidak terpenuhi di pathway mana pun tanpa DVN deprecated.
  - Standard butuh 4 operator berbeda per pathway (2 wajib + 2 opsional) dan Fortress 5, bukan 3.
  - Tiga belas operator lain tersedia di ketiga chain. Pemilihan operator pengganti adalah keputusan owner (P1, P18). Tabel di atas **tidak diubah** sampai owner memutuskan.

### 5.4 Graduation — urutan wajib [Brief]
1. Curve mencapai ambang. **Siapa pun** bisa memanggil `graduate()`, dan pemanggil menerima insentif kecil yang tetap (P15).
2. Graduator membuat pool di Base dengan likuiditas dari curve.
3. Untuk setiap chain ekspansi, Graduator mengirim pesan deploy ke `XofNRemote` dengan salt yang sama.
4. Setelah token remote terkonfirmasi, Graduator mengirim porsi token likuiditas lewat `send` + compose. `XofNRemote` membuat pool di dalam `lzCompose`.
5. Di setiap pathway dan **kedua arah**, Graduator menjalankan urutan ini: set library eksplisit, konfigurasi ULN sesuai tier, konfigurasi executor, enforced options (gas `lzReceive` dan `lzCompose`), lalu peer.
6. Verifikasi on-chain lewat `XofNRegistry.verify` versi pra-kunci. Revert jika tidak sesuai.
7. `setDelegate(address(0))`, lalu `renounceOwnership()` di setiap chain.
8. `XofNRegistry` mencatat token sebagai **Locked** dengan tier final.

Catatan:
- **Langkah 3–7 tidak atomik lintas chain.** Jika satu chain gagal, langkah di chain itu harus bisa diulang lewat `retryRemote(eid)`, yang hanya bisa mengulang langkah yang sama dengan parameter yang sama.
- Token **tidak boleh tampil Locked** sebelum semua chain selesai.
- `graduate()` gagal sebelum ambang tercapai, dan hanya bisa dijalankan sekali.

### 5.5 Composer (`XofNRemote.lzCompose`) [Brief]
- Hanya menerima panggilan dari endpoint LayerZero, dan hanya untuk `XofNToken` yang terdaftar sebagai sumber.
- Pembuatan pool **dan** penambahan likuiditas terjadi dalam satu panggilan `lzCompose`, untuk mencegah manipulasi harga awal.
- Enforced options wajib mengisi gas untuk `lzReceive` **dan** `lzCompose`.
- Perilaku saat compose gagal (P3): jawaban awal dari source sudah ada (Phase 0: token sudah berada di composer, compose bisa dijalankan ulang oleh siapa pun); pembuktian lewat tes tetap [Belum] sampai Phase 3. Jalur `retryCompose` harus aman.
- Aset pasangan untuk pool di chain ekspansi belum ditentukan (P2). Pilihannya: native drop executor, stablecoin OFT, atau pool satu sisi.

### 5.6 `XofNRegistry.verify(token)` [Brief]
- View function on-chain yang bisa dipanggil kontrak lain.
- Pemeriksaan:
  - `owner()` dan `endpoint.delegates(token)` keduanya harus `address(0)`.
  - Konfigurasi `endpoint.getConfig` dan library untuk setiap EID terdaftar dibandingkan dengan hash tier yang tersimpan.
- Mengembalikan `(bool locked, uint8 tier, uint32[] eids)`.
- Bila gas terlalu mahal, sediakan juga `verifyEid(token, eid)` (P7).
- Cara membuktikan status chain lain dari Base adalah keputusan arsitektur yang masih terbuka (P13).

### 5.7 XofN Check [Brief]
- **Input:** chain + alamat token, atau pencarian lewat OFT API LayerZero untuk menemukan semua deployment.
- **Output per pathway:**
  - jumlah DVN wajib dan opsional, beserta threshold
  - nama operator, bila ada di daftar label
  - owner dan delegate
- **Label otomatis:** "1-of-1" merah, "2+" kuning, "2+ dan terkunci" hijau.
- Hasil di-cache dan **selalu** menampilkan "checked at <time>".
- **Aturan konten:** XofN Check menampilkan fakta, bukan tuduhan.

### 5.8 Bridge [Brief]
- `quoteSend` dipanggil tepat sebelum `send`.
- Jumlah di bawah **0,000001** token (sisa pembulatan shared decimals 6) tetap tinggal di wallet pengirim, dan UI menjelaskannya.
- Hanya tersedia setelah graduation.

### 5.9 Prinsip transaksi [Brief]
- Semua transaksi disusun di browser dan ditandatangani di wallet pengguna. **Server tidak pernah memegang key.**
- Server hanya mengindeks event dan menyajikan data untuk Check dan halaman token.

---

## 6. Kebutuhan fungsional per route

Semua route berikut wajib ada [Brief]. Selama kontrak belum ter-deploy, semua halaman aplikasi berjalan dalam **mode preview/demo** dengan label jelas (§7, `ARCHITECTURE.md` §10.4).

### 6.1 `/` — Landing + discovery
- **[Desain]** Port penuh landing HTML V8. Urutan section ada di `DESIGN_SYSTEM.md` §6.
- **[Brief]** Menampilkan token dalam bonding (progres ke graduation) dan token terkunci, keduanya dengan badge tier.
- Filter All / Bonding / Locked.
- Sebelum ada token nyata, isi grid adalah contoh fiktif berlabel "FICTIONAL" / "DEMO" [Desain].

### 6.2 `/launch` — Buat token
- **Form:**
  - nama (≤32) dan ticker (2–12 alfanumerik)
  - gambar (validasi tipe dan ukuran ≤3 MB [Desain])
  - pilihan tier Standard / Fortress
  - chain ekspansi Arbitrum / Robinhood, minimal satu
  - supply tampil sebagai "999,000,000 FIXED"
- Menampilkan perbedaan biaya per pesan antara Standard dan Fortress. Angkanya dari `quoteSend`; sebelum tersedia, tampil "NOT QUOTED" [Desain].
- Fortress dinonaktifkan per chain bila pathway tidak memenuhi 3 operator, beserta alasannya.
- Satu tanda tangan di Base. Setelah sukses, redirect ke `/t/[address]` dengan status Bonding.
- Penyimpanan gambar/metadata [Belum] (P26).

### 6.3 `/t/[address]` — Halaman token
- Trading di curve (sebelum graduation) atau di pool (sesudahnya): Buy/Sell, jumlah, slippage, dan quote.
- Badge + status (Bonding / Locked / Changed), daftar DVN per pathway, supply per chain, dan hasil `verify()` live.
- Panel graduation: progres per chain, tombol Graduate saat ambang tercapai, dan Retry per chain bila ada langkah yang gagal.
- Tautan explorer dan LayerZero Scan untuk setiap pesan graduation.

### 6.4 `/check` dan `/check/[chain]/[address]` — XofN Check
- `/check`: input alamat + pemilih chain, ditambah contoh (sample) yang jelas berlabel simulasi [Desain].
- `/check/[chain]/[address]`: hasil per pathway, label warna, owner/delegate, dan "checked at".
- Tombol **Share** menghasilkan gambar kartu (OG image) untuk X.
- Alamat tidak valid → error validasi. RPC gagal → error yang jujur, **tanpa** hasil palsu.
- Token XofN dan non-XofN diperlakukan sama. Untuk token XofN, Check menambahkan hasil `verify()`.

### 6.5 `/bridge`
- Pilih chain asal/tujuan dan jumlah. Ringkasan menampilkan fee (quote), penerimaan, dan dust.
- Ditandatangani di wallet. Setelah kirim, tampil tautan LayerZero Scan.
- Diblokir untuk token yang belum graduation.

### 6.6 `/contracts` dan `/proof`
- `/contracts`:
  - alamat semua kontrak dari manifest `deployments/<network>.json`, beserta status (Planned / Deployed / Verified)
  - sebelum deploy: "Not published" [Desain]
- `/proof`:
  - checklist invariant `verify()`, milestone, dan tautan bukti dari folder `proof/`
  - laporan audit (setelah ada)

---

## 7. Kebutuhan nonfungsional

| Area | Kebutuhan |
|---|---|
| **Transparansi** | Setiap data on-chain menampilkan sumber dan waktu baca. Data demo/simulasi selalu berlabel (`DEMO`, `*`, `NOT LIVE`). Status "Locked" tidak boleh dikarang |
| **Keamanan** | Tidak ada key di server untuk aksi pengguna. Otorisasi tidak boleh dilakukan di `proxy.ts`. Input pengguna di-escape. Env hanya dibaca lewat modul env (`ARCHITECTURE.md` §12) |
| **Performa** | LCP landing < 2,5 dtk di desktop. Three.js dimuat lazy. Ada quality governor WebGL. Mobile memakai scene yang lebih ringan atau fallback |
| **Aksesibilitas** | Navigasi keyboard penuh, fokus terlihat, ARIA untuk dialog/radiogroup/tabs, `aria-live` untuk hasil Check, kontras AA, semua animasi menghormati `prefers-reduced-motion` |
| **Responsif** | Tidak ada overflow horizontal di 360–390px. Navigasi mobile wajib ada |
| **Ketahanan** | Graduation bisa di-retry per chain. UI tetap benar walau ada chain yang tertunda |
| **Bahasa** | Copy UI bahasa Inggris. Dokumentasi dan komentar kode bahasa Indonesia |
| **Bukti** | Setiap phase menghasilkan folder `proof/YYYY-MM-DD-<milestone>/notes.md` (`CLAUDE.md` §11) |

---

## 8. Scope & roadmap phase

### 8.1 Tabel phase
Phase **6 dan 7 (deploy testnet dan mainnet) FROZEN**: tidak dikerjakan sampai ada brief tambahan dari owner.

| Phase | Fokus | Gerbang keluar | Status |
|---|---|---|---|
| **0** | Verifikasi riset (brief P0): DVN per pathway, AMM per chain, opsi aset pasangan, EID, perilaku ULN nilai 0. Hanya membaca docs/chain, **tanpa transaksi** | Tabel ketersediaan DVN per pathway dan rekomendasi untuk P1–P9 terisi | Selesai 17 Nov 2026; **menunggu persetujuan gerbang** (`proof/2026-11-17-phase0/notes.md`) |
| **1** | Fondasi repo (Next 16, Tailwind v4, env module, lint/test) + port landing HTML (mode preview, label NOT LIVE) | lint/typecheck/test/build lulus; landing setara HTML di 390/768/1280/1680; reduced motion OK | Belum mulai |
| **2** | XofN Check (brief P1): reader `getConfig` + OFT API + cache Supabase + kartu share. **Hanya membaca** OFT yang sudah ada | Hasil Check untuk 20 OFT populer cocok dengan pembacaan manual `getConfig` | Belum mulai |
| **3** | Kontrak (brief P2–P3), **lokal saja**: Token, Curve, Graduator, Remote, Registry, `verify()`. Foundry unit/fuzz/invariant, multi-endpoint, fork test read-only, Anvil | Semua tes wajib (§9.2) lulus lokal, termasuk retry setelah kegagalan disengaja dan `verify()` = false untuk token yang sengaja tidak dikunci | Belum mulai |
| **4** | Integrasi frontend aplikasi: `/launch`, `/t/[address]`, graduation, `/bridge`, `/contracts`, `/proof` terhadap Anvil lokal / mode simulasi | Semua flow di `USER_FLOWS.md` jalan end-to-end di lokal | Belum mulai |
| **5** | Hardening & kesiapan audit: review internal, `forge test --profile ci`, NatSpec, paket audit, threat model | Tidak ada temuan critical/high internal yang terbuka; paket audit siap | Belum mulai |
| **6** | **Deploy testnet** (Base Sepolia, Arbitrum Sepolia, Robinhood testnet) | — | **FROZEN: menunggu brief tambahan** |
| **7** | **Deploy mainnet** (audit eksternal, rollout terbatas, lalu publik) | — | **FROZEN: menunggu brief tambahan** |

### 8.2 Pemetaan milestone brief → phase
| Milestone brief | Phase di dokumen ini | Catatan |
|---|---|---|
| P0 Verifikasi | 0 | Riset read-only |
| P1 XofN Check | 2 | Gerbang "live di mainnet" berarti membaca OFT mainnet yang sudah ada; tidak butuh deploy |
| P2 Token/curve/Graduator testnet | 3 (lokal) + 6 (gerbang testnet) | Bagian testnet frozen |
| P3 Registry & `verify()` | 3 | — |
| P4 Audit | 5 (persiapan) + 7 (audit eksternal) | — |
| P5 Mainnet terbatas → publik | 7 | Frozen |
| P6 lzRead | Backlog | §8.3 |

Angka minggu di brief adalah perkiraan awal dan harus direvisi setelah Phase 0 [Brief].

### 8.3 Backlog pasca-MVP (tanpa nomor phase)
- Graduation lintas chain dengan **lzRead** (`lzMap` / `lzReduce`), "XofN Score" per token, pemicu ekspansi ke chain ketiga. Syaratnya ReadLib1002 terkonfirmasi di chain target; Robinhood belum (P10).
- Statistik ekosistem dari data Check sendiri (dengan metodologi).

---

## 9. Acceptance criteria

### 9.1 Per phase (yang aktif)
**Phase 0**
- [x] Untuk setiap pathway (Base↔Arbitrum, Base↔Robinhood), terdapat tabel DVN: Labs, Google Cloud, Polyhedra, DT MMS, FCAT, masing-masing tersedia atau tidak, beserta alamatnya. Sumbernya halaman DVN addresses LZ. — `proof/2026-11-17-phase0/02-dvn-pathways.md`
- [x] EID mainnet/testnet ketiga chain terkonfirmasi (`ARCHITECTURE.md` §4). — `01-chains-eid.md`
- [x] Ada rekomendasi untuk P1–P9 dan P13. — `08-recommendations.md`. Catatan: P4 dan P7 baru terukur di Phase 3, P6 hanya estimasi fee DVN, P8 milik owner.
- Gerbang brief P0 ("Standard tersedia di kedua pathway") **belum lolos untuk Robinhood** sampai owner memilih operator wajib kedua (P1).

**Phase 1**
- [ ] Landing menampilkan semua section HTML dengan visual setara, dan 3D berjalan beserta fallback-nya.
- [ ] Panel review "coin-lab" tidak ikut di-port (D1).
- [ ] Semua data demo berlabel. Disclaimer LayerZero ada di footer.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` lulus.
- [ ] Tidak ada overflow di 360px. Reduced motion mematikan semua animasi. Tidak ada kebocoran WebGL saat navigasi bolak-balik.

**Phase 2**
- [ ] `/check/[chain]/[address]` membaca OFT nyata di Base, Arbitrum, dan Robinhood.
- [ ] Hasil untuk 20 OFT populer cocok dengan pembacaan manual. Bukti disimpan di `proof/`.
- [ ] Contoh 1-of-1, 2+, dan 2+ terkunci tampil dengan label benar.
- [ ] Ada "checked at" dan cache. Error RPC tidak memalsukan hasil.
- [ ] Kartu share (OG image) bekerja.

**Phase 3**
- [ ] Semua tes wajib §9.2 lulus dengan `forge test`. Invariant supply berjalan.
- [ ] Hanya ada script deploy untuk Anvil lokal.

**Phase 4**
- [ ] Flow A–I di `USER_FLOWS.md` berjalan end-to-end terhadap Anvil lokal / simulasi.

**Phase 5**
- [ ] `forge test --profile ci` lulus. Paket audit (scope, threat model, NatSpec) siap.

### 9.2 Tes wajib kontrak [Brief]
- [ ] Invariant: total supply di semua chain selalu 999M, sebelum dan sesudah graduation.
- [ ] Tidak ada mint selain `_credit` dari endpoint dan peer yang benar.
- [ ] Selama bonding, tidak ada pihak selain Graduator yang bisa memanggil fungsi owner/delegate. Graduator sendiri tidak punya fungsi di luar jalur graduation.
- [ ] `graduate()` gagal sebelum ambang tercapai, dan hanya bisa dijalankan sekali.
- [ ] Graduation gagal di satu chain (DVN atau gas disimulasikan gagal), lalu `retryRemote` berhasil dengan parameter yang sama. Token tidak tampil Locked sebelum semua chain selesai.
- [ ] Composer: `lzCompose` dari alamat selain endpoint ditolak. Compose dari token yang tidak terdaftar ditolak.
- [ ] Composer: pool dibuat dan diisi dalam satu panggilan; upaya front-run gagal atau tidak berpengaruh.
- [ ] Composer: perilaku saat `lzCompose` kehabisan gas atau revert terdokumentasi, dan `retryCompose` aman.
- [ ] Factory menolak tier dengan kurang dari 2 DVN wajib atau DVN di luar daftar putih.
- [ ] `renounceOwnership` menolkan delegate lebih dulu.
- [ ] `verify()` mengembalikan `false` jika owner ≠ 0, delegate ≠ 0, atau konfigurasi satu pathway berbeda dari tier.
- [ ] XofN Check: hasil untuk token 1-of-1, 2-of-2, dan 3+ cocok dengan pembacaan manual `getConfig`.

### 9.3 Acceptance criteria MVP mainnet [Brief] — **Phase 7, FROZEN**
Dicatat sebagai referensi saja dan tidak dikerjakan sampai ada brief tambahan.
- [ ] XofN Check live di mainnet dan bisa membaca OFT di Base, Arbitrum, dan Robinhood Chain.
- [ ] Satu token mainnet melewati graduation penuh: pool di Base, Arbitrum, dan Robinhood dibuat lewat compose, semuanya terkunci dengan badge `XofN 2+1/2`.
- [ ] `XofNRegistry.verify(token)` mengembalikan `true` dan bisa dipanggil siapa pun di explorer.
- [ ] Bridge dua arah antar ketiga chain sukses, dengan tautan LayerZero Scan.
- [ ] Semua kontrak terverifikasi, dan semua alamat ada di `/contracts`.
- [ ] Laporan audit eksternal dipublikasikan di `/proof`, tanpa temuan critical/high yang terbuka.

---

## 10. Risiko & dependensi

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R1 | Selama bonding, keamanan token bergantung pada kode `XofNGraduator` [Brief] | Kritis | Graduator tidak upgradeable, tanpa fungsi admin; audit paling ketat |
| R2 | Setelah terkunci, chain tidak bisa ditambah, dan pathway bisa macet bila DVN yang di-pin pensiun (contoh: Nethermind keluar 19 Agustus 2026) [Brief] | Tinggi | Pilih DVN stabil; tampilkan status Changed/terganggu di Check; komunikasikan risiko di `/proof` |
| R3 | Gas `lzCompose` kurang sehingga token sampai tetapi pool tidak dibuat [Brief] | Tinggi | Enforced options untuk compose; `retryCompose` |
| R4 | Langkah graduation lintas chain tidak atomik [Brief] | Sedang | `retryRemote(eid)` idempoten; UI per chain |
| R5 | Pathway Base↔Robinhood kekurangan DVN non-Labs | Sedang | Phase 0; Fortress dinonaktifkan per chain |
| R6 | Arti nilai 0 di ULN custom (default vs nol) [Brief] | Tinggi | Phase 0 (P5) membaca `UlnBase.sol`; set nilai eksplisit |
| R7 | `verify()` tidak bisa membaca state chain lain secara langsung | Tinggi | Keputusan P13 |
| R8 | Biaya dan rate limit RPC / OFT API untuk Check | Sedang | Cache Supabase, re-check terjadwal, rate limit API |
| R9 | Hukum: POJK 23/2025 sebelum mainnet publik [Brief] | Tinggi | Opini hukum awal (P12) sebelum Phase 7 |
| R10 | DNS ISP (Telkomsel) memblokir `*.robinhood.com` di lingkungan dev | Rendah | Pakai DNS/VPN lain sebelum kerja RPC Robinhood |
| R11 | Beban 3D di perangkat lemah | Sedang | Quality governor, fallback, scene mobile ringan (`DESIGN_SYSTEM.md` §8) |

**Dependensi eksternal:** endpoint LayerZero V2 di ketiga chain, DVN pihak ketiga, OFT API LayerZero, RPC per chain, AMM per chain (P9), Supabase, WalletConnect/Reown project ID.

---

## 11. Keputusan terbuka & konflik

Jangan memutuskan item berikut diam-diam. Ikuti rekomendasi yang tertulis, atau tanyakan ke owner.

| # | Topik | Fakta | Rekomendasi / pemilik keputusan |
|---|---|---|---|
| P1 | DVN tersedia per pathway (Base↔Arbitrum, Base↔Robinhood); Fortress bisa dipenuhi? | **Terverifikasi Phase 0 (17 Nov 2026):** Labs, DT, FCAT ada di ketiga chain. Google tidak ada di Robinhood. Polyhedra deprecated di Base/Arbitrum dan tidak ada di Robinhood. Standard brief hanya terpenuhi di Base↔Arbitrum; Fortress brief tidak terpenuhi di mana pun tanpa DVN deprecated. 13 operator alternatif tersedia di ketiganya (`proof/2026-11-17-phase0/02-dvn-pathways.md`) | **Owner:** pilih operator wajib kedua untuk pathway Robinhood dan operator wajib ketiga untuk Fortress. Rekomendasi developer: tier didefinisikan lewat jumlah, opsional tetap DT + FCAT, Polyhedra tidak dipakai (`proof/2026-11-17-phase0/08-recommendations.md`) |
| P2 | Aset pasangan pool di chain ekspansi | Opsi: native drop executor, stablecoin OFT (mis. USDT0), pool satu sisi [Brief]. **Phase 0:** native drop dibatasi 0,24 ETH (ke Arbitrum) dan 0,301 ETH (ke Robinhood) per pesan; satu-satunya stablecoin OFT di ketiga chain adalah USDe; pool satu sisi hanya di Uniswap v3/v4 (`proof/2026-11-17-phase0/04-amm-pair-asset.md`) | **Owner.** Rekomendasi developer: native drop + Uniswap v2 bila likuiditas pasangan per chain ≤ ±0,2 ETH; selain itu pool satu sisi Uniswap v3. Stablecoin OFT tidak direkomendasikan untuk MVP |
| P3 | Nasib token jika `lzCompose` gagal; desain `retryCompose` | **Jawaban awal dari source (Phase 0):** token sudah dikreditkan ke composer sebelum compose; compose yang gagal tetap tersimpan di endpoint dan bisa dijalankan ulang oleh siapa pun, tanpa kedaluwarsa (`proof/2026-11-17-phase0/03-uln-semantics.md` §7) | Diuji di Phase 3 dengan multi-endpoint test; jalur keluar untuk kegagalan permanen dirancang di Phase 3 |
| P4 | Gas `lzReceive` pesan deploy dan gas compose pembuatan pool | Belum diukur | Ukur di Phase 3 (lokal); validasi testnet di Phase 6 |
| P5 | Apakah nilai 0 di ULN custom berarti default? (`UlnBase.sol`) | **Terverifikasi Phase 0: ya.** 0 = default untuk konfirmasi, jumlah DVN wajib, dan jumlah DVN opsional; nol sebenarnya ditulis `type(uint64).max` / `255` (`proof/2026-11-17-phase0/03-uln-semantics.md` §1) | Konfigurasi selalu eksplisit; [Usulan] factory menolak tier dengan field 0 |
| P6 | Biaya per pesan Standard vs Fortress | Harga DVN tidak dipublikasikan; brief meminta `quoteSend` di testnet. **Phase 0:** estimasi dari `DVN.getFee` mainnet (bukan quote): porsi DVN Fortress ±25% di atas Standard bila operator tambahan sekelas (`proof/2026-11-17-phase0/08-recommendations.md`) | Testnet frozen, jadi UI menampilkan "NOT QUOTED" sampai Phase 6. Estimasi hanya untuk perencanaan internal |
| P7 | Gas `verify()` untuk 3 chain; perlu `verifyEid`? | [Brief]. **Phase 0:** ±8 panggilan view eksternal per EID; gas belum terukur. `receiveLibraryTimeout` perlu ikut diperiksa | Ukur di Phase 3; sediakan `verifyEid` [Usulan] |
| P8 | Parameter bonding curve & ambang graduation (ETH) | Owner yang memutuskan [Brief] | Owner |
| P9 | AMM per chain (Uniswap V2/V3/V4 atau lainnya) | **Terverifikasi Phase 0:** Uniswap v2, v3, dan v4 ada di Base, Arbitrum, dan Robinhood (`proof/2026-11-17-phase0/04-amm-pair-asset.md`) | **Owner.** Rekomendasi developer: satu versi yang sama di ketiga chain; v2 bila P2 = native drop, v3 bila P2 = satu sisi |
| P10 | Robinhood didukung ReadLib1002 (lzRead)? | **Phase 0:** metadata LayerZero tidak mencantumkan ReadLib1002 untuk Robinhood (mainnet maupun testnet) per 17 Nov 2026 | Backlog |
| P11 | Domain, handle X, ticker $XOFN | [Brief] | Owner |
| P12 | Opini hukum (Indonesia, POJK 23/2025) | [Brief] | Owner, sebelum Phase 7 |
| P13 | Bagaimana `verify()` di Base mengetahui state di Arbitrum/Robinhood | HTML konsep mencatat ini belum terselesaikan [Desain]. **Phase 0:** Robinhood tidak punya ReadLib1002, jadi lzRead tidak bisa dipakai; Registry di Base hanya bisa membaca konfigurasi sisi Base (`proof/2026-11-17-phase0/08-recommendations.md`) | [Usulan] Registry di **setiap** chain dengan `verifyEid` lokal. Status global "Locked" = semua registry true, dikonfirmasi lewat ack LZ dari Remote ke Graduator, plus dibaca indexer. lzRead menyusul. Owner + auditor |
| P14 | Siapa yang membayar fee LZ untuk `retryRemote` | Belum diatur | [Usulan] Siapa pun boleh memanggil retry dan membayar fee sendiri; parameter tetap |
| P15 | Besaran insentif pemanggil `graduate()` | "Kecil dan tetap" [Brief] | Owner |
| P16 | Pembagian 999M: porsi curve vs porsi likuiditas per chain | Tidak dirinci di brief | Owner, bersama P8 |
| P17 | Fee trading di curve | Brief hanya melarang pajak token; fee curve tidak disebut | Owner. Default [Usulan]: tidak ada fee sampai diputuskan |
| P18 | Standard: DVN wajib kedua Google Cloud **atau** Polyhedra — tetap per pathway, atau creator memilih? | [Brief] ambigu. **Phase 0:** Google tidak ada di Robinhood dan Polyhedra deprecated, jadi DVN wajib kedua pathway Robinhood harus operator lain (lihat P1) | [Usulan] Ditentukan per pathway oleh daftar putih (bukan pilihan creator); badge tetap `2+1/2` |
| P19 | Chain yang dibaca XofN Check di MVP | Brief: Base, Arbitrum, Robinhood | [Usulan] Tiga chain itu dulu; pathway ke chain lain tampil "not read" |
| P20 | Frekuensi re-check untuk mendeteksi status Changed | "Secara berkala" [Brief] | [Usulan] Token XofN tiap 6 jam, hasil Check publik saat diminta + cache 15 menit |
| P21 | Provider RPC dan kebutuhan API key OFT API | **Phase 0:** OFT API `/list` gratis tanpa key (`LZ_OFT_API_KEY` tidak diperlukan) dan tidak memuat Robinhood. RPC publik Robinhood dibatasi rate; docs Robinhood merekomendasikan Alchemy (`proof/2026-11-17-phase0/07-oft-api-rpc.md`) | RPC publik untuk pengembangan dan gerbang Phase 2. **Owner:** provider dan akun RPC untuk produksi |
| P22 | Wallet library | Pola Cognita/Assize = Reown AppKit | [Usulan] AppKit + wagmi + viem (multi-network). Owner konfirmasi WalletConnect project ID |
| P23 | Desain: font, mekanisme buka koin, panel coin-lab, jumlah canvas | Lihat `DESIGN_SYSTEM.md` §14 (D1–D14) | Owner / desainer |
| P24 | Halaman aplikasi (`/launch`, `/t`, `/check`, …) tidak ada di HTML; HTML hanya landing satu halaman | [Desain] vs [Brief] | Bangun dari komponen section landing (`DESIGN_SYSTEM.md` §6.2) |
| P25 | Bahasa status: brief memakai *Terkunci/Berubah*, HTML memakai bahasa Inggris | — | [Usulan] Copy UI Inggris: Bonding / Locked / Changed |
| P26 | Penyimpanan logo & metadata token (Supabase Storage vs IPFS) | Tidak disebut di brief | [Usulan] Supabase Storage di MVP; hash gambar dicatat di event launch. Owner |
| P27 | Deploy testnet & mainnet | — | **FROZEN** sampai brief tambahan dari owner |
| P28 | Urutan graduation: likuiditas (langkah 4) dikirim sebelum konfigurasi dan peer (langkah 5) | **Temuan Phase 0:** tidak bisa dijalankan. `send` revert `NoPeer` tanpa peer, dan default pathway ke/dari Robinhood adalah Dead DVN, jadi pesan tanpa ULN eksplisit tidak akan terkirim (`proof/2026-11-17-phase0/03-uln-semantics.md` §6, `02-dvn-pathways.md`) | **Owner** (aturan protokol brief). Rekomendasi developer: pasang konfigurasi token sebelum mengirim likuiditas; langkah lain tetap. Harus diputuskan sebelum Phase 3 |
| P29 | Topologi pathway: perlu Arbitrum↔Robinhood langsung? | Dokumen hanya menyebut dua pathway dari Base; kriteria MVP §9.3 menyebut bridge dua arah antar ketiga chain. DVN untuk pathway ketiga tersedia | **Owner.** Pilihan: mesh penuh (3 pathway) atau hub lewat Base (2 pathway). Harus diputuskan sebelum Phase 3 |
