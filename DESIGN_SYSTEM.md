# DESIGN_SYSTEM.md — XofN

> **Tujuan dokumen:** menerjemahkan HTML konsep `xofn-coinfall-v8-galaxy.html` menjadi sistem desain yang bisa diimplementasikan di Next.js + Tailwind v4 + GSAP + three.js. Isinya token, tipografi, layout, komponen, motion, 3D, copy, dan aksesibilitas.
>
> **Sumber kebenaran:**
> - Visual → HTML V8. HTML adalah **baseline**: boleh ditingkatkan (animasi, UX, performa), tetapi tidak boleh diganti dengan desain yang tidak berhubungan.
> - Aturan klaim dan copy → `brief-xofn.md` + klaim per tahap di `deployguide-xofn.md` (dirangkum di `PRD.md` §4.3).
> - Peran chain → `deployguide-xofn.md`: **Robinhood = home**, Base & Arbitrum = ekspansi. Copy HTML yang menyebut Base sebagai home diganti (D15).
>
> **Label:**
> - **[Desain]** — nilai diambil dari HTML
> - **[Brief]** — dari brief
> - **[Usulan]** — normalisasi/keputusan dokumen ini
> - **[Belum]** — perlu keputusan
>
> **Dokumen terkait:** `CLAUDE.md` §8, `ARCHITECTURE.md` §11, `USER_FLOWS.md`, `PRD.md` §6.

---

## 0. Status verifikasi

| Hal | Status |
|---|---|
| Baseline visual | HTML V8 (CSS berlapis V2→V8 + 3 scene three r170 + GSAP 3.13 + Lenis 1.1.13), dibaca 17 Nov 2026 |
| Implementasi | **Belum ada** (lihat §15) |
| Sifat HTML | Konsep landing satu halaman; semua data demo; label "CONCEPT / NOT LIVE" |
| Halaman aplikasi (`/launch`, `/t`, `/check/...`, `/bridge`, `/contracts`, `/proof`) | **Tidak ada di HTML**. Disusun dari komponen section landing (§6.2) |

Catatan cara membaca HTML: CSS ditulis berlapis per versi (`.v2` … `.v8` di `<body>`), dan lapisan yang lebih baru menimpa yang lama. Nilai di dokumen ini adalah **nilai efektif akhir** yang sudah dinormalisasi.

---

## 1. Brand

| Elemen | Spesifikasi [Desain] |
|---|---|
| Nama | **XofN**. Wordmark `X` + `of` kecil (13px, mint2, letter-spacing −.06em) + `N`; 27px bold, letter-spacing −.08em |
| Logo-mark | Kotak 33×33, radius 6, latar mint terang, huruf `X` mono 23px, **rotasi −9°** |
| Tagline | *Never one of one.* / *Graduate on proof, not promises.* [Brief] |
| Motif | Koin gelap metalik dengan emblem X; gerbang (gate) bercahaya yang dilewati koin; koin "1/1" ditolak (merah); pelat lapisan DVN di dalam koin; langit bintang |
| Nada | Teknis, presisi, berbasis angka, ala dashboard infrastruktur [Brief]. Headline besar dan tegas; detail ditulis dalam mono uppercase |
| Larangan [Brief] | Tidak memakai logo atau nama produk LayerZero di branding; tidak memakai logo chain (emblem koin digambar sendiri) |

---

## 2. Token

Semua token didefinisikan di `@theme` dalam `src/app/globals.css`. **Hex baru tidak boleh ditulis di komponen**; tambahkan token baru. Pengecualian: konstanta three.js di `src/lib/three/palette.ts`, yang wajib sinkron dengan tabel ini.

### 2.1 Warna inti
| Token (`--color-*`) | Hex | Asal | Pemakaian |
|---|---|---|---|
| `bg` | `#040711` | [Desain] v2+/PAL.bg | Latar halaman, latar scene 3D |
| `bg-2` | `#07101c` | [Desain] | Section alternatif |
| `panel` | `#0b1725` | [Desain] | Panel solid |
| `panel-2` | `#101a2a` | [Desain] | Kartu, input |
| `line` | `#263247` | [Desain] | Border utama |
| `line-2` | `#1b2738` | [Desain] | Divider halus |
| `text` | `#f3f7ff` | [Desain] | Teks utama |
| `muted` | `#93a3b9` | [Desain] | Teks sekunder |
| `dim` | `#60718a` | [Desain] | Caption, placeholder |
| `mint` | `#b5ffe5` | [Desain] PAL.mint | Aksen utama, tombol primer, status Locked |
| `mint-2` | `#6af0d5` | [Desain] PAL.mint2 | Glow, titik status, label section |
| `ice` | `#abcbff` | [Desain] v3 | Ujung gradient |
| `blue` | `#91a5ff` | [Desain] PAL.blue | Chain ekspansi, DVN opsional |
| `violet` | `#ac8cff` | [Desain] PAL.violet | Aksen kedua; Arbitrum di 3D (di HTML: Robinhood, lihat D15) |
| `orange` | `#ffbb82` | [Desain] | Status Bonding, tag warn, "PLANNED" |
| `caution` | `#ffd97a` | [Usulan] D13 | Label Check "2+" (brief: kuning) |
| `danger` | `#ff7b8b` | [Desain] | 1-of-1, Changed, error |

Lapisan `.v3` di HTML sedikit menggeser mint menjadi `#baffdf` / `#7cf7c9`. Dokumen ini menyatukannya ke nilai PAL (D11).

### 2.2 Warna turunan status (latar / border / teks)
| Status | Latar | Border | Teks | Asal |
|---|---|---|---|---|
| ok / Locked | `#172b29` | `#466057` | `#a2f2d1` | `.status` |
| Graduated · awaiting expansion / Expanding | `#20243a` | `#424c78` | `#c5cbff` | `.status.blue` (D16) |
| Bonding / warn | `#2e261d` | `#65513b` | `#ffcb9b` | `.status.orange` |
| info / blue | `#20243a` | `#424c78` | `#c5cbff` | `.status.blue` |
| danger / Changed / 1-of-1 | `#351d27` | `#7e4858` | `#ff9eaa` | `.big-status.danger` |
| caution / 2+ | `#2d2a17` | `#6b5f2e` | `#ffe3a1` | [Usulan] D13 |

### 2.3 Gradient & efek
| Token | Nilai [Desain] | Pemakaian |
|---|---|---|
| `gradient-primary` | `linear-gradient(110deg,#baffe2,#b0d6ff)` | Tombol primer |
| `gradient-notice` | `linear-gradient(100deg,#baffdf,#b0d6ff 55%,#cfbdff)` | Notice bar |
| `gradient-headline` | `linear-gradient(115deg,#fbfff8 0%,#a9fbe0 35%,#8ce9fa 67%,#cdbbff 100%)` | Kata mint di hero (background-clip text) |
| `gradient-progress` | `linear-gradient(90deg,#5c8bff,#bbffe4)` + glow | Progress bar |
| `glass` | `linear-gradient(150deg,rgba(16,26,41,.68),rgba(7,12,21,.76))` + `backdrop-filter: blur(14px) saturate(1.25)` | Semua panel di atas langit galaxy |
| `grid-overlay` | garis 1px `rgba(143,173,200,.035)` tiap 72px, dengan mask | Hero, stage |
| `noise` | SVG fractalNoise, opacity .115, fixed | Lapisan tekstur seluruh halaman |
| `glow-mint` | `0 0 11px var(--mint-2)` | Titik status |
| `shadow-card-hover` | `0 24px 60px #88ffe20f, 0 0 30px #98fff711` | Hover kartu |

### 2.4 Radius & spacing
| Token | Nilai | Pemakaian [Desain] |
|---|---|---|
| `radius-xs` | 4–5px | Status chip, badge kecil |
| `radius-sm` | 6–7px | Tombol, input, kv |
| `radius-md` | 9px | Grad-step, form-note, modal detail |
| `radius-lg` | 12px | Token/tier/proof card |
| `radius-xl` | 13–14px | Feature, terminal, launch form, modal |
| `radius-2xl` | 16–17px | Architecture shell |
| `radius-pill` | 40px | Tag |

| Spacing | Nilai |
|---|---|
| Container | `min(1320px, 100% − 80px)`; ≤1150: `100% − 50px`; ≤640: `100% − 34px` |
| Section | 120px (tight 96) → ≤900: 82 (74) → ≤640: 75 (65) |
| Gap grid kartu | 13–15px |
| Padding kartu | 22–31px (≤640: 20px) |

---

## 3. Tipografi

| Peran | HTML [Desain] | Implementasi |
|---|---|---|
| Display / body | `Arial, system-ui, sans-serif` | D3: font grotesk via `next/font/google`. [Usulan] *Inter Tight*; fallback Arial |
| Mono | `ui-monospace, SFMono-Regular, Consolas` | D3: [Usulan] *JetBrains Mono* via `next/font` |

| Skala | Ukuran | Line-height | Tracking | Weight |
|---|---|---|---|---|
| Hero H1 | `clamp(68px, 7.3vw, 134px)`; ≤760: `clamp(62px, 14vw, 97px)` | .87 | −.095em | 600 |
| Section H2 | `clamp(36px, 5vw, 64px)`; ≤640: 43px | 1.01 | −.07em | 600 |
| Manifesto / CTA | `clamp(41px, 7.6vw, 116px)` / `clamp(48px, 7vw, 105px)` | ~1 | −.085 s/d −.09em | 600 |
| Inside-the-coin | `clamp(40px, 8.4vw, 150px)` uppercase | .84 | −.07em | 800 |
| Card H3 | 16–21px (tier 43px) | 1.15 | −.03 s/d −.06em | 600–700 |
| Body | 14–16px | 1.7–1.8 | −.006em | 400 |
| Eyebrow / section-label | 10px mono uppercase | — | .13–.14em | 500 |
| Mono data | 9–12px | 1.6 | .045em | 400–500 |

Pola khas yang dipakai di heading:
- **outline text**: `-webkit-text-stroke: 1px rgba(225,237,255,.57)`, isi transparan;
- **mint gradient text**;
- satu kata kunci per heading di-highlight dengan `.accent` (mint).

---

## 4. Layout & breakpoint

| Breakpoint (normalisasi) | Perubahan utama [Desain] |
|---|---|
| ≤1150 | Container menyempit; nav-tag disembunyikan; side-index disembunyikan |
| ≤900 | **Nav jadi menu mobile** (tombol ☰, panel turun); hero, check, tier, graduation, launch, dan bridge jadi 1 kolom; grid fitur/token 2 kolom; milestone 3 kolom |
| ≤760 | Cursor aura mati; hero visual 430px; arch controlbar 1 kolom; mode kamera grid 3 kolom tanpa nomor |
| ≤640 | Grid 1 kolom; notice 8px; tombol Connect di nav disembunyikan (ada di menu); form-row 1 kolom; milestone 2 kolom; footer bertumpuk |
| ≤430 | Arch stage 325px; hero visual 365px; chip hero di-scale .85 |

Aturan:
- Tidak boleh ada overflow horizontal di **360–390px** (`overflow-x: clip` di html).
- Navigasi wajib tersedia di mobile.
- Tabel kontrak dibungkus `overflow-x: auto`.
- `scroll-margin-top: 105px` untuk section yang dituju anchor.

---

## 5. Komponen

Komponen generik ada di `src/components/ui/`, komponen domain di foldernya masing-masing (`ARCHITECTURE.md` §2). Setiap komponen data wajib punya state **loading / empty / error / success**.

### 5.1 Button [Desain `.btn`]
- Varian: `primary` (gradient-primary, teks gelap), `secondary` (panel + border), `ghost`, `small` (38px), `icon` (42×42).
- Tinggi minimum 48px, radius 7, font 13px bold.
- Hover: `translateY(-2/-3px)`, plus efek sheen diagonal (pseudo-element) untuk tombol primer.
- Panah `↗` / `→` sebagai elemen terpisah (`.arr`).
- `disabled` → opacity .5, `cursor: not-allowed`. Saat loading tx: teks status (mis. "Confirm in wallet…") tanpa spinner yang menutupi label.

### 5.2 Tag / StatusPill [Desain `.tag`, `.status`, `.big-status`]
- Tag pill mono 10px dengan titik glow; varian `ok`, `warn`, `red`.
- Status chip mono 9px dengan titik `currentColor`; varian mengikuti §2.2.
- **Status tidak boleh dikomunikasikan dengan warna saja**: selalu ada teks (LOCKED / BONDING / CHANGED / FLAGGED).

### 5.3 TierBadge — elemen visual utama [Brief]
- Teks `XofN 2+1/2` / `XofN 3+1/2`, mono 10px, border mint, latar `#152a29` [Desain `.token-badge`].
- **Selalu tampil bersama status** dengan format `XofN 2+1/2 · <status>` [Guide]. Status: Bonding / Graduated · awaiting expansion / Expanding / Locked / Changed (D16).
- Sebelum ekspansi, DvnList menampilkan **rencana tier** dengan label "Tier committed — applied at expansion", bukan konfigurasi on-chain.
- **Selalu bisa diklik** (button) → popover/drawer `DvnList`: per pathway, DVN wajib dan opsional (nama operator + alamat terpotong + tombol salin + tautan explorer), threshold, owner, delegate, dan "checked at".
- Contoh demo diberi akhiran `*` dan label DEMO.

### 5.4 TokenCard [Desain `.token-card`]
- Isi: glyph 47px, nama + `$TICKER`, status, sparkline SVG (area gradient + garis), progres graduation (%), progress bar, TierBadge, dan "Preview details ↗".
- Hover naik 4–7px, dengan spotlight radial mengikuti pointer (`--spotX/--spotY`, hanya pointer fine).
- Seluruh kartu bisa difokus (Enter/Space membuka detail).

### 5.5 CheckPanel ("terminal") [Desain `.terminal`]
- Head: dot jendela, judul `XOFN_CHECK / CONFIG_INSPECTOR`, tag mode (DEMO / LIVE).
- Body:
  - input alamat (`field`) + tombol Inspect;
  - pilihan chain;
  - pilihan sample (hanya untuk contoh demo).
- Hasil:
  - caption, badge besar (`XofN 2+1/2` atau `1-of-1`);
  - baris owner/delegate;
  - `big-status`;
  - `kv-grid` 2×2 (REQUIRED DVNs, OPTIONAL THRESHOLD, REQUIRED OPERATORS, OPTIONAL OPERATORS);
  - daftar `path-row` per pathway dengan label warna;
  - "checked at";
  - tombol Share.
- Error: kotak `checker-error` merah, mono 11px. Pesan jujur, tanpa hasil palsu.
- `aria-live="polite"` pada area hasil.

### 5.6 TierCard + DVN rig [Desain `.tier-card`, `.v3-dvn-demo`]
- Dua kartu (Standard / Fortress), dipakai sebagai **radiogroup** (bukan `role=button` seperti di HTML).
- State `selected` memakai pita "ACTIVE PREVIEW".
- DVN rig: inti `XofN` di tengah, 5 node verifikator (3 wajib, 2 opsional). Node ke-3 redup di Standard dan menyala di Fortress.
- Pilihan tier dibagi ke rig, ke "inside the coin", dan ke hoop DVN di scene arsitektur (§8).

### 5.7 Graduation display + GradStep [Desain `.grad-display`, `.grad-step`]
- **Display:** ring berputar, inti X, node chain, caption tahap. Node HTML "BASE / HOME" diganti **"ROBINHOOD / HOME"**, dan dua node lain menjadi **BASE** dan **ARBITRUM** (ekspansi) (D15).
- **Daftar langkah:** 5 langkah dengan nomor kotak, judul, sub-mono, panah, timeline bar 20% per langkah, dan penjelas (explainer). Copy landing disesuaikan dengan lifecycle dua tahap:
  1. Bonding threshold reached
  2. Robinhood liquidity goes live (graduate)
  3. Expand through LayerZero (deploy + send/compose)
  4. Verify every pathway
  5. Lock & publish proof
- Di `/t/[address]` (nyata), komponen ini dipecah menjadi dua panel:
  - **Graduation panel** (F.1): progres ke ambang → tombol Graduate → `Robinhood pool created` → badge `Graduated · awaiting expansion`;
  - **Expansion panel** (F.2): progres **per chain** (Base, Arbitrum). Setiap langkah punya status `pending` / `ok` / `failed`, tautan tx, dan tautan LayerZero Scan. Tombol **Retry** muncul per chain bila gagal (`USER_FLOWS.md` §8.2).

### 5.8 LaunchForm [Desain `.launch-form`]
- Field: nama, ticker, logo (preview lokal), supply tetap, tier (radio card), chain ekspansi (checkbox), form-note biaya ("NOT QUOTED" sampai ada quote), submit, dan `error-msg` dengan `aria-live`.
- Validasi inline mengikuti HTML (`PRD.md` §6.2).

### 5.9 BridgeWidget [Desain `.bridge-widget`]
- Dua `transfer-box` (FROM / TO), input jumlah, select chain, tombol tukar ↕, ringkasan (fee, ketersediaan, jenis tx), dan tombol primer.
- Tambahan untuk versi nyata: baris **dust** dan tautan LayerZero Scan setelah kirim.

### 5.10 ProofCard / ProofCheck / Milestone / ContractTable [Desain]
- Daftar centang dengan status kanan (mono). Simbol `○` oranye = belum terpenuhi; versi nyata memakai `●` mint = terpenuhi.
- Tabel kontrak: kolom CONTRACT / ROLE / PUBLIC ADDRESS / STATUS.

### 5.11 Overlay: Modal, Drawer, Toast [Desain]
- **Modal:** `role="dialog"`, `aria-modal`, fokus dijebak dan dikembalikan saat ditutup, Escape menutup, klik backdrop menutup. Saat modal terbuka, Lenis berhenti dan scroll body dikunci.
- **Drawer** (kanan, ≤520px): untuk detail token pratinjau di landing.
- **Toast:** kanan bawah, `role="status"`, hilang otomatis setelah ±4,2 dtk.

### 5.12 Layout chrome [Desain]
- **NoticeBar:** 34px, gradient-notice, chip gelap berisi status. Teks mengikuti mode (§10).
- **Nav:** sticky, glass, tinggi 76/70/64; link; tombol Connect Wallet; menu mobile.
- **ScrollProgress:** garis 2px di atas.
- **SideIndex:** vertikal kiri, nomor chapter; khusus desktop.
- **CursorAura:** khusus pointer fine.
- **ScrollTop:** kiri bawah.
- **Footer:** disclaimer wajib (§10).

### 5.13 Marquee & transmisi [Desain]
- Dua strip berjalan. Kecepatan mengikuti velocity scroll (GSAP). Bersifat `aria-hidden` karena dekoratif.

---

## 6. Peta section

### 6.1 Landing `/` (urutan HTML)
| # | Section (id) | Komponen | Interaksi |
|---|---|---|---|
| 1 | Hero (`top`) | Eyebrow, koordinat, H1 3 baris (NEVER / ONE OF outline / ONE. gradient), deskripsi, 2 CTA, 3 fakta (2+ REQUIRED · 999,000,000 · ZERO 1-OF-1), **HeroCoinfall 3D** + 4 chip chain | Klik visual → menjatuhkan koin; chip 1-of-1 menyala merah saat koin 1/1 ditolak |
| 2 | Marquee + transmisi | Strip teks prinsip | Velocity |
| 3 | Vision (`vision`) | 3 FeatureCard + SVG ilustrasi | Draw-in SVG, spotlight |
| 4 | Thesis | Dial "1/1 DENIED", heading "ONE OF ONE IS NOT ENOUGH." | Dial fokus masuk |
| 5 | Architecture (`architecture`) | Shell: top bar + mode kamera (Coin run / Overview / X-ray), **ArchStage 3D**, hotspot pod, panel inspector, pill stasiun, tombol tur | Pilih stasiun, ganti mode, tur otomatis (2,1 dtk/stasiun) |
| 6 | Manifesto | 3 baris kinetik + segel berputar "X ≠ 1/1" | Baris bergeser mengikuti scroll |
| 7 | Explore (`explore`) | Filter All/Bonding/Graduated/Locked (D16) + TokenGrid + catatan demo | Buka drawer |
| 8 | Check (`check`) | Copy + perks + CheckPanel | Inspect sample / alamat |
| 9 | Inside the coin (`inside`) | Section pinned 200vh: "DON'T TRUST" ◇ "VERIFY", koin terbuka, kode tier | Scroll membuka koin; drag memutar |
| 10 | Security (`security`) | TierCard ×2 + DVN rig + catatan operator (di HTML: catatan Polyhedra; diganti sesuai D17) | Pilih tier |
| 11 | Graduation (`graduation`) | Display + 5 GradStep | Scroll berjalan per langkah; klik override 6 dtk |
| 12 | Launch (`launch`) | Intro + langkah mini + LaunchForm (demo) | Validasi + modal ringkasan |
| 13 | Bridge (`bridge`) | Copy + BridgeWidget (demo) | Tukar chain, modal |
| 14 | Proof (`proof`) | 2 ProofCard + 6 Milestone | — |
| 15 | Contracts (`contracts`) | ContractTable + tag | — |
| 16 | CTA + footer | "THE FUTURE IS VERIFIABLE.", 2 CTA, disclaimer | Koin galaxy mendarat (burst) |

### 6.2 Pemetaan ke halaman aplikasi [Usulan, P24]
| Halaman | Disusun dari |
|---|---|
| `/launch` | Section 12 (LaunchForm) + TierCard/DVN rig (10) + catatan biaya |
| `/t/[address]` | Isi drawer token diperluas: header token, chart, TierBadge + DvnList, trade toggle, panel Graduation (F.1) dan panel Expansion (F.2) dari section 11 dalam versi data nyata (§5.7), supply per chain, `verify()` live |
| `/check` | Section 8 tanpa sample sebagai default; sample tetap tersedia dengan label |
| `/check/[chain]/[address]` | CheckPanel hasil penuh + tabel pathway + Share + kartu OG (§5.5) |
| `/bridge` | Section 13 dengan data nyata |
| `/proof` | Section 14 + daftar folder bukti |
| `/contracts` | Section 15 dari manifest |

- Semua halaman aplikasi memakai chrome yang sama (§5.12) dan latar galaxy versi ringan atau statis (D6).
- Nav aplikasi: **Explore · Check · Launch · Bridge · Proof · Contracts** (D12). Anchor landing tetap berlaku di `/`.

---

## 7. Motion

Teknologi: **GSAP + ScrollTrigger**, **Lenis**, dan CSS. Tidak memakai library animasi lain. Semua animasi ditulis lewat wrapper `src/lib/client/gsap.ts` dan direvert saat unmount.

### 7.1 Prinsip
1. Motion menjelaskan status atau alur: koin lolos gate = terverifikasi; koin 1/1 terpental = ditolak; pelat menyala = DVN aktif.
2. Durasi micro-interaction UI (hover, toggle, toast) 150–700ms. Koreografi scroll boleh 0,6–1,5 dtk karena di-scrub atau dipicu sekali.
3. Animasi tidak boleh mengganggu input; elemen yang sedang di-tween menonaktifkan transisi CSS-nya (`.fx-hold`).
4. **`prefers-reduced-motion: reduce`**:
   - semua animasi, Lenis, dan parallax mati;
   - reveal langsung terlihat;
   - 3D merender satu frame statis (galaxy: koin disembunyikan);
   - marquee berhenti.

### 7.2 Katalog [Desain]
| Nama | Target | Parameter |
|---|---|---|
| Hero intro | Baris hero | `yPercent 35 → 0`, blur 14→0, 1,15 dtk `power3.out`, stagger .085 |
| Hero defocus | `.hero-copy` saat scroll keluar | opacity →.12, blur 9, scrub |
| Count-up supply | "999,000,000" | 1,9 dtk `power2.out`, delay .9 |
| Line-mask reveal | Heading section | `yPercent 112 → 0`, 1,05 dtk `power4.out`, stagger .11 |
| Card rise | Feature / token / tier / proof / milestone | y 64, rotateX −16, blur 9 → 0, 1 dtk `power3.out`, stagger .11 (ScrollTrigger.batch) |
| Slide list | Perks, langkah mini, callouts, proof checks | x ±22–30, .7 dtk, stagger .07 |
| SVG draw-in | Ilustrasi fitur | strokeDashoffset, 1,5 dtk |
| Dial stamp | Thesis | scale .55 → 1 + "DENIED" `back.out(2.2)` |
| Shell rise | Architecture | y 110, scale .93 → 1, scrub |
| Terminal swing | CheckPanel | rotateY −26°, x 90 → 0, scrub (desktop) |
| DVN online | Node rig | blur → 0, stagger .14 |
| Graduation walk | Langkah 1–5 mengikuti progres scroll | Klik manual menahan auto selama 6 dtk |
| Side enter | LaunchForm / BridgeWidget | x 70 → 0 + blur, 1,1 dtk |
| Section exit | Container section | opacity .3, blur 7, scale .985, scrub |
| Marquee velocity | Strip | playbackRate 1–6 |
| CTA zoom | Heading CTA | scale .78 → 1, letter-spacing, scrub |
| CSS loop | Float chip 6 dtk, headline sweep 9 dtk, ring berputar, segel 16 dtk, LED berkedip | Off-screen di-pause |
| Ambient | Scroll progress, cursor aura, spotlight kartu | Pointer fine saja |

### 7.3 Peningkatan yang diizinkan
- Transisi halaman ringan antar route.
- Animasi progres graduation nyata (langkah berpindah `pending → ok` dengan pulse mint, atau `failed` dengan getar merah + tombol Retry muncul).
- Hasil Check muncul per pathway berurutan.

---

## 8. 3D (three.js vanilla)

Semua geometri dibuat prosedural dalam kode (tanpa file model, tekstur, atau video) [Desain]. Port ke `src/lib/three/*` + `components/three/*` (`ARCHITECTURE.md` §11.3).

### 8.1 Kit bersama
| Elemen | Detail [Desain] |
|---|---|
| Coin | Lathe profile (R .5, H .085), metal gelap `#1a202c` metalness 1 roughness .28, emblem glyph dari canvas (x / diamond / star / hex / "1/1"), ring glow per koin, clip plane per koin (supaya tampak "masuk" gate) |
| Track | Kurva CatmullRom, tile limas instanced dengan variasi terang, slab + rail + strip glow |
| Gate | Pelat heksagon bercahaya, rim torus, tanda X gelap, dua point light, flare sprite; `pulse()` (mint) dan `reject()` (merah) |
| Stage | `WebGLRenderer` (antialias off) + ACES tone mapping exposure 1.1 + `RoomEnvironment` PMREM + `EffectComposer` (Render → UnrealBloom → Output), fog |
| Atmosfer | Dust partikel naik; sky shell bintang dengan warna putih/mint/biru |

### 8.2 Hero — Coinfall
- **Komposisi:** dua track (atas dan bawah), gate di tengah. Pool 17 koin berjalan, jatuh menembus gate, lalu muncul di bawah dengan ring mint atau biru ("verified").
- **Makna data:** koin `1/1` (emblem merah) **ditolak**, terpental dan gate berkedip merah. Chip "1-of-1 BLOCKED" ikut menyala merah.
- **Chip chain** dipin ke anchor 3D lewat proyeksi. Teks disesuaikan dengan guide (D15):
  - f1 `HOME CHAIN · MVP` → **ROBINHOOD**;
  - f2/f3 `EXPANSION · PLANNED` → **BASE** dan **ARBITRUM**;
  - f4 `SECURITY POLICY` → 1-of-1 BLOCKED (tetap).
- **Interaksi:** parallax pointer, kamera turun mengikuti scroll, klik menjatuhkan koin.
- **Layout:** desktop memakai canvas 66% kanan dengan mask kiri; layout bertumpuk memakai canvas penuh lebar di bawah copy dengan mask atas.

### 8.3 Architecture — Coin run (6 stasiun)
- **Stasiun** (key HTML → peran baru sesuai guide, D15):
  - `base` → **`robinhood`** (01 / ORIGIN: home, curve + pool pertama; track A + hoop)
  - `core` (gate Graduator: `graduate()` lalu `expandAndLock()`)
  - `dvn` (track B dengan 5 hoop: 3 wajib mint, 2 opsional biru)
  - `arb` → **`base`** (04 / REMOTE, pad biru) dan `robin` → **`arbitrum`** (05 / REMOTE, pad violet)
  - `registry` (alas + tumpukan koin + cincin kunci; Registry ada di setiap chain)
- Teks inspector (`archData` di HTML) ditulis ulang mengikuti lifecycle dua tahap. Contoh: stasiun origin = "Robinhood / Bonding curve & local graduation".
- **Mode kamera:** `run` (terbang ke stasiun aktif), `overview` (seluruh pipeline), `xray` (struktur jadi wireframe + grid, koin dan glow tetap).
- **Makna data:** jumlah hoop wajib yang menyala mengikuti tier (2 untuk Standard, 3 untuk Fortress), ditambah 1 hoop opsional. Kunci registry turun dan menyala di akhir.
- **DOM:** pod hotspot diproyeksikan ke posisi 3D dan disembunyikan bila keluar layar. Inspector, pill, dan tur tersinkron.

### 8.4 Galaxy layer + Inside the coin
- **Lapisan tetap di belakang halaman:**
  - heat glow CSS (3 blob blur);
  - canvas WebGL bintang (2200; 900 di layar kecil);
  - **satu koin pengembara** dengan target per section (posisi, rotasi, skala, glow, heat, sebaran bintang).
- Section dibuat transparan atau glass sehingga langit terlihat menembus seluruh halaman.
- **Inside the coin:**
  - section pinned; scroll membuka koin (mekanisme D2: *split* = dua belahan naik/turun, *vault* = pintu berengsel);
  - di dalamnya ada **5 pelat lapisan**: slot 0–2 DVN wajib (Standard memakai 2, Fortress 3), slot 3–4 opsional (1 dibutuhkan);
  - pelat menyala berurutan; teks tengah mencerminkan tier yang dipilih;
  - label "ILLUSTRATION ONLY · NOT A CHAIN READING".
- **Interaksi:** drag untuk memutar, klik untuk membuka/menutup. Mendarat di CTA dengan shock ring + burst partikel.
- **Fallback tanpa WebGL:** bintang 2D canvas; section inside-the-coin menyusut menjadi satu layar dengan tanda X CSS di antara kata.

### 8.5 Aturan performa & lifecycle
- Render hanya saat terlihat (`IntersectionObserver`, margin 80px); pause saat `document.hidden`.
- Batas pixel ratio:
  - stage: DPR ≤ 2 dan total piksel ≤ 1,5 MP;
  - galaxy: DPR 1,5 → 1.
- **Quality governor** berjalan setelah 150 frame pertama: turunkan resolusi bila rata-rata frame > 25–26 ms.
- Konteks WebGL maksimum 3 di desktop (hero, arch, galaxy). Di mobile ≤860px galaxy WebGL dimatikan (D5), jadi maksimum 2.
- Dispose lengkap saat unmount (`ARCHITECTURE.md` §11.3). Navigasi bolak-balik tidak boleh menambah konteks.
- Fallback statis selalu ada (CSS koin + gate di hero; blueprint grid 6 modul di arsitektur).

---

## 9. Ikon & grafis
- Ilustrasi fitur adalah SVG inline stroke tipis, mint/biru dengan drop-shadow glow [Desain].
- Glyph token demo: karakter (◇ ✳ ⬡) di kotak 47px. Logo token nyata berasal dari upload creator.
- Simbol UI: `↗ → ↕ ✓ ✕ ☰ ↑ ◉ ✳ ✦`. Simbol dekoratif diberi `aria-hidden`.
- **Tidak ada logo chain atau LayerZero.** Chain diwakili nama + titik warna menurut **peran** (D15): **Robinhood (home) mint**, **Base biru**, **Arbitrum violet**. Di HTML, mint dipakai untuk Base karena Base saat itu home.

---

## 10. Copy UI

### 10.1 Aturan
- Copy UI bahasa Inggris. Kategori, label, dan data teknis memakai mono uppercase.
- Aturan klaim `PRD.md` §4.3 berlaku penuh. Kata *unsafe*, *unhackable*, *zero risk*, *official*, dan *partner* tidak boleh dipakai.
- Data demo wajib berlabel: `DEMO`, `FICTIONAL`, `SAMPLE`, `SIMULATED EXAMPLE · NOT VERIFIED`, atau tanda `*` dengan catatan kaki.
- Hasil Check nyata selalu menampilkan `Checked at <UTC time>`.
- Nama chain di copy diambil dari registry chain, tidak ditulis langsung.

### 10.2 Teks per mode (NoticeBar & tag)
| Mode | NoticeBar | Tag aksi |
|---|---|---|
| `preview` | `PREVIEW / NOT LIVE · NO TOKEN SALE OR LIVE VERIFICATION` | `PREVIEW`, `DEMO` |
| `simulation` | `LOCAL SIMULATION · NO REAL FUNDS` | `SIMULATION` |
| `live` | (Phase 6–7, FROZEN) | — |

Label versi konsep ("COINFALL V8", "DESIGN CONCEPT 008", "COIN RUN · V5") dihapus dari copy produksi (D10).

### 10.2a Copy home chain & klaim per tahap [Guide]
HTML ditulis saat Base masih home. Copy berikut **wajib** disesuaikan (D15):

| Lokasi di HTML | Teks HTML | Teks baru |
|---|---|---|
| Hero chip f1 | `HOME CHAIN · MVP` / `BASE` | `HOME CHAIN · MVP` / `ROBINHOOD` |
| Hero chip f2/f3 | `EXPANSION · PLANNED` / `ARBITRUM`, `ROBINHOOD` | `EXPANSION · PLANNED` / `BASE`, `ARBITRUM` |
| Vision kartu 002 | "Begin on a Base bonding curve…" | "Begin on a Robinhood Chain bonding curve. Expand to Base and Arbitrum only when graduation and expansion conditions are met." |
| Architecture intro | "One token begins on Base…" | "One token begins on Robinhood Chain…" |
| Graduation intro & langkah | "Start with a bonding curve on Base…", "Create and seed Base AMM pool" | Robinhood sebagai home; langkah sesuai §5.7 |
| Launch form | `BASE · EVM`, "Create once on Base…", "Review fees and sign on Base" | `ROBINHOOD · EVM`, "Create once on Robinhood Chain…", "sign on Robinhood" |
| Bridge select default | Base → Arbitrum | Robinhood → Base |
| Contracts note | "Base / Arbitrum / Robinhood reflect the original MVP brief" | "Robinhood (home) / Base / Arbitrum follow the deploy guide v1.0" |
| Contracts tabel, baris XofNCurve | "Base bonding curve" | "Robinhood Chain bonding curve" |
| Bridge select | Opsi Base ↔ Arbitrum sebagai rute langsung | Rute langsung hanya Robinhood ↔ Base dan Robinhood ↔ Arbitrum; Base ↔ Arbitrum dijelaskan sebagai dua langkah lewat Robinhood |
| Security: tier card Standard | "LayerZero Labs required · Google Cloud* required · 1 of DT MMS / FCAT" | Lihat D17 |
| Security: tier card Fortress | "LayerZero Labs · Google Cloud · Polyhedra required · 1 of DT MMS / FCAT" | Lihat D17 |
| Security: footnote | "*The brief allows Polyhedra as an alternative required DVN in Standard…" | Diganti catatan D17 |
| Check: data sampel | `reqNames: 'Labs · Google Cloud'`, `'Labs · Google · Polyhedra'` | Lihat D17 (sampel tetap berlabel SIMULATED) |

Copy bertema omnichain ("Omnichain by demand", "One token. Multiple horizons.", "Expand cross-chain") boleh tetap dipakai sebagai **visi**, tetapi:
- harus disertai label `PLANNED` atau berada di konteks yang jelas "concept/preview";
- tidak boleh menjadi klaim live "Omnichain" sebelum Fase 2b;
- klaim yang boleh di Fase 1b: "Live on Robinhood Chain", "Check any OFT's X-of-N", "Built on LayerZero OFT" (`PRD.md` §4.3).

### 10.3 Disclaimer footer (wajib) [Brief]
*XofN is an independent project built on LayerZero. Not affiliated with or endorsed by LayerZero Labs.*

Lalu, selama belum live, ditambah kalimat HTML: tidak ada live verification, token sale, deployment, audit, atau transaksi wallet; $XOFN di luar scope MVP; badge tidak menjamin hasil investasi atau menghilangkan risiko.

---

## 11. Aksesibilitas
- **Fokus terlihat:** outline 2px mint (`--color-mint`) + offset 2px pada semua elemen interaktif.
- **Keyboard penuh:**
  - kartu token, pod, pill, dan modul blueprint adalah `<button>` / fokusable;
  - Escape menutup modal dan drawer;
  - fokus dijebak di modal.
- **ARIA:**
  - tier selector = `radiogroup`; filter token dan mode kamera = grup toggle `aria-pressed`;
  - dialog = `role="dialog" aria-modal`;
  - hasil Check dan error form = `aria-live`;
  - toast = `role="status"`;
  - canvas 3D dekoratif = `aria-hidden`; canvas arsitektur = `role="img"` + `aria-label`.
- **Kontras AA:** teks `dim` (#60718a) hanya untuk teks ≥ 12px non-esensial. Data penting minimal memakai `muted`.
- **Status:** tidak hanya warna; selalu ada teks dan ikon.
- Target sentuh minimal 40×40 di mobile.

---

## 12. Warna status data
| Konteks | Nilai | Token | Teks |
|---|---|---|---|
| Badge status | Bonding | `orange` | BONDING |
| | Graduated · awaiting expansion | `blue` | GRADUATED · AWAITING EXPANSION (ringkas di kartu: GRADUATED) |
| | Expanding | `blue` + progres | EXPANDING |
| | Locked | `mint` | LOCKED |
| | Changed | `danger` | CHANGED |
| Label pathway Check | 1-of-1 | `danger` | 1-OF-1 |
| | 2+ | `caution` | 2+ |
| | 2+ & locked | `mint` | 2+ · LOCKED |
| | Unread (RPC gagal) | `muted` | NOT READ |
| Langkah graduation | pending / ok / failed | `dim` / `mint` / `danger` | — |
| Kontrak | Planned / Deployed / Verified | `orange` / `blue` / `mint` | — |

---

## 13. Rekomendasi peningkatan (tidak wajib Phase 1)
1. Kartu OG Check bergaya terminal: badge besar, label warna per pathway, dan "checked at".
2. Skeleton loading bergaya terminal (kursor berkedip) untuk Check.
3. Halaman `/t/[address]`: mini-scene koin yang mencerminkan tier dan status token (hanya bila performa aman).
4. Mode kontras tinggi (border lebih tegas) untuk pengguna dengan preferensi `prefers-contrast: more`.

---

## 14. Keputusan desain

Item `[Belum]` diputuskan owner atau desainer. Sampai diputuskan, pakai rekomendasi.

| # | Topik | Fakta | Rekomendasi |
|---|---|---|---|
| D1 | Panel review "coin-lab" (kanan bawah) | HTML: "REVIEW ONLY: remove once one is chosen" | **Tidak di-port.** Simpan pilihan sebagai konstanta |
| D2 | Mekanisme buka koin: *split* vs *vault* | Default HTML = split | [Belum] owner. Sementara pakai **split** |
| D3 | Font | HTML memakai Arial + system mono | [Belum] owner. Usulan Inter Tight + JetBrains Mono via `next/font`; fallback Arial |
| D4 | NoticeBar | HTML: "CONCEPT / NOT LIVE" | Tetap ada; teks mengikuti mode (§10.2) |
| D5 | Galaxy WebGL di mobile | HTML menyalakan di semua ukuran (opacity .42 di layar kecil) | Matikan di ≤860px; pakai fallback 2D + gem CSS |
| D6 | Latar galaxy di halaman aplikasi | Tidak ada di HTML | Pakai heat glow CSS + bintang 2D statis; tanpa koin pengembara |
| D7 | Side index & cursor aura | Desktop only di HTML | Tetap, desktop + pointer fine saja |
| D8 | Launch form & bridge di landing | Demo di HTML | Tetap sebagai pratinjau berlabel; CTA mengarah ke `/launch` dan `/bridge` |
| D9 | `localStorage` `xofn-coin-lab` | Milik panel review | Tidak dipakai (ikut D1) |
| D10 | Label versi konsep di copy | "COINFALL V8", "CONCEPT 008", "V5" | Hapus dari produksi |
| D11 | Dua nilai mint (`#b5ffe5`/`#6af0d5` vs `#baffdf`/`#7cf7c9`) | Lapisan CSS berbeda | Satukan ke nilai PAL (`#b5ffe5`/`#6af0d5`) |
| D12 | Nav: anchor (HTML) vs route aplikasi | HTML hanya anchor | Nav route: Explore · Check · Launch · Bridge · Proof · Contracts; anchor tetap di `/` |
| D13 | Warna "2+" (brief: kuning) | HTML tidak punya kuning (hanya oranye) | Token baru `caution #ffd97a` agar tidak tertukar dengan Bonding (oranye) |
| D14 | Tier card `role=button` | HTML | Ubah ke `radiogroup` + `radio` |
| D15 | Home chain di HTML = Base; guide v1.0 = Robinhood | Chip hero, node graduation, stasiun 3D, launch form, bridge, warna titik chain | Copy & 3D mengikuti guide (tabel §10.2a). Warna menurut peran: Robinhood (home) mint, Base biru, Arbitrum violet. **Deviasi disengaja dari HTML** |
| D16 | Status "Graduated · awaiting expansion" [Guide] dan "Expanding" [Usulan] tidak ada di HTML | HTML hanya Bonding/Locked. Guide hanya punya "Lulus, menunggu ekspansi"; "Expanding" adalah tambahan dokumen (`PRD.md` P25) | Pakai warna `blue` (`.status.blue` HTML); format badge `XofN 2+1/2 · <status>`; filter Explore menambah "Graduated" (token Expanding ikut di filter ini) |
| D17 | Copy operator tier selama P1 belum diputuskan | HTML menyebut Google Cloud dan Polyhedra sebagai operator wajib. Phase 0: Google tidak ada di Robinhood, Polyhedra deprecated atau tidak ada, jadi teks itu tidak boleh di-port | [Usulan] Tier card dan sampel Check menampilkan **jumlah** ("2 required DVNs · 1 of 2 optional", "3 required DVNs · 1 of 2 optional"). Nama yang sudah pasti boleh disebut: LayerZero Labs (wajib), Deutsche Telekom dan FCAT (opsional). Slot wajib lain ditulis "operator to be confirmed". Setelah P1 diputuskan, nama dibaca dari `config/tiers.json` |
| D18 | NoticeBar preview berbunyi "NO … LIVE VERIFICATION", sedangkan XofN Check tetap membaca chain di mode preview | Teks HTML ditulis saat semua masih konsep | [Usulan] Phase 1 memakai teks §10.2 apa adanya (Check masih demo). Saat Check nyata masuk di Phase 2, teks diganti menjadi `PREVIEW / NOT LIVE · NO TOKEN SALE · CHECK READS PUBLIC CHAIN DATA` |

---

## 15. Status implementasi

| Area | Status |
|---|---|
| Token & tipografi (`globals.css`, `layout.tsx`) | **Selesai (Phase 1, 17 Nov 2026).** Token di `@theme`; baseline CSS V8 diekstrak ke `src/app/styles/baseline.css`; font Inter Tight + JetBrains Mono (D3) |
| Chrome (NoticeBar, Nav, Footer, overlay) | **Selesai (Phase 1, 17 Nov 2026).** Nav D12, menu mobile, modal dengan fokus terjebak, toast, scroll progress, side index, cursor aura |
| Section landing 1–16 | **Selesai (Phase 1, 17 Nov 2026)**, mode preview. Copy home chain D15, status D16, copy operator D17 |
| 3D hero / arch / galaxy | **Selesai (Phase 1, 17 Nov 2026).** three 0.187, lifecycle + dispose, fallback statis, galaxy mati di ≤860px (D5), mekanisme *split* (D2) |
| Halaman aplikasi (§6.2) | **`/check` dan `/check/[chain]/[address]` selesai (Phase 2, 17 Nov 2026)**, termasuk kartu OG. **`/launch`, `/t/[address]`, `/bridge`, `/contracts`, `/proof` selesai (Phase 4, 17 Nov 2026)** untuk mode simulation; di preview halaman itu memakai section landing berlabel |

Catatan implementasi Phase 1:
- **Preflight Tailwind tidak dimuat.** Baseline ditulis di atas default browser, jadi hanya layer `theme` dan `utilities` yang dipakai. Utilitas border Tailwind perlu `border-solid` eksplisit.
- **CSS baseline dipertahankan sebagai stylesheet berlapis** (`.v2 … .v8` di `<body>`), bukan ditulis ulang menjadi utilitas, supaya paritas visual terjaga. Warna di dalamnya belum semuanya memakai token; normalisasi bertahap adalah pekerjaan lanjutan.
- Style inline ber-hex di markup HTML dipindah ke kelas di `globals.css` dan dinormalkan ke token terdekat.
- Heading dipecah per baris di JSX (`SplitHeading`), tidak lewat `innerHTML` saat runtime.
- Perbaikan di luar baseline: fokus terlihat (`:focus-visible` mint), kontras judul langkah graduation, baris baru di rincian modal, tautan Connect Wallet di menu mobile.

Catatan implementasi Phase 2:
- Halaman aplikasi memakai kelas `.app-page` dan komponen terminal landing; latarnya heat glow CSS + langit bintang 2D tanpa konteks WebGL (D6).
- Label Check: `1-OF-1` (danger), `2+` (caution, D13), `2+ · LOCKED` (mint), `BLOCKED` dan `NOT READ` (muted). Setiap label punya ikon dan teks, tidak hanya warna.
- **Pengecualian hex kedua:** `src/lib/design-tokens.ts` mencerminkan token untuk `ImageResponse` (kartu OG), yang tidak bisa membaca variabel CSS. Nilainya wajib sama dengan `@theme`.
- D18 diterapkan: NoticeBar preview berbunyi `NO TOKEN SALE · CHECK READS PUBLIC CHAIN DATA`.

Catatan implementasi Phase 4:
- Komponen baru: `ui/{status-pill,progress-bar,empty-state,tx-status}`, `badge/{tier-badge,dvn-list}`, `token/{token-card,token-view,trade-panel,explore-live}`, `launch/{launch-fields,launch-form}`, `graduation/`, `expansion/`, `bridge/`, `proof/contract-table`, `wallet/*`. `LaunchFields` dan `TokenCard` dipakai bersama oleh section landing (pratinjau) dan halaman aplikasi.
- Kelas baru di `globals.css` (blok "Halaman aplikasi Phase 4") memakai token `@theme` saja, tanpa hex baru.
- TierBadge berupa tombol (`aria-expanded`) yang membuka DvnList di bawahnya, bukan popover. Status transaksi berupa teks (`Confirm in wallet…`, `Pending…`) di wilayah `aria-live`.
- Tabel lebar (`.data-table`) bergulir di dalam panelnya; tidak ada overflow horizontal di 390/768/1280/1680px (diukur lewat emulasi viewport CDP).
- Kontrol relay lokal memakai warna `caution` dan label SIMULATION supaya tidak tertukar dengan langkah protokol.

Perbarui tabel ini di akhir setiap task UI, lengkap dengan tanggal.
