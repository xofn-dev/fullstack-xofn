# Phase 2 — XofN Check nyata (read-only)

- **Tanggal:** 17 Nov 2026
- **Branch:** `phase-2/xofn-check` (bercabang dari `phase-1/foundation-landing`)
- **Status:** selesai; menunggu persetujuan gerbang.
- **Sifat pekerjaan:** membaca chain lewat RPC publik (`eth_call`, `eth_getCode`, `eth_getStorageAt`). Tidak ada wallet, key, transaksi, atau deploy. Migrasi Supabase hanya berupa file lokal; tidak ada yang di-push.

## Indeks bukti

| File | Satu kalimat konteks |
|---|---|
| [raw/gate-20-oft.md](raw/gate-20-oft.md) | Gerbang Phase 2: hasil XofN Check untuk 24 OFT nyata (33 pathway) dibandingkan dengan pembacaan manual `cast`; 33 dari 33 cocok. |
| [raw/scan-labels.txt](raw/scan-labels.txt) | Pemindaian 84 OApp Robinhood dan 58 OFT Base lewat Check, untuk mencari contoh nyata tiap label. |
| [shots/01-check-result-1of1-1280.jpg](shots/01-check-result-1of1-1280.jpg) | Halaman hasil untuk satu OFT dengan pathway 1-of-1: label merah, kalimat netral, owner/delegate, DVN, "Checked at". |
| [shots/02-check-result-2plus-1280.jpg](shots/02-check-result-2plus-1280.jpg) | Halaman hasil untuk OFT dengan dua pathway berlabel 2+. |
| [shots/03-check-result-390.jpg](shots/03-check-result-390.jpg) | Halaman hasil di 390px. |
| [shots/04-check-form-1280.jpg](shots/04-check-form-1280.jpg) | Halaman `/check` (form alamat + chain), dicapai lewat navigasi dari landing. |
| [shots/05-og-card.png](shots/05-og-card.png) | Kartu share (`opengraph-image`) dengan label per pathway dan "Checked at". |

## Gerbang Phase 2 (`PRD.md` §9.1)

| Kriteria | Status | Bukti |
|---|---|---|
| `/check/[chain]/[address]` membaca OFT nyata di Robinhood, Base, dan Arbitrum | **Terpenuhi** | 13 OFT Robinhood, 7 Base, 4 Arbitrum di `raw/gate-20-oft.md` |
| Hasil untuk 20 OFT populer cocok dengan pembacaan manual | **Terpenuhi** | 24 OFT, 33 pathway: owner, delegate, send ULN, receive ULN, dan status library default semuanya cocok |
| Contoh 1-of-1, 2+, dan 2+ terkunci tampil dengan label benar; Dead DVN berlabel "blocked" | **Terpenuhi sebagian** | 1-of-1 dan 2+: contoh nyata. **2+ terkunci dan blocked: tidak ada contoh nyata** di set tiga chain; keduanya hanya terbukti lewat tes unit (lihat di bawah) |
| Ada "checked at" dan cache; error RPC tidak memalsukan hasil | **Terpenuhi** | Cache 15 menit; hasil kedua dilayani dari cache; arah yang gagal dibaca berstatus NOT READ |
| Kartu share (OG image) bekerja | **Terpenuhi** | `shots/05-og-card.png` (HTTP 200, `image/png`) |
| Tes brief "XofN Check cocok dengan `getConfig` untuk 1-of-1, 2-of-2, dan 3+" | **Terpenuhi** | Tabel gerbang memuat 1+0/0, 2+0/0, 3+0/0, 4+0/0, 1+1/2, 4+1/1 |

Butir Phase 1 yang tertunda, **kebocoran WebGL saat navigasi bolak-balik**, sekarang teruji di browser: empat putaran landing ↔ `/check` lewat navigasi klien. Setiap kali meninggalkan landing, tiga konteks WebGL dilepas (`webglcontextlost` = jumlah yang dibuat); konteks hidup tidak pernah lebih dari tiga; 0 error konsol.

## Temuan dari pembacaan nyata (fakta, bukan penilaian terhadap token mana pun)

- Dari 84 OApp Robinhood yang tercatat di metadata LayerZero: 40 punya pathway berlabel 2+ ke Base/Arbitrum, 42 tidak punya peer ke kedua chain itu, 2 tidak terbaca (`peers()` gagal).
- Dari 58 OFT Base yang juga tercatat di Arbitrum: 48 berlabel 2+, 9 tanpa peer di set baca, **1 berlabel 1-of-1** (satu DVN wajib, tanpa opsional, owner dan delegate nol).
- **Tidak ada pathway nyata yang memenuhi "2+ & locked"** di set ini. Hampir semua OFT membiarkan jumlah DVN opsional pada nilai mentah 0 (= default), dan owner/delegate-nya bukan nol.
- Tidak ada OFT nyata yang memakai Dead DVN pada pathway ber-peer.

Akibatnya bukti brief "rekaman pemeriksaan 3 token (1-of-1, 2+, terkunci)" belum bisa dibuat dengan data nyata: contoh "terkunci" belum ada di Robinhood, Base, atau Arbitrum.

## Hasil pemeriksaan

| Pemeriksaan | Hasil |
|---|---|
| `npm run lint` | Lulus |
| `npm run typecheck` | Lulus |
| `npm run test` | Lulus: 4 file, 68 tes |
| `npm run build` | Lulus: `/check` statis; `/check/[chain]/[address]`, kartu OG, dan API dinamis |
| Konsol browser pada halaman hasil (1280 dan 390px) | 0 error; overflow horizontal 0 |
| Input tidak sah | chain tak dikenal, alamat salah, bukan kontrak, bukan OFT: masing-masing pesan sendiri, tanpa badge |
| Format error API | `{ error: { code, message } }` dengan status 400 / 404 / 429 / 502 / 503 |

Cakupan tes unit untuk label yang tidak punya contoh nyata:
- decoder ULN diuji dengan **bytes nyata** `endpoint.getConfig` (`tests/fixtures/get-config.json`), termasuk konfigurasi default Robinhood yang berisi Dead DVN → `blocked`;
- `2+ & locked` diuji dengan pembaca tiruan: owner 0, delegate 0, library eksplisit, tanpa field default;
- setiap penghalang "locked" diuji terpisah: owner/delegate bukan nol, owner tidak terbaca, library default, grace period receive library, field mentah 0, proxy beradmin;
- arah yang gagal dibaca tidak pernah menghasilkan 2+ atau locked; URL RPC tidak bocor ke pesan error.

## Keputusan yang dipakai (rekomendasi tertulis)

| # | Yang dipakai |
|---|---|
| P19 | Check membaca Robinhood, Base, Arbitrum. Deployment lain dari OFT API ditampilkan sebagai "not read in this version" |
| P20 | Cache 15 menit; Re-check paksa dibatasi 6 kali per menit per klien per token |
| D18 | NoticeBar preview menjadi `NO TOKEN SALE · CHECK READS PUBLIC CHAIN DATA` |
| F2 | Alamat nyata selalu dibawa ke Check nyata; sampel di landing tetap berlabel simulasi |

## Belum dikerjakan atau terbatas

| Hal | Keterangan |
|---|---|
| **Supabase lokal tidak dijalankan** | Docker tidak ada di mesin ini. Migrasi `supabase/migrations/0001_xofn_check.sql` dan `SupabaseCheckCache` ditulis dan diuji dengan store tiruan, tetapi **belum pernah dijalankan terhadap Postgres nyata**. Semua pengujian langsung memakai cache memori |
| `src/types/db.ts` | Tidak dibuat: butuh `supabase gen types` terhadap DB yang berjalan |
| `@supabase/ssr`, CLI `supabase` | Tidak dipasang: belum ada yang memakainya |
| Tabel `dvn_labels` | Skema ada; sinkronisasi dari `config/dvn-labels.json` belum ditulis. Check membaca label langsung dari file |
| Pembatas laju | Per proses (memori). Untuk produksi multi-instance perlu penyimpanan bersama atau CDN |
| `verify()` untuk token XofN | Belum ada: tidak ada manifest deployment (mode preview) |
| Pembacaan sisi peer | Check membaca konfigurasi send dan receive milik kontrak yang diperiksa. Konfigurasi kontrak peer di chain lain dibuka lewat tautan "check the peer", tidak digabung otomatis |
| Tautan halaman LayerZero Scan | Pola URL halaman belum terverifikasi; hanya URL API yang disediakan |
| Rekaman layar MP4 (brief) | Tidak dibuat |
| Klaim "Check any OFT's X-of-N" | Tidak dipakai di copy: baru boleh setelah Check dirilis publik (Fase 1b, FROZEN) |
