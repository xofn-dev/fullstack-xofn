# USER_FLOWS.md — XofN

> **Tujuan dokumen:** mendefinisikan alur pengguna yang wajib berjalan, lengkap dengan langkah, error, edge case, dan state UI. Setiap perubahan UI atau logika harus menjaga alur ini.
>
> **Sumber kebenaran:**
> - Perilaku → `brief-xofn.md`.
> - Tampilan → `xofn-coinfall-v8-galaxy.html`.
> - Detail teknis → `ARCHITECTURE.md`.
>
> **Label:**
> - **[Brief]** — dari brief
> - **[Desain]** — dari HTML
> - **[Usulan]** — dari dokumen ini
> - **[Belum]** — butuh keputusan
>
> **Mode aplikasi** (`ARCHITECTURE.md` §10.4):
> - `preview` — default, tanpa transaksi
> - `simulation` — Anvil lokal, Phase 3–4
> - `live` — Phase 6–7, **FROZEN**
>
> **Dokumen terkait:** `PRD.md` §5–6, `DESIGN_SYSTEM.md` §5–6, `CLAUDE.md`.

---

## 1. Peran

| Peran | Wallet? | Bisa melakukan |
|---|---|---|
| **Pengunjung** | Tidak | Menjelajah landing, melihat token, XofN Check, membuka `/contracts` dan `/proof` |
| **Trader** | Ya | Buy/sell di curve atau pool, bridge setelah graduation |
| **Creator** | Ya | Launch token di Base (satu tanda tangan) |
| **Pemanggil graduation** | Ya (siapa saja) | `graduate()` saat ambang tercapai; `retryRemote(eid)` bila ada chain gagal |
| **Builder / aggregator** | — | Memanggil `XofNRegistry.verify(token)` on-chain (di luar UI) |
| **Owner infra (Safe 2-of-3)** | Safe | Mengelola daftar putih DVN dan label operator; **tidak ada UI admin** di aplikasi [Usulan] |

---

## 2. Peta navigasi

```
/  (landing: hero → … → explore → check → inside → security → graduation → launch → bridge → proof → contracts → CTA)
├─ /launch                       ──(sukses)──► /t/[address]
├─ /t/[address]                  ◄── klik TokenCard (Explore / /)
│    ├─ panel trade (curve | pool)
│    ├─ panel graduation (per chain, Retry)
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
3. Di **Explore**, filter All / Bonding / Locked (toggle `aria-pressed`) memperbarui grid.
4. Klik atau Enter pada TokenCard:
   - `preview` → drawer detail demo;
   - `simulation` / `live` → navigasi ke `/t/[address]`.
5. Klik TierBadge di kartu → DvnList.

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
3. Aksi yang butuh chain tertentu (launch & trade curve di Base; bridge di chain asal) memeriksa network. Bila salah, tampil **NetworkGuard** "Switch to <chain>" dengan nama chain dari registry.

**Error & edge case**
- Pengguna menolak koneksi → toast "Connection cancelled." Tidak ada perubahan state.
- Chain tidak didukung → tombol aksi dinonaktifkan + penjelasan.
- Wallet terputus di tengah alur → form tetap menyimpan input; aksi meminta koneksi ulang.
- **Jangan pernah** meminta seed phrase atau private key. Copy modal mengingatkan hal ini [Desain].

---

## 5. Flow C — XofN Check

**Langkah**
1. Di `/check` (atau section Check di `/`), pengguna menempel alamat OFT dan memilih chain.
2. Validasi klien memastikan format `0x` + 40 hex, lalu alamat di-lowercase.
3. Submit → navigasi ke `/check/[chain]/[address]`. Halaman (RSC) memanggil logika Check:
   1. **Cache Supabase.** Bila segar (TTL, P20), langsung ditampilkan.
   2. **Bila basi**, baca RPC: `owner()`, `endpoint.delegates()`, daftar peer (OFT API atau pindai `peers(eid)`), lalu per pathway dan per arah: library (+ apakah default) serta `getConfig` ULN + executor.
   3. Hitung label per pathway, lalu label keseluruhan (yang terburuk).
   4. Untuk token XofN, tambahkan hasil `verify` / `verifyEid`.
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
| RPC gagal (sebagian/total) | Pathway terkait berstatus **NOT READ** dengan pesan jujur. **Tidak ada nilai tebakan** [Brief: fakta, bukan tuduhan] |
| Pathway ke chain di luar daftar baca (P19) | Ditampilkan sebagai "Pathway to <EID> — not read in MVP" |
| Masih memakai library/config default | Ditandai "Uses default config (can change)". Tidak memenuhi syarat "locked" |
| Ditemukan 1-of-1 | Label merah **1-OF-1** + penjelasan netral, tanpa kata *unsafe* |
| Token XofN dengan konfigurasi menyimpang | Status **CHANGED** (merah) di Check dan di `/t/[address]` |
| Mode `preview` tanpa RPC terkonfigurasi | Pesan "Live check unavailable — no RPC connection. No result will be fabricated." [Desain] |

---

## 6. Flow D — Launch token

**Langkah**
1. `/launch`: isi nama (≤32), ticker (2–12 alfanumerik, otomatis uppercase), dan logo (gambar ≤3 MB, preview lokal).
2. Pilih tier (radiogroup):
   - **Standard** `XofN 2+1/2` (default);
   - **Fortress** `XofN 3+1/2`.
3. Pilih chain ekspansi (Arbitrum, Robinhood; minimal satu).
   - Bila pathway sebuah chain tidak memenuhi 3 operator, Fortress dinonaktifkan **untuk chain itu**, dengan alasan tertulis [Brief].
   - Kombinasi yang tidak valid tidak bisa dikirim.
4. Ringkasan:
   - supply 999,000,000 FIXED, home Base;
   - perkiraan biaya per pesan Standard vs Fortress (quote). Sebelum ada quote: **"NOT QUOTED"**;
   - ambang graduation dari parameter (P8).
5. Klik **Review launch configuration** → modal ringkasan → **Sign on Base**.
6. Satu tanda tangan di Base. UI menampilkan status "Confirm in wallet…", lalu "Pending…" beserta tautan tx.
7. Setelah sukses, redirect ke **`/t/[address]`** dengan status **Bonding** dan progres 0%.

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
2. Network guard memastikan Base. Tanda tangan → pending → selesai, lalu chart dan progres diperbarui (polling / react-query).
3. Progres bar menunjukkan posisi menuju ambang graduation.

**Error & edge case**
- Slippage terlampaui → revert dengan pesan jelas. Pengguna bisa menyesuaikan slippage.
- Saldo kurang → tombol nonaktif + pesan.
- Ambang tercapai di tengah transaksi → curve menolak trading lanjutan sesuai kontrak, dan UI berpindah ke panel Graduation.
- Fee curve: P17 (sementara tidak ada).
- `preview` → "Trading requires a live launch" [Desain].

---

## 8. Flow F — Graduation (siapa pun)

**Langkah**
1. Saat ambang tercapai, tombol **Graduate** muncul untuk **siapa pun** [Brief]. UI menampilkan:
   - fee LayerZero total (quote);
   - insentif pemanggil (tetap, P15).
2. Tanda tangan `graduate()` di Base.
3. Panel progres **per chain** [Brief]:
   - Base: `Base pool created`
   - Arbitrum: `Token deployed` → `Liquidity sent` → `Pool created` → `Locked`
   - Robinhood: urutan yang sama
   - Final: `All chains verified` → **Locked**
4. Setiap langkah menampilkan status (`pending` / `ok` / `failed`), tautan tx, dan tautan LayerZero Scan untuk pesan LZ.
5. Bila sebuah langkah gagal, tombol **Retry** muncul **untuk chain itu**. `retryRemote(eid)` mengulang langkah yang sama dengan parameter yang sama; pemanggil membayar fee (P14).
6. Status berubah menjadi **Locked** hanya setelah `verify` bernilai true di **semua** chain [Brief].

**Error & edge case**
| Kasus | Perilaku |
|---|---|
| Ambang belum tercapai | Tombol tidak tampil; progres tetap |
| Sudah di-graduate orang lain | Tombol hilang; panel progres tampil (graduate hanya sekali) |
| Pesan LZ tertunda lama | Langkah tetap `pending` dengan tautan Scan + catatan "Cross-chain delivery can take several minutes" |
| Compose gagal (gas/revert) | Langkah `Pool created` = failed + Retry (`retryCompose`, P3) |
| Satu chain sukses, satu gagal | Status keseluruhan **Graduating** (bukan Locked); hanya chain gagal yang punya Retry |
| `preview` | Panel graduation demo 5 langkah [Desain] dengan label "concept" |

---

## 9. Flow G–I

### 9.1 Flow G — Halaman token (`/t/[address]`)
1. **Header:** nama, ticker, logo, TierBadge + status.
2. **Bagian utama:** chart, panel trade (curve sebelum graduation, pool setelahnya), dan panel graduation.
3. **Security:** daftar DVN per pathway (DvnList), owner/delegate per chain, dan hasil **`verify()` live** per chain dengan "checked at".
4. **Supply per chain:** jumlah ketiganya selalu 999,000,000 (ditampilkan sebagai invariant).

Edge case:
- Konfigurasi menyimpang → **Changed** (merah) + penjelasan pathway yang berbeda.
- Alamat bukan token XofN → arahkan ke `/check/[chain]/[address]`.

### 9.2 Flow H — Bridge (`/bridge`)
1. Pilih token (hanya token **Locked**; token Bonding diblokir dengan penjelasan "Bridging opens after graduation").
2. Pilih chain asal/tujuan (tombol ↕ untuk menukar) dan jumlah.
3. **`quoteSend` tepat sebelum `send`** [Brief]. Ringkasan menampilkan fee pesan, jumlah diterima, dan **dust**: "Amounts below 0.000001 stay in your wallet" [Brief].
4. Network guard di chain asal → tanda tangan → tautan **LayerZero Scan** → status terkirim/diterima.

Edge case:
- Asal = tujuan → error "Choose two different chains." [Desain]
- Jumlah ≤0 → error.
- Quote kedaluwarsa sebelum tanda tangan → quote ulang otomatis.
- Fee berubah besar → minta konfirmasi ulang.
- `preview` → modal "Bridge route — preview only" [Desain].

### 9.3 Flow I — Contracts & Proof
- `/contracts`: tabel 5 kontrak per chain dari manifest. Sebelum deploy: "Not published" + PLANNED [Desain]. Sesudahnya: alamat + tautan explorer + status Verified.
- `/proof`:
  - checklist invariant `verify()`;
  - milestone phase (status per `PRD.md` §8);
  - daftar bukti dari `proof/YYYY-MM-DD-<milestone>/notes.md`;
  - laporan audit (setelah ada).
- Item yang belum terpenuhi tampil sebagai NOT DEPLOYED / NOT VERIFIED / PLANNED, **tidak** dengan centang.

---

## 10. Konflik desain vs brief / kode yang perlu keputusan

| # | Konflik | Rekomendasi |
|---|---|---|
| F1 | HTML hanya landing satu halaman, sedangkan brief mendefinisikan 8 route | Halaman aplikasi disusun dari komponen section (`DESIGN_SYSTEM.md` §6.2, P24) |
| F2 | HTML menampilkan Check demo; brief meminta Check nyata | Phase 2: Check nyata menjadi default; sample tetap tersedia dengan label simulasi |
| F3 | Teks HTML "Google Cloud* required" vs brief "Google Cloud (atau Polyhedra)" | Tampilkan operator aktual per pathway dari daftar putih (P18) |
| F4 | HTML: Graduate/Retry tidak ada; brief: tombol untuk siapa pun + Retry per chain | Tambah di `/t/[address]` (Flow F) |
| F5 | HTML: "Connect Wallet" hanya modal; brief: semua tx di wallet pengguna | Mode `preview` = modal; `simulation`/`live` = AppKit |
| F6 | Brief: status Terkunci/Berubah; HTML: Locked; Changed belum ada | Copy Inggris Bonding / Locked / Changed (P25) |
| F7 | HTML menyebut "Robinhood" sebagai chip ekspansi; pathway DVN-nya belum diverifikasi | Tetap tampil dengan label PLANNED sampai Phase 0 selesai |

---

## 11. Status UI per flow

| Flow | `preview` | `simulation` | `live` |
|---|---|---|---|
| A Jelajah landing | Belum mulai | Belum mulai | FROZEN |
| B Wallet & network | Belum mulai | Belum mulai | FROZEN |
| C XofN Check | Belum mulai (Check nyata hanya membaca, berlaku di semua mode) | — | FROZEN (klaim "live di mainnet") |
| D Launch | Belum mulai | Belum mulai | FROZEN |
| E Trading | Belum mulai | Belum mulai | FROZEN |
| F Graduation | Belum mulai | Belum mulai | FROZEN |
| G Halaman token | Belum mulai | Belum mulai | FROZEN |
| H Bridge | Belum mulai | Belum mulai | FROZEN |
| I Contracts & Proof | Belum mulai | Belum mulai | FROZEN |

Perbarui tabel ini di akhir setiap task yang menyentuh sebuah flow.
