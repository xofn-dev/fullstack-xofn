# Phase 1 — Fondasi repo + port landing (mode `preview`)

- **Tanggal:** 17 Nov 2026
- **Branch:** `phase-1/foundation-landing` (bercabang dari `phase-0/addendum`)
- **Status:** selesai; menunggu persetujuan gerbang.
- **Sifat pekerjaan:** kode web saja. Tidak ada kontrak, transaksi, wallet, key, atau deploy.

## Indeks bukti

| File | Satu kalimat konteks |
|---|---|
| [shots/01-hero-1280.jpg](shots/01-hero-1280.jpg) | Hero di 1280px: scene Coinfall WebGL berjalan, chip home = ROBINHOOD, ekspansi = BASE dan ARBITRUM, NoticeBar `PREVIEW / NOT LIVE`. |
| [shots/02-architecture-1280.jpg](shots/02-architecture-1280.jpg) | Section arsitektur: stage 3D "coin run" dengan tiga mode kamera. |
| [shots/03-inside-coin-1280.jpg](shots/03-inside-coin-1280.jpg) | "Inside the coin": koin terbelah (mekanisme *split*, D2) dengan pelat DVN, kode mengikuti tier. |
| [shots/04-security-1280.jpg](shots/04-security-1280.jpg) | Kartu tier sebagai radiogroup dengan copy operator D17 (tanpa Google Cloud/Polyhedra). |
| [shots/05-graduation-1280.jpg](shots/05-graduation-1280.jpg) | Skema graduation: ROBINHOOD / HOME, lima langkah dua tahap. |
| [shots/06-hero-390.jpg](shots/06-hero-390.jpg) | Hero di 390px: layout bertumpuk, tombol menu mobile. |
| [shots/07-inside-coin-390-fallback.jpg](shots/07-inside-coin-390-fallback.jpg) | "Inside the coin" di 390px: galaxy WebGL mati (D5), tanda X CSS sebagai fallback. |
| [shots/08-architecture-no-webgl.jpg](shots/08-architecture-no-webgl.jpg) | WebGL dimatikan: blueprint enam modul tampil sebagai fallback statis. |
| [shots/09-hero-1680.jpg](shots/09-hero-1680.jpg), [shots/10-hero-768.jpg](shots/10-hero-768.jpg) | Hero di 1680px dan 768px. |

Tangkapan layar diambil dari build produksi lokal lewat Chrome headless (DevTools Protocol). Brief meminta rekaman MP4 untuk fitur UI; itu belum dibuat (lihat "Belum dikerjakan").

## Gerbang Phase 1 (`PRD.md` §9.1)

| Kriteria | Status | Cara memeriksa |
|---|---|---|
| Landing menampilkan semua section HTML dengan visual setara; 3D berjalan beserta fallback | **Terpenuhi** | 16 section (`DESIGN_SYSTEM.md` §6.1) ter-render; perbandingan tangkapan layar dengan HTML asli; tiga konteks WebGL aktif di desktop; fallback teruji dengan WebGL dimatikan |
| Copy home chain = Robinhood (D15); panel "coin-lab" tidak di-port (D1) | **Terpenuhi** | HTML hasil render: 0 kemunculan `coin-lab`, `COINFALL V8`, `CONCEPT 008` |
| Data demo berlabel; disclaimer LayerZero di footer; "omnichain" tampil sebagai rencana | **Terpenuhi** | Label FICTIONAL/DEMO/PREVIEW/`*` ada; kalimat disclaimer wajib ada; chip `PLANNED` di copy omnichain |
| `npm run lint`, `typecheck`, `test`, `build` lulus | **Terpenuhi** | Lihat di bawah |
| Tidak ada overflow di 360px; reduced motion; tidak ada kebocoran WebGL saat navigasi | **Terpenuhi sebagian** | Overflow 0 di 360/390/768/1280/1680. Reduced motion: Lenis dan koreografi mati. Navigasi bolak-balik antar halaman belum bisa diuji di browser karena baru ada satu route |

## Hasil pemeriksaan

| Pemeriksaan | Hasil |
|---|---|
| `npm run lint` | Lulus, 0 error, 0 warning |
| `npm run typecheck` | Lulus |
| `npm run test` | Lulus: 2 file, 22 tes |
| `npm run build` | Lulus: `/` dan `/_not-found` ter-prerender statis |
| Konsol browser (build produksi, 360–1680px) | 0 error |
| Konsol browser (mode dev, StrictMode) | 0 error, 0 peringatan hydration; satu canvas per scene |
| Overflow horizontal | 0px di 360, 390, 768, 1280, 1680 |
| Reduced motion | Lenis tidak aktif, `motion-ready` tidak dipasang, 0 error |
| WebGL dimatikan (`--disable-3d-apis`) | Fallback statis tampil; hanya peringatan konsol yang disengaja |
| Uji interaksi otomatis (1280px) | 30 dari 30 lulus |
| Uji interaksi otomatis (390px) | Lulus, termasuk menu mobile dan tautan Connect Wallet di menu |

Interaksi yang diuji: modal wallet (fokus terjebak, Escape, fokus kembali, kunci scroll); pemilih tier dan sinkronisasinya ke DVN rig, "inside the coin", dan radio form launch; filter Explore termasuk status Graduated; drawer token lewat keyboard; XofN Check demo (alamat tidak sah → error, alamat sah → tidak ada hasil yang dikarang, sampel 1-of-1 berlabel simulasi); validasi form launch; bridge Base→Arbitrum dijelaskan lewat hub; stasiun dan mode kamera arsitektur.

Aturan klaim (`PRD.md` §4.3) pada HTML hasil render: 0 kemunculan *unsafe*, *unhackable*, *zero risk*, *official*, *partner*, *Google Cloud*, *Polyhedra*.

## Versi yang dipin (berbeda dari rilis terbaru)

| Paket | Dipin | Terbaru | Alasan |
|---|---|---|---|
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.3 | 4.3.5 | 4.3.4+ memuat `magic-string` ESM-only lewat `require()`, yang butuh Node ≥ 22.12; mesin dev memakai Node 22.11 |
| `vitest` | 4.1.12 | 5.1.0 | Vitest 5 butuh Node ≥ 22.12 |
| `typescript` | 5.9.3 | 7.0.2 | Baseline ARCHITECTURE `^5.7`; kompatibilitas TS 7 dengan `typescript-eslint` belum diperiksa |
| `eslint` | 9.39.5 | 10.15.0 | Baseline ARCHITECTURE `^9.17` |

`next` 16.4.6, `react`/`react-dom` 19.3.1, `three` 0.187.0, `gsap` 3.15.1, `lenis` 1.3.27 memakai rilis terbaru.

## Belum dikerjakan atau terbatas

| Hal | Keterangan |
|---|---|
| Rekaman layar MP4 (brief) | Tidak dibuat; yang ada tangkapan layar statis |
| Kebocoran WebGL saat navigasi antar halaman | Belum ada route kedua. `dispose()` ketiga scene diuji subagent dengan renderer tiruan (mount → dispose → mount tanpa sisa listener/rAF), bukan di browser nyata. Diuji ulang di Phase 2 saat `/check` ada |
| Paritas kecerahan 3D dengan HTML | Tidak bisa dibandingkan persis: tangkapan layar HTML asli tertangkap saat scene masih fade-in. three naik dari r170 ke 0.187, yang memakai prefilter PMREM berbeda |
| TierBadge yang bisa diklik → DvnList | Komponen domain ini dibuat bersama halaman aplikasi (Phase 2/4). Di landing, penjelasan tier ada di drawer token |
| LCP < 2,5 dtk | Belum diukur |
| Kontras AA menyeluruh | Hanya temuan yang terlihat yang diperbaiki (judul langkah graduation); audit penuh belum dilakukan |
