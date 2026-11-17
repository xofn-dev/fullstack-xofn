# USER_FLOWS.md — XofN

> **Tujuan dokumen:** mendefinisikan alur pengguna yang wajib berjalan, lengkap dengan langkah, error, edge case, dan state UI. Setiap perubahan UI atau logika harus menjaga alur ini.
>
> **Sumber kebenaran:**
> - Peran chain dan lifecycle dua tahap → `deployguide-xofn.md`.
> - Perilaku lainnya → `brief-xofn.md`.
> - Tampilan → `xofn-coinfall-v8-galaxy.html`.
> - Detail teknis → `ARCHITECTURE.md`.
>
> **Label:**
> - **[Brief]** — dari brief
> - **[Guide]** — dari deploy guide
> - **[Desain]** — dari HTML
> - **[Phase 0]** — fakta riset
> - **[Usulan]** — dari dokumen ini
> - **[Belum]** — butuh keputusan
>
> **Mode aplikasi** (`ARCHITECTURE.md` §10.4):
> - `preview` — default, tanpa transaksi
> - `simulation` — Anvil lokal, Phase 3–4
> - `live` — Phase 6–7, **FROZEN**
>
> **Peran chain:** Robinhood = home; Base & Arbitrum = ekspansi (hub lewat Robinhood).
>
> **Dokumen terkait:** `PRD.md` §5–6, `DESIGN_SYSTEM.md` §5–6, `CLAUDE.md`.

---

## 1. Peran

| Peran | Wallet? | Bisa melakukan |
|---|---|---|
| **Pengunjung** | Tidak | Menjelajah landing, melihat token, XofN Check, membuka `/contracts` dan `/proof` |
| **Trader** | Ya | Buy/sell di curve atau pool Robinhood; bridge setelah token Locked |
| **Creator** | Ya | Launch token di Robinhood (satu tanda tangan) |
| **Pemanggil graduation** | Ya (siapa saja) | `graduate()` saat ambang tercapai (menerima insentif tetap) |
| **Pemanggil ekspansi** | Ya (siapa saja, P31) | `expandAndLock(token)` untuk token Graduated (membayar fee LZ); `retryRemote(eid)` bila ada chain gagal |
| **Builder / aggregator** | — | Memanggil `XofNRegistry.verify(token)` on-chain (di luar UI) |
| **Owner infra (Safe 2-of-3)** | Safe | Mengelola label DVN dan daftar putih untuk token **baru**; **tidak ada UI admin** di aplikasi [Usulan] |

---

## 2. Peta navigasi

```
/  (landing: hero → … → explore → check → inside → security → graduation → launch → bridge → proof → contracts → CTA)
├─ /launch                       ──(sukses)──► /t/[address]
├─ /t/[address]                  ◄── klik TokenCard (Explore / /)
│    ├─ panel trade (curve | pool Robinhood)
│    ├─ panel graduation (tahap 1: Graduate)
│    ├─ panel ekspansi (tahap 2: Expand & lock, progres per chain, Retry)
│    └─ TierBadge ► DvnList (popover/drawer)
├─ /check                        ──(submit)──► /check/[chain]/[address]
│                                               └─ Share ► gambar kartu (OG)
├─ /bridge
├─ /contracts
└─ /proof
Nav (semua halaman): Explore · Check · Launch · Bridge · Proof · Contracts · [Connect Wallet]
Mobile (≤900px): tombol ☰ → panel link (wajib ada)
```

---

## 3. Flow A — Jelajah landing & token

**Langkah**
1. Pengguna membuka `/`. Hero muncul dengan intro motion, dan scene 3D Coinfall dimuat lazy (fallback statis tampil lebih dulu).
2. Scroll melewati Vision, Thesis, Architecture (pilih stasiun, ganti mode kamera, tur), Manifesto, dan seterusnya.
3. Di **Explore**, filter All / Bonding / Graduated / Locked (toggle `aria-pressed`) memperbarui grid.
4. Klik atau Enter pada TokenCard:
   - `preview` → drawer detail demo;
   - `simulation` / `live` → navigasi ke `/t/[address]`.
5. Klik TierBadge di kartu → DvnList. Untuk token yang belum diekspansi, DvnList menjelaskan "Tier committed — DVN configuration is applied at expansion."

**Error & edge case**
| Kasus | Perilaku |
|---|---|
| WebGL tidak tersedia / import gagal | Fallback statis (CSS koin + gate, blueprint 6 modul, bintang 2D); konten tetap lengkap |
| `prefers-reduced-motion` | Tanpa animasi, Lenis, maupun parallax; 3D satu frame statis; reveal langsung terlihat |
| Belum ada token nyata | Grid berisi contoh berlabel FICTIONAL + catatan "INTERFACE DEMO" [Desain] |
| Filter kosong | EmptyState: "No tokens in this state yet." |
| Mobile ≤860 | Galaxy WebGL mati (D5); hero canvas bertumpuk di bawah copy |

---

## 4. Flow B — Connect wallet & network

**Langkah**
1. Klik **Connect Wallet**.
   - `isWeb3Configured = false` atau mode `preview` → modal penjelasan "preview only" (teks HTML), tanpa koneksi.
   - Selain itu, modal AppKit terbuka.
2. Setelah terhubung, alamat tampil ringkas di nav.
3. Aksi yang butuh chain tertentu memeriksa network:
   - launch, trade curve/pool, `graduate()`, dan `expandAndLock` → **Robinhood**;
   - `retryRemote(eid)` → **Robinhood** (fungsi Graduator);
   - `retryCompose` (menjalankan ulang compose di endpoint) → chain tujuan yang gagal (Base atau Arbitrum);
   - bridge → chain asal.

   Bila salah, tampil **NetworkGuard** "Switch to <chain>" dengan nama chain dari registry.

**Error & edge case**
- Pengguna menolak koneksi → toast "Connection cancelled." Tidak ada perubahan state.
- Chain tidak didukung → tombol aksi dinonaktifkan + penjelasan.
- Wallet terputus di tengah alur → form tetap menyimpan input; aksi meminta koneksi ulang.
- **Jangan pernah** meminta seed phrase atau private key. Copy modal mengingatkan hal ini [Desain].

---

## 5. Flow C — XofN Check

**Langkah**
1. Di `/check` (atau section Check di `/`), pengguna menempel alamat OFT dan memilih chain (Robinhood, Base, Arbitrum).
2. Validasi klien memastikan format `0x` + 40 hex, lalu alamat di-lowercase.
3. Submit → navigasi ke `/check/[chain]/[address]`. Halaman (RSC) memanggil logika Check:
   1. **Cache Supabase.** Bila segar (TTL, P20), langsung ditampilkan.
   2. **Bila basi**, baca RPC:
      - `owner()` dan `endpoint.delegates()`;
      - daftar peer lewat pemindaian `peers(eid)` (OFT API hanya pelengkap dan tidak memuat Robinhood [Phase 0]);
      - per pathway dan per arah: library (+ apakah default, `receiveLibraryTimeout`) serta `getConfig` ULN + executor (efektif dan mentah).
   3. Hitung label per pathway, lalu label keseluruhan (yang terburuk).
   4. Untuk token XofN, tambahkan status lifecycle dan hasil `verify` / `verifyEid`.
   5. Simpan ke cache, kemudian render.
4. **Hasil** menampilkan:
   - badge (mis. `2+1/2` efektif, atau `1-of-1`);
   - owner/delegate dan status besar;
   - kv-grid;
   - daftar pathway dengan label warna;
   - "Checked at <UTC>";
   - tombol **Re-check** (dibatasi rate limit).
5. **Share** → salin URL. Pratinjau kartu dari `opengraph-image`. Bila didukung, tersedia tombol "Post on X" (intent URL).

**Sample (demo)**
- Dropdown sample (Standard locked / Fortress locked / 1-of-1 flagged) memakai data **simulasi** berlabel `SIMULATED EXAMPLE · NOT VERIFIED` [Desain].
- Sample tidak pernah dicampur dengan hasil nyata.

**Error & edge case**
| Kasus | Perilaku |
|---|---|
| Alamat tidak valid | Error inline: "Enter a valid EVM address (0x + 40 hex characters)." [Desain] |
| Alamat bukan kontrak / bukan OFT | "This address is not an OFT on <chain>." Tidak ada badge |
| RPC gagal (sebagian/total); RPC publik Robinhood dibatasi rate | Pathway terkait berstatus **NOT READ** dengan pesan jujur. **Tidak ada nilai tebakan** [Brief: fakta, bukan tuduhan] |
| Pathway ke chain di luar daftar baca (P19) | Ditampilkan sebagai "Pathway to <EID> — not read in MVP" |
| Masih memakai library/config default | Ditandai "Uses default config (can change)". Tidak memenuhi syarat "locked" |
| DVN pathway = Dead DVN | Label **BLOCKED** + penjelasan "No verifier configured; messages cannot be delivered" |
| Kontrak adalah proxy dengan admin | Tidak pernah diberi label "locked" |
| Ditemukan 1-of-1 | Label merah **1-OF-1** + penjelasan netral, tanpa kata *unsafe* |
| Token XofN dengan konfigurasi menyimpang | Status **CHANGED** (merah) di Check dan di `/t/[address]` |
| Hasil Check ternyata salah | Perbaiki, tampilkan koreksi dengan waktu cek baru, kabari tim token [Guide §9] |
| Mode `preview` tanpa RPC terkonfigurasi | Pesan "Live check unavailable — no RPC connection. No result will be fabricated." [Desain] |

---

## 6. Flow D — Launch token

**Langkah**
1. `/launch`: isi nama (≤32), ticker (2–12 alfanumerik, otomatis uppercase), dan logo (gambar ≤3 MB, preview lokal).
2. Pilih tier (radiogroup):
   - **Standard** `XofN 2+1/2` (default);
   - **Fortress** `XofN 3+1/2`.
3. Pilih chain ekspansi (Base, Arbitrum; minimal satu). Pilihan ini **diterapkan saat ekspansi** (tahap 2), bukan saat launch.
   - Bila pathway Robinhood↔chain itu tidak memenuhi Fortress, Fortress dinonaktifkan **untuk chain itu**, dengan alasan tertulis.
   - Kombinasi yang tidak valid tidak bisa dikirim.
4. Ringkasan:
   - supply 999,000,000 FIXED, home **Robinhood**, token OFT;
   - perkiraan biaya per pesan Standard vs Fortress (quote). Sebelum ada quote: **"NOT QUOTED"**;
   - ambang graduation dari parameter (P8);
   - catatan: "Graduation happens on Robinhood first. Expansion and locking are a separate step."
5. Klik **Review launch configuration** → modal ringkasan → **Sign on Robinhood**.
6. Satu tanda tangan di Robinhood. UI menampilkan status "Confirm in wallet…", lalu "Pending…" beserta tautan tx (Blockscout).
7. Setelah sukses, redirect ke **`/t/[address]`** dengan badge `XofN 2+1/2 · Bonding` dan progres 0%.

**Mode**
- `preview` → langkah 5 berakhir di modal "Launch configuration preview — no transaction" [Desain].
- `simulation` → tx ke Anvil lokal.

**Error & edge case**
- Field kosong atau tidak valid → `error-msg` (`aria-live`) dengan teks HTML.
- Ditolak di wallet → kembali ke form, input tetap ada.
- Tx revert (mis. tier tidak valid) → pesan dari reason; tidak redirect.
- Logo gagal diunggah (P26) → launch tetap bisa jalan dengan glyph default; peringatan ditampilkan.
- **1-of-1 tidak pernah bisa dipilih** dan tidak ada opsi untuk itu.

---

## 7. Flow E — Trading di curve & progres

**Langkah**
1. `/t/[address]`: toggle **Buy / Sell**, input jumlah, quote (harga, slippage, minimum diterima).
2. Network guard memastikan Robinhood. Tanda tangan → pending → selesai, lalu chart dan progres diperbarui (polling / react-query).
3. Progres bar menunjukkan posisi menuju ambang graduation.
4. Setelah graduation, trading berpindah ke pool Robinhood (bukan curve).

**Error & edge case**
- Slippage terlampaui → revert dengan pesan jelas. Pengguna bisa menyesuaikan slippage.
- Saldo kurang → tombol nonaktif + pesan.
- Ambang tercapai di tengah transaksi → curve menolak trading lanjutan sesuai kontrak, dan UI berpindah ke panel Graduation.
- Fee curve: P17 (sementara tidak ada).
- `preview` → "Trading requires a live launch" [Desain].

---

## 8. Flow F — Graduation & ekspansi

### 8.1 Flow F.1 — Graduate (tahap 1, lokal di Robinhood)
**Langkah**
1. Saat ambang tercapai, tombol **Graduate** muncul untuk **siapa pun** [Brief]. UI menampilkan insentif pemanggil (tetap, P15).
2. Tanda tangan `graduate()` di Robinhood.
3. Panel menampilkan `Robinhood pool created` beserta tautan tx.
4. Badge berubah menjadi **`XofN 2+1/2 · Graduated · awaiting expansion`** [Guide]. Penjelasan singkat di UI:
   - "Tier committed. Owner and delegate are still the XofN Graduator contract until expansion completes."
   - `verify()` = false (ditampilkan sebagai fakta, bukan peringatan).

**Error & edge case**
| Kasus | Perilaku |
|---|---|
| Ambang belum tercapai | Tombol tidak tampil; progres tetap |
| Sudah di-graduate orang lain | Tombol hilang; status langsung Graduated (graduate hanya sekali) |
| `preview` | Panel graduation demo [Desain] dengan label "concept" |

### 8.2 Flow F.2 — Expand & lock (tahap 2: Robinhood → Base, Arbitrum)
**Langkah**
1. Untuk token **Graduated**, tombol **Expand & lock** muncul (siapa pun boleh memanggil, P31). UI menampilkan:
   - chain tujuan (pilihan creator saat launch);
   - fee LayerZero total dari `quoteSend`, dibayar pemanggil [Guide].
2. Tanda tangan `expandAndLock(token)` di Robinhood. Status menjadi **Expanding**.
3. Panel progres **per chain** (Base, lalu Arbitrum):
   - `Token deployed`
   - `Pathway configured` (library, ULN, executor, options, peer)
   - `Liquidity sent`
   - `Pool created` (compose)
   - `Locked`
   - Final: `All chains verified` → **Locked**

   Urutan `Pathway configured` sebelum `Liquidity sent` mengikuti rekomendasi Phase 0 (P28). Bila PM memutuskan lain, panel mengikuti keputusan itu.
4. Setiap langkah menampilkan status (`pending` / `ok` / `failed`), tautan tx, dan tautan LayerZero Scan untuk pesan LZ.
5. Bila sebuah langkah gagal, tombol **Retry** muncul **untuk chain itu**. `retryRemote(eid)` mengulang langkah yang sama dengan parameter yang sama; pemanggil membayar fee (P14).
6. Status berubah menjadi **Locked** hanya setelah `verify` bernilai true di Registry **semua** chain [Brief + Guide].

**Error & edge case**
| Kasus | Perilaku |
|---|---|
| Token belum Graduated | Tombol Expand & lock tidak tampil |
| Infrastruktur Fase 2 belum aktif (mis. Phase 6/1b, sebelum 2a/2b) | Tombol nonaktif + "Expansion opens in a later release" (tanpa janji tanggal) |
| Pesan LZ tertunda lama | Langkah tetap `pending` dengan tautan Scan + catatan "Cross-chain delivery can take several minutes" |
| Compose gagal (gas/revert) | Langkah `Pool created` = failed + Retry (`retryCompose`, P3). Tidak ada pembuatan pool manual oleh tim [Guide §9] |
| Satu chain sukses, satu gagal | Status keseluruhan **Expanding** (bukan Locked); hanya chain gagal yang punya Retry |
| Fortress tidak tersedia di satu pathway | Tidak diturunkan diam-diam; UI menjelaskan; chain itu tidak diekspansi dengan tier lebih rendah [Guide §9] |
| `verify()` false untuk token yang tercatat Locked | Badge otomatis **CHANGED** (merah) + tautan penjelasan [Guide §9] |
| `preview` | Panel ekspansi demo 5 langkah [Desain] dengan label "concept" |

---

## 9. Flow G–I

### 9.1 Flow G — Halaman token (`/t/[address]`)
1. **Header:** nama, ticker, logo, TierBadge + status lifecycle.
2. **Bagian utama:** chart, panel trade (curve sebelum graduation, pool Robinhood setelahnya), panel graduation (F.1), dan panel ekspansi (F.2).
3. **Security:**
   - daftar DVN per pathway (DvnList), yang setelah ekspansi berisi konfigurasi nyata, dan sebelumnya berisi rencana tier;
   - owner/delegate per chain;
   - hasil **`verify()` live** per chain dengan "checked at".
4. **Supply per chain:** jumlah semua chain selalu 999,000,000 (ditampilkan sebagai invariant).

Edge case:
- Konfigurasi menyimpang → **Changed** (merah) + penjelasan pathway yang berbeda.
- Alamat bukan token XofN → arahkan ke `/check/[chain]/[address]`.

### 9.2 Flow H — Bridge (`/bridge`)
1. Pilih token (hanya token **Locked**). Token Bonding/Graduated/Expanding diblokir dengan penjelasan "Bridging opens after expansion is locked".
2. Pilih chain asal/tujuan (tombol ↕ untuk menukar) dan jumlah.
   - Rute langsung: Robinhood ↔ Base, Robinhood ↔ Arbitrum.
   - Base ↔ Arbitrum lewat Robinhood (dua langkah; UI menjelaskan, P29).
3. **`quoteSend` tepat sebelum `send`** [Brief]. Ringkasan menampilkan fee pesan, jumlah diterima, dan **dust**: "Amounts below 0.000001 stay in your wallet" [Brief].
4. Network guard di chain asal → tanda tangan → tautan **LayerZero Scan** → status terkirim/diterima.

Edge case:
- Asal = tujuan → error "Choose two different chains." [Desain]
- Jumlah ≤0 → error.
- Quote kedaluwarsa sebelum tanda tangan → quote ulang otomatis.
- Fee berubah besar → minta konfirmasi ulang.
- `preview` → modal "Bridge route — preview only" [Desain].

### 9.3 Flow I — Contracts & Proof
- `/contracts`: tabel kontrak **per chain** (Robinhood: Graduator, Curve implementation, Registry; Base/Arbitrum: Remote, Registry) dari `deployments/<network>.json`.
  - Sebelum deploy: "Not published" + PLANNED [Desain].
  - Sesudahnya: alamat, tautan explorer (Blockscout untuk Robinhood), owner (Safe), dan status Verified.
- `/proof`:
  - checklist invariant `verify()`;
  - milestone fase (1a / 1b / 2a / 2b, status per `PRD.md` §8);
  - daftar bukti dari `proof/YYYY-MM-DD-<milestone>/notes.md`;
  - laporan audit (setelah ada).
- Item yang belum terpenuhi tampil sebagai NOT DEPLOYED / NOT VERIFIED / PLANNED, **tidak** dengan centang.

---

## 10. Konflik desain vs brief/guide / kode yang perlu keputusan

| # | Konflik | Rekomendasi |
|---|---|---|
| F1 | HTML hanya landing satu halaman, sedangkan brief mendefinisikan 8 route | Halaman aplikasi disusun dari komponen section (`DESIGN_SYSTEM.md` §6.2, P24) |
| F2 | HTML menampilkan Check demo; brief meminta Check nyata | Phase 2: Check nyata menjadi default; sample tetap tersedia dengan label simulasi |
| F3 | Teks HTML "Google Cloud* required" vs fakta Phase 0 (Google tidak ada di Robinhood) | Tampilkan operator aktual per pathway dari `config/tiers.json` setelah P1 diputuskan. Sebelum itu: F10 |
| F4 | HTML: Graduate/Retry tidak ada; brief/guide: tombol untuk siapa pun, lifecycle dua tahap, Retry per chain | Tambah panel Graduate (F.1) dan Expand & lock (F.2) di `/t/[address]` |
| F5 | HTML: "Connect Wallet" hanya modal; brief: semua tx di wallet pengguna | Mode `preview` = modal; `simulation`/`live` = AppKit |
| F6 | Brief/guide: status Terkunci/Berubah/Lulus menunggu ekspansi; HTML: Locked; Changed dan Graduated belum ada | Copy Inggris: Bonding / Graduated · awaiting expansion / Expanding / Locked / Changed (P25). "Expanding" adalah [Usulan], bukan status dari guide |
| F7 | HTML menempatkan Base sebagai home ("HOME CHAIN · MVP BASE") dan Robinhood sebagai ekspansi; guide membaliknya | Copy dan 3D mengikuti guide: home = Robinhood (D15). Base/Arbitrum tampil sebagai "EXPANSION · PLANNED" |
| F8 | Urutan ekspansi di brief/guide (likuiditas sebelum resep) tidak bisa dijalankan [Phase 0] | **Diputuskan owner 17 Nov 2026 (P28): resep sebelum likuiditas.** Panel progres F.2 memakai urutan itu. Catatan Phase 3 untuk UI: `Token deployed` dan `Pathway configured` terjadi di pesan yang sama; `Pool created` dan `Locked` (chain ekspansi) terjadi di satu `lzCompose` |
| F9 | HTML memakai narasi "omnichain" sebagai fitur; guide melarang klaim "Omnichain" sebelum Fase 2b | Copy omnichain di landing berlabel "planned" sampai tahap 2 live (`DESIGN_SYSTEM.md` §10.2a) |
| F10 | HTML menyebut Google Cloud dan Polyhedra sebagai operator wajib (section Security, sampel Check, footnote); Phase 0: keduanya tidak tersedia di pathway Robinhood, dan P1 belum diputuskan | Selama P1 terbuka, landing menampilkan jumlah DVN tanpa nama operator pengganti (D17) |

---

## 11. Status UI per flow

| Flow | `preview` | `simulation` | `live` |
|---|---|---|---|
| A Jelajah landing | **Selesai** (Phase 1, 17 Nov 2026). Langkah 5 (TierBadge → DvnList) dibuat bersama halaman aplikasi; di landing penjelasan tier ada di drawer | **Selesai** (Phase 4, 17 Nov 2026): Explore membaca `/api/tokens`, filter D16, kartu menuju `/t/[address]`, keadaan kosong/gagal baca | FROZEN |
| B Wallet & network | **Selesai** (Phase 1–4): tombol Connect membuka modal "preview only" | **Selesai** (Phase 4): AppKit bila `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` diisi (kode ada, **belum teruji** tanpa project ID) + konektor "Anvil dev account" khusus jaringan lokal (P56); NetworkGuard per aksi. Di Anvil ketiga chain ber-ID 31337, jadi "Switch to <chain>" tidak pernah muncul | FROZEN |
| C XofN Check | **Selesai** (Phase 2, 17 Nov 2026): `/check` dan `/check/[chain]/[address]` membaca chain, cache 15 menit, Re-check, Share + kartu OG; sampel di landing tetap berlabel simulasi | **Selesai** (Phase 4): Check membaca Anvil (endpoint tiruan dari manifest, tanpa Multicall3) dan menampilkan `verify()` Registry + tautan ke halaman token | FROZEN (rilis publik di Fase 1b) |
| D Launch | **Pratinjau** (Phase 1); `/launch` memakai form pratinjau yang sama | **Selesai** (Phase 4): validasi = aturan kontrak, tier per chain dari `tierAvailable`, gerbang registrar (P52), modal review → tanda tangan → redirect `/t/[address]`. Logo hanya hash (P26) | FROZEN |
| E Trading | Halaman token tidak tersedia ("TOKEN PAGES ARE NOT LIVE") | **Selesai** (Phase 4): buy/sell curve dengan quote, slippage, minimum diterima, approve sebelum sell; setelah graduation trading di pool AMM **tiruan** (tanpa batas slippage on-chain, berlabel) | FROZEN |
| F.1 Graduate | — | **Selesai** (Phase 4): tombol muncul saat ambang tercapai + caller reward; setelahnya "Robinhood Chain pool created", owner/delegate tetap Graduator, `verify()` false sebagai fakta | FROZEN (Fase 1) |
| F.2 Expand & lock | — | **Selesai** (Phase 4): fee `quoteExpandAndLock` berlabel SIMULATION QUOTE, 5 langkah per chain (F8), Retry (`retryRemote`), `reAck`, kontrol relay lokal berlabel SIMULATION; Locked hanya bila `verify()` true di semua chain. `retryCompose`: builder ada, **tidak teruji** (relay lokal tidak meninggalkan compose gagal) dan belum ada tombolnya | FROZEN (Fase 2) |
| G Halaman token | Pesan "not live" | **Selesai** (Phase 4): badge + status, chart dari trade, tabel keamanan per chain (owner, delegate, supply, `verify()`, checked at), invariant 999M, DvnList per pathway (D17) | FROZEN |
| H Bridge | **Pratinjau** (Phase 1); `/bridge` memakai widget pratinjau | **Selesai** (Phase 4): hanya token Locked, ↕, hub dua langkah, dust, `quoteSend` tepat sebelum `send`, konfirmasi ulang bila fee naik >10%. Tautan LayerZero Scan belum ada (tidak ada di Anvil) | FROZEN (Fase 2) |
| I Contracts & Proof | `/contracts` dan `/proof`: semua NOT DEPLOYED / PLANNED | **Selesai** (Phase 4): `/contracts` dari manifest ("LOCAL SIMULATION ONLY · SOURCE NOT VERIFIED"), `/proof` checklist `verify()`, milestone PLANNED, batas P38/P13/P45 | FROZEN |

Perbarui tabel ini di akhir setiap task yang menyentuh sebuah flow.
